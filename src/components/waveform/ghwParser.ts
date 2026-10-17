// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * GHW bytes → `WaveformData` (docs/waveform_viewer_spec.md § 8.3). GHW is GHDL's own
 * waveform format and carries every VHDL type – above all enumerations, so a state
 * machine's state is shown by name (W2).
 *
 * The layout follows GHDL's reader `libghw` (GPL-2.0-or-later): a header, then sections
 * tagged `STR`, `TYP`, `WKT`, `HIE`, `EOH`, followed by snapshots (`SNP`) and cycles
 * (`CYC`). Numbers are LEB128; a basic signal is one scalar, and a declared signal is
 * one or more of them (a vector, a record).
 *
 * A run that was stopped leaves the file cut off anywhere. A cut inside the header is
 * an error; a cut inside the value data is the end of the data: everything up to the
 * last complete cycle is kept and `truncated` is set (§ 4). Pure.
 */

import {
  NO_TRACE,
  WaveParseError,
  type EnumType,
  type RunWaveStatus,
  type ScopeKind,
  type SignalKind,
  type SignalRef,
  type Trace,
  type TraceId,
  type WaveformData,
} from './model';
import { ScopeTree } from './scopeTree';
import { TraceBuilder } from './traceBuilder';

const MAGIC = 'GHDLwave\n';
const HEADER_LENGTH = 16;
const LITTLE_ENDIAN_MARK = 1;
const BIG_ENDIAN_MARK = 2;

/** `ghdl_rtik` values of the type table. */
const RTIK = {
  b2: 22,
  e8: 23,
  e32: 24,
  i32: 25,
  i64: 26,
  f64: 27,
  p32: 28,
  p64: 29,
  array: 31,
  record: 32,
  subtypeScalar: 34,
  subtypeArray: 35,
  subtypeRecord: 38,
} as const;
const RANGE_KIND_MASK = 0x7f;

/** `ghw_hie_kind` values of the hierarchy. */
const HIE = {
  end: 0,
  block: 3,
  generateIf: 4,
  generateFor: 5,
  instance: 6,
  package: 7,
  process: 13,
  generic: 14,
  endOfScope: 15,
  signal: 16,
  portIn: 17,
  portLinkage: 21,
} as const;

/** Well-known types (`WKT`): what an enumeration stands for. */
const WKT_BOOLEAN = 1;
const WKT_BIT = 2;
const WKT_STD_ULOGIC = 3;

const STRING_CONTINUES = 0x80;
const STRING_TERMINATOR_MAX = 31;
const STRING_CONTINUATION_MIN = 128;
const STRING_CONTINUATION_MAX = 159;
const PREFIX_BITS = 5;
const PREFIX_MASK = 0x1f;

const STD_ULOGIC_LITERALS = ["'U'", "'X'", "'0'", "'1'", "'Z'", "'W'", "'L'", "'H'", "'-'"];
const MAX_SAFE = BigInt(Number.MAX_SAFE_INTEGER);

/** The data ended in the middle of something. */
class EndOfData extends Error {}

// ---------------------------------------------------------------- types

interface EnumGhwType {
  readonly kind: typeof RTIK.b2 | typeof RTIK.e8 | typeof RTIK.e32;
  readonly name: string;
  readonly literals: readonly string[];
  wkt: number;
}
interface ScalarGhwType {
  readonly kind: typeof RTIK.i32 | typeof RTIK.i64 | typeof RTIK.f64;
  readonly name: string;
}
interface PhysicalGhwType {
  readonly kind: typeof RTIK.p32 | typeof RTIK.p64;
  readonly name: string;
  readonly unit: string;
}
interface Range {
  readonly kind: number;
  readonly downto: boolean;
  readonly left: number;
  readonly right: number;
}
interface SubScalarGhwType {
  readonly kind: typeof RTIK.subtypeScalar;
  readonly name: string;
  readonly base: GhwType;
}
interface ArrayGhwType {
  readonly kind: typeof RTIK.array;
  readonly name: string;
  readonly element: GhwType;
  readonly dims: number;
}
interface SubArrayGhwType {
  readonly kind: typeof RTIK.subtypeArray;
  readonly name: string;
  readonly base: ArrayGhwType;
  readonly ranges: readonly Range[];
  readonly element: GhwType;
  readonly scalars: number;
}
interface Field {
  readonly name: string;
  readonly type: GhwType;
}
interface RecordGhwType {
  readonly kind: typeof RTIK.record;
  readonly name: string;
  readonly fields: readonly Field[];
  /** -1 while a field is an unbounded array. */
  readonly scalars: number;
}
interface SubRecordGhwType {
  readonly kind: typeof RTIK.subtypeRecord;
  readonly name: string;
  readonly base: RecordGhwType;
  readonly fields: readonly Field[];
  readonly scalars: number;
}

type GhwType =
  | EnumGhwType
  | ScalarGhwType
  | PhysicalGhwType
  | SubScalarGhwType
  | ArrayGhwType
  | SubArrayGhwType
  | RecordGhwType
  | SubRecordGhwType;

type ScalarBase = EnumGhwType | ScalarGhwType | PhysicalGhwType;

function scalarBase(type: GhwType): ScalarBase | undefined {
  if (type.kind === RTIK.subtypeScalar) return scalarBase(type.base);
  if (type.kind <= RTIK.p64) return type as ScalarBase;
  return undefined;
}

/** How many basic signals one signal of this type is; -1 for an unbounded array. */
function scalarCount(type: GhwType): number {
  switch (type.kind) {
    case RTIK.subtypeArray:
    case RTIK.record:
    case RTIK.subtypeRecord:
      return type.scalars;
    case RTIK.array:
      return -1;
    default:
      return 1;
  }
}

function rangeLength(range: Range): number {
  const length = range.downto ? range.left - range.right + 1 : range.right - range.left + 1;
  return Math.max(0, length);
}

// ---------------------------------------------------------------- reader

class Reader {
  pos = 0;
  littleEndian = true;
  constructor(private readonly bytes: Uint8Array) {}

  get atEnd(): boolean {
    return this.pos >= this.bytes.length;
  }

  byte(): number {
    if (this.pos >= this.bytes.length) throw new EndOfData();
    return this.bytes[this.pos++];
  }

  skip(n: number): void {
    if (this.pos + n > this.bytes.length) throw new EndOfData();
    this.pos += n;
  }

  tag(): string {
    if (this.pos + 4 > this.bytes.length) throw new EndOfData();
    const b = this.bytes;
    const p = this.pos;
    this.pos += 4;
    return String.fromCharCode(b[p], b[p + 1], b[p + 2]) + (b[p + 3] === 0 ? '' : String.fromCharCode(b[p + 3]));
  }

  i32(): number {
    if (this.pos + 4 > this.bytes.length) throw new EndOfData();
    const view = new DataView(this.bytes.buffer, this.bytes.byteOffset + this.pos, 4);
    this.pos += 4;
    return view.getInt32(0, this.littleEndian);
  }

  i64(): number {
    if (this.pos + 8 > this.bytes.length) throw new EndOfData();
    const view = new DataView(this.bytes.buffer, this.bytes.byteOffset + this.pos, 8);
    this.pos += 8;
    return safeNumber(view.getBigInt64(0, this.littleEndian));
  }

  f64(): number {
    if (this.pos + 8 > this.bytes.length) throw new EndOfData();
    const view = new DataView(this.bytes.buffer, this.bytes.byteOffset + this.pos, 8);
    this.pos += 8;
    // libghw reads a double with `fread`: the writer's own byte order, little-endian in practice.
    return view.getFloat64(0, true);
  }

  /** Unsigned LEB128, small enough for a JavaScript number. */
  uleb(): number {
    // Most numbers in the cycles are one byte: signal deltas, std_logic values.
    if (this.pos < this.bytes.length && this.bytes[this.pos] < 0x80) return this.bytes[this.pos++];
    let result = 0;
    let scale = 1;
    for (;;) {
      const b = this.byte();
      result += (b & 0x7f) * scale;
      if ((b & 0x80) === 0) return result;
      scale *= 128;
    }
  }

  /** Signed LEB128. Numbers here are times, integers and ranges: exact while below 2^53. */
  sleb(): number {
    let result = 0;
    let scale = 1;
    for (;;) {
      const b = this.byte();
      result += (b & 0x7f) * scale;
      scale *= 128;
      if ((b & 0x80) === 0) {
        if (b & 0x40) result -= scale;
        return result;
      }
    }
  }
}

function safeNumber(value: bigint): number {
  if (value > MAX_SAFE || value < -MAX_SAFE) {
    throw new WaveParseError('The simulation ran too long to be shown exactly (more than 2^53 femtoseconds).');
  }
  return Number(value);
}

// ---------------------------------------------------------------- header sections

interface Header {
  strings: string[];
  types: GhwType[];
}

function readStrings(r: Reader): string[] {
  r.skip(4);
  const count = r.i32() + 1;
  r.i32(); // total size of the strings, not needed here
  const strings: string[] = ['<anon>'];
  let prefixLength = 0;
  const chars: number[] = [];
  for (let i = 1; i < count; i++) {
    const previous = i === 1 ? '' : strings[i - 1];
    chars.length = 0;
    let c: number;
    for (;;) {
      c = r.byte();
      if (c <= STRING_TERMINATOR_MAX || (c >= STRING_CONTINUATION_MIN && c <= STRING_CONTINUATION_MAX)) break;
      chars.push(c);
    }
    strings.push(previous.slice(0, prefixLength) + String.fromCharCode(...chars));
    // The terminator holds how much of this string the next one starts with.
    prefixLength = c & PREFIX_MASK;
    let shift = PREFIX_BITS;
    while (c & STRING_CONTINUES) {
      c = r.byte();
      prefixLength |= (c & PREFIX_MASK) << shift;
      shift += PREFIX_BITS;
    }
  }
  if (r.tag() !== 'EOS') throw new WaveParseError('The waveform file has a damaged string table.');
  return strings;
}

class TypeReader {
  constructor(
    private readonly r: Reader,
    private readonly header: Header,
  ) {}

  private string(): string {
    const index = this.r.uleb();
    return this.header.strings[index] ?? '';
  }

  private typeRef(): GhwType {
    const index = this.r.uleb();
    const type = this.header.types[index - 1];
    if (type === undefined) throw new WaveParseError('The waveform file refers to a type it does not define.');
    return type;
  }

  private range(): Range {
    const t = this.r.byte();
    const kind = t & RANGE_KIND_MASK;
    const downto = (t & 0x80) !== 0;
    switch (kind) {
      case RTIK.b2:
      case RTIK.e8:
        return { kind, downto, left: this.r.byte(), right: this.r.byte() };
      case RTIK.i32:
      case RTIK.p32:
      case RTIK.i64:
      case RTIK.p64:
        return { kind, downto, left: this.r.sleb(), right: this.r.sleb() };
      case RTIK.f64:
        return { kind, downto, left: this.r.f64(), right: this.r.f64() };
      default:
        throw new WaveParseError(`The waveform file has a range of an unknown kind (${kind}).`);
    }
  }

  private arraySubtype(name: string, base: ArrayGhwType): SubArrayGhwType {
    const ranges: Range[] = [];
    let count = 1;
    for (let d = 0; d < base.dims; d++) {
      const range = this.range();
      ranges.push(range);
      count *= rangeLength(range);
    }
    // An element type that is itself unbounded gets its bounds here.
    const element = scalarCount(base.element) >= 0 ? base.element : this.bounds(base.element);
    return { kind: RTIK.subtypeArray, name, base, ranges, element, scalars: count * scalarCount(element) };
  }

  private recordSubtype(name: string, base: RecordGhwType): SubRecordGhwType {
    if (base.scalars >= 0) return { kind: RTIK.subtypeRecord, name, base, fields: base.fields, scalars: base.scalars };
    let scalars = 0;
    const fields = base.fields.map((field) => {
      const type = scalarCount(field.type) >= 0 ? field.type : this.bounds(field.type);
      scalars += scalarCount(type);
      return { name: field.name, type };
    });
    return { kind: RTIK.subtypeRecord, name, base, fields, scalars };
  }

  private bounds(type: GhwType): GhwType {
    if (type.kind === RTIK.array) return this.arraySubtype('', type);
    if (type.kind === RTIK.record) return this.recordSubtype('', type);
    if (type.kind === RTIK.subtypeArray) return this.arraySubtype('', type.base);
    if (type.kind === RTIK.subtypeRecord) return this.recordSubtype('', type.base);
    throw new WaveParseError('The waveform file has bounds for a type that has none.');
  }

  read(): void {
    const r = this.r;
    r.skip(4);
    const count = r.i32();
    for (let i = 0; i < count; i++) this.header.types.push(this.one(r.byte()));
    if (r.byte() !== 0) throw new WaveParseError('The waveform file has a damaged type table.');
  }

  private one(kind: number): GhwType {
    switch (kind) {
      case RTIK.b2:
      case RTIK.e8:
      case RTIK.e32: {
        const name = this.string();
        const n = this.r.uleb();
        const literals: string[] = [];
        for (let j = 0; j < n; j++) literals.push(this.string());
        return { kind, name, literals, wkt: 0 };
      }
      case RTIK.i32:
      case RTIK.i64:
      case RTIK.f64:
        return { kind, name: this.string() };
      case RTIK.p32:
      case RTIK.p64: {
        const name = this.string();
        const units = this.r.uleb();
        let unit = '';
        for (let j = 0; j < units; j++) {
          const unitName = this.string();
          this.r.sleb();
          if (j === 0) unit = unitName;
        }
        return { kind, name, unit };
      }
      case RTIK.subtypeScalar: {
        const name = this.string();
        const base = this.typeRef();
        this.range();
        return { kind, name, base };
      }
      case RTIK.array: {
        const name = this.string();
        const element = this.typeRef();
        const dims = this.r.uleb();
        for (let j = 0; j < dims; j++) this.typeRef();
        return { kind, name, element, dims };
      }
      case RTIK.subtypeArray: {
        const name = this.string();
        const base = this.typeRef();
        const array = base.kind === RTIK.subtypeArray ? base.base : base;
        if (array.kind !== RTIK.array) throw new WaveParseError('The waveform file has an array subtype of a non-array type.');
        return this.arraySubtype(name, array);
      }
      case RTIK.record: {
        const name = this.string();
        const n = this.r.uleb();
        const fields: Field[] = [];
        let scalars = 0;
        for (let j = 0; j < n; j++) {
          const field = { name: this.string(), type: this.typeRef() };
          fields.push(field);
          const fieldScalars = scalarCount(field.type);
          scalars = scalars < 0 || fieldScalars < 0 ? -1 : scalars + fieldScalars;
        }
        return { kind, name, fields, scalars };
      }
      case RTIK.subtypeRecord: {
        const name = this.string();
        const base = this.typeRef();
        const record = base.kind === RTIK.subtypeRecord ? base.base : base;
        if (record.kind !== RTIK.record) throw new WaveParseError('The waveform file has a record subtype of a non-record type.');
        return this.recordSubtype(name, record);
      }
      default:
        throw new WaveParseError(`The waveform file has a type of an unknown kind (${kind}).`);
    }
  }

  readWellKnown(): void {
    const r = this.r;
    r.skip(4);
    for (;;) {
      const wkt = r.byte();
      if (wkt === 0) return;
      const type = this.typeRef();
      if (type.kind === RTIK.b2 || type.kind === RTIK.e8) type.wkt = wkt;
    }
  }
}

// ---------------------------------------------------------------- values

/**
 * A basic signal's value is kept as a number – the literal's position, the integer, the
 * real – and turned into text only when a trace needs it: the cycles are the hot path.
 */
function readRaw(r: Reader, base: ScalarBase): number {
  switch (base.kind) {
    case RTIK.b2:
    case RTIK.e8:
      return r.byte();
    case RTIK.f64:
      return r.f64();
    default:
      return r.sleb();
  }
}

function isLogicType(base: ScalarBase): boolean {
  if (base.kind !== RTIK.b2 && base.kind !== RTIK.e8) return false;
  if (base.wkt === WKT_STD_ULOGIC || base.wkt === WKT_BIT || base.wkt === WKT_BOOLEAN) return true;
  const literals = base.literals.join(',');
  return literals === STD_ULOGIC_LITERALS.join(',') || literals === "'0','1'" || literals === 'false,true';
}

function isCharacterType(base: ScalarBase): boolean {
  return base.kind === RTIK.e8 && base.name.toLowerCase() === 'character';
}

/** A logic value as one upper-case character (`'U'` → `U`, `true` → `1`); any other literal as written. */
function literalText(base: EnumGhwType, index: number): string {
  const literal = base.literals[index] ?? '?';
  if (!isLogicType(base)) return literal;
  if (literal === 'false') return '0';
  if (literal === 'true') return '1';
  return literal.length === 3 && literal[0] === "'" ? literal[1].toUpperCase() : literal;
}

/** Turns a raw value of one scalar type into text; enumerations through a table made once. */
function textMaker(base: ScalarBase): (raw: number) => string {
  switch (base.kind) {
    case RTIK.b2:
    case RTIK.e8:
    case RTIK.e32: {
      const texts = base.literals.map((_, i) => literalText(base, i));
      return (raw) => texts[raw] ?? '?';
    }
    case RTIK.p32:
    case RTIK.p64:
      return (raw) => `${raw} ${base.unit}`;
    default:
      return (raw) => String(raw);
  }
}

function readValue(r: Reader, base: ScalarBase): string {
  return textMaker(base)(readRaw(r, base));
}

// ---------------------------------------------------------------- hierarchy

/** One shown signal: the basic signals it is made of and how their values combine into its text. */
interface Leaf {
  readonly trace: TraceId;
  readonly sigs: readonly number[];
  readonly combine: 'single' | 'concat';
}

interface Hierarchy {
  /** The type of each basic signal the hierarchy names, by its number. */
  readonly basics: Map<number, ScalarBase>;
  readonly leaves: Leaf[];
  readonly tree: ScopeTree;
}

class HierarchyReader {
  private readonly leafByKey = new Map<string, Leaf>();
  readonly result: Hierarchy = { basics: new Map(), leaves: [], tree: new ScopeTree() };

  constructor(
    private readonly r: Reader,
    private readonly header: Header,
  ) {}

  private string(): string {
    return this.header.strings[this.r.uleb()] ?? '';
  }

  private typeRef(): GhwType {
    const type = this.header.types[this.r.uleb() - 1];
    if (type === undefined) throw new WaveParseError('The waveform file refers to a type it does not define.');
    return type;
  }

  /** The basic signal numbers of one signal of `type`, in element order. */
  private readSigs(type: GhwType, into: number[]): void {
    switch (type.kind) {
      case RTIK.subtypeArray: {
        const stride = scalarCount(type.element);
        for (let i = 0; i < type.scalars; i += stride) this.readSigs(type.element, into);
        return;
      }
      case RTIK.record:
      case RTIK.subtypeRecord:
        for (const field of type.fields) this.readSigs(field.type, into);
        return;
      case RTIK.array:
        throw new WaveParseError('The waveform file has a signal of an unbounded array type.');
      default: {
        const sig = this.r.uleb();
        const base = scalarBase(type);
        if (base === undefined) throw new WaveParseError('The waveform file has a signal of an unknown type.');
        if (!this.result.basics.has(sig)) this.result.basics.set(sig, base);
        into.push(sig);
      }
    }
  }

  private leaf(sigs: readonly number[], combine: Leaf['combine']): TraceId {
    const key = `${combine}:${sigs.join(',')}`;
    let leaf = this.leafByKey.get(key);
    if (leaf === undefined) {
      leaf = { trace: this.result.leaves.length, sigs, combine };
      this.leafByKey.set(key, leaf);
      this.result.leaves.push(leaf);
    }
    return leaf.trace;
  }

  /** The model's view of one signal of `type` whose basic signals are `sigs`. */
  private signalRef(name: string, type: GhwType, sigs: readonly number[]): SignalRef {
    switch (type.kind) {
      case RTIK.subtypeArray: {
        const elementBase = scalarBase(type.element);
        const range = type.ranges[0];
        if (type.ranges.length === 1 && elementBase !== undefined && isLogicType(elementBase)) {
          return { name, trace: this.leaf(sigs, 'concat'), kind: 'vector', width: sigs.length, range: { left: range.left, right: range.right } };
        }
        const stride = scalarCount(type.element);
        const fields: SignalRef[] = [];
        const step = range !== undefined && range.downto ? -1 : 1;
        for (let i = 0, index = range?.left ?? 0; i < sigs.length; i += stride, index += step) {
          const label = type.ranges.length === 1 ? `${name}(${index})` : `${name}(${i / stride})`;
          fields.push(this.signalRef(label, type.element, sigs.slice(i, i + stride)));
        }
        return { name, trace: NO_TRACE, kind: 'array', width: sigs.length, fields };
      }
      case RTIK.record:
      case RTIK.subtypeRecord: {
        const fields: SignalRef[] = [];
        let offset = 0;
        for (const field of type.fields) {
          const n = scalarCount(field.type);
          fields.push(this.signalRef(field.name, field.type, sigs.slice(offset, offset + n)));
          offset += n;
        }
        return { name, trace: NO_TRACE, kind: 'record', width: sigs.length, fields };
      }
      default:
        return this.scalarRef(name, scalarBase(type), sigs);
    }
  }

  private scalarRef(name: string, base: ScalarBase | undefined, sigs: readonly number[]): SignalRef {
    const trace = this.leaf(sigs, 'single');
    if (base === undefined) return { name, trace, kind: 'integer', width: 1 };
    if (isLogicType(base)) return { name, trace, kind: 'logic', width: 1 };
    if (isCharacterType(base)) return { name, trace, kind: 'character', width: 1 };
    if (base.kind === RTIK.b2 || base.kind === RTIK.e8 || base.kind === RTIK.e32) {
      const enumType: EnumType = { name: base.name, literals: base.literals };
      return { name, trace, kind: 'enum', width: 1, enumType };
    }
    const kind: SignalKind = base.kind === RTIK.f64 ? 'real' : 'integer';
    return { name, trace, kind, width: 1 };
  }

  read(): void {
    const r = this.r;
    r.skip(4);
    r.i32(); // scopes
    r.i32(); // declared signals
    r.i32(); // basic signals
    const tree = this.result.tree;
    for (;;) {
      const kind = r.byte();
      if (kind === HIE.end) return;
      if (kind === HIE.endOfScope) {
        tree.leave();
        continue;
      }
      const name = this.string();
      if (kind === HIE.process) continue;
      if (kind >= HIE.signal && kind <= HIE.portLinkage) {
        const type = this.typeRef();
        const sigs: number[] = [];
        this.readSigs(type, sigs);
        tree.addSignal(this.signalRef(name, type, sigs));
        continue;
      }
      if (kind === HIE.block || kind === HIE.generateIf || kind === HIE.generateFor || kind === HIE.instance || kind === HIE.package || kind === HIE.generic) {
        let label = name;
        if (kind === HIE.generateFor) {
          const iterType = this.typeRef();
          const base = scalarBase(iterType);
          if (base === undefined) throw new WaveParseError('The waveform file has a for-generate over an unknown type.');
          label = `${name}(${readValue(r, base)})`;
        }
        const scopeKind: ScopeKind = kind === HIE.package ? 'package' : 'instance';
        tree.enter(label, scopeKind);
        continue;
      }
      throw new WaveParseError(`The waveform file has a hierarchy entry of an unknown kind (${kind}).`);
    }
  }
}

// ---------------------------------------------------------------- value data

class ValueReader {
  private readonly builders: TraceBuilder[];
  /** By position among the basic signals with a type, ascending – a cycle counts its deltas through these. */
  private readonly bases: ScalarBase[];
  private readonly raw: Float64Array;
  private readonly texts: Array<(raw: number) => string>;
  /** The leaves each position is part of. */
  private readonly leavesAt: number[][];
  /** By leaf: its basic signals as positions. */
  private readonly leafPositions: number[][];
  private readonly leafCombine: boolean[];
  /** The cycle that last touched each leaf, so a leaf changed twice in one cycle is updated once. */
  private readonly stamp: Int32Array;
  private cycle = 0;
  private readonly touched: Int32Array;
  /**
   * One cycle's changes, read completely before any is applied. Typed arrays with a
   * count, not `length = 0` on an array, which costs a runtime call on every cycle.
   */
  private readonly changedAt: Int32Array;
  private readonly changedRaw: Float64Array;
  private changed = 0;
  endTime = 0;
  truncated = false;

  constructor(
    private readonly r: Reader,
    h: Hierarchy,
  ) {
    const order = [...h.basics.keys()].sort((a, b) => a - b);
    const positionOf = new Map<number, number>();
    order.forEach((sig, i) => positionOf.set(sig, i));
    this.bases = order.map((sig) => h.basics.get(sig)!);
    this.raw = new Float64Array(order.length);
    this.texts = this.bases.map(textMaker);
    this.leavesAt = order.map(() => []);
    this.leafPositions = h.leaves.map((leaf) => leaf.sigs.map((sig) => positionOf.get(sig)!));
    this.leafCombine = h.leaves.map((leaf) => leaf.combine === 'concat');
    this.leafPositions.forEach((positions, leaf) => {
      for (const p of positions) if (!this.leavesAt[p].includes(leaf)) this.leavesAt[p].push(leaf);
    });
    this.builders = h.leaves.map(() => new TraceBuilder());
    this.stamp = new Int32Array(h.leaves.length).fill(-1);
    this.touched = new Int32Array(h.leaves.length);
    this.changedAt = new Int32Array(order.length);
    this.changedRaw = new Float64Array(order.length);
  }

  private text(leaf: number): string {
    const positions = this.leafPositions[leaf];
    if (!this.leafCombine[leaf]) return this.texts[positions[0]](this.raw[positions[0]]);
    let text = '';
    for (const p of positions) text += this.texts[p](this.raw[p]);
    return text;
  }

  /** Applies one complete set of changes at `time`. */
  private commit(time: number): void {
    const cycle = ++this.cycle;
    const { changedAt, changedRaw, raw, stamp, leavesAt, touched } = this;
    let nTouched = 0;
    for (let i = 0; i < this.changed; i++) {
      const p = changedAt[i];
      raw[p] = changedRaw[i];
      const leaves = leavesAt[p];
      for (let j = 0; j < leaves.length; j++) {
        const leaf = leaves[j];
        if (stamp[leaf] !== cycle) {
          stamp[leaf] = cycle;
          touched[nTouched++] = leaf;
        }
      }
    }
    for (let i = 0; i < nTouched; i++) this.builders[touched[i]].change(time, this.text(touched[i]));
    if (time > this.endTime) this.endTime = time;
  }

  private snapshot(): void {
    const r = this.r;
    r.skip(4);
    const time = r.i64();
    for (let p = 0; p < this.bases.length; p++) {
      this.changedAt[p] = p;
      this.changedRaw[p] = readRaw(r, this.bases[p]);
    }
    this.changed = this.bases.length;
    if (r.tag() !== 'ESN') throw new WaveParseError('The waveform file has a damaged snapshot.');
    this.commit(time);
  }

  private cycles(): void {
    const r = this.r;
    const { changedAt, changedRaw, bases } = this;
    const count = bases.length;
    let time = r.i64();
    for (;;) {
      let n = 0;
      let position = -1;
      for (;;) {
        const delta = r.uleb();
        if (delta === 0) break;
        position += delta;
        if (position >= count) throw new WaveParseError('The waveform file names a signal it does not define.');
        changedAt[n] = position;
        changedRaw[n++] = readRaw(r, bases[position]);
      }
      this.changed = n;
      // Committed only once the cycle's list is complete: a cut inside it is not data.
      this.commit(time);
      const step = r.sleb();
      if (step === -1) break;
      time += step;
      if (time > Number.MAX_SAFE_INTEGER) {
        throw new WaveParseError('The simulation ran too long to be shown exactly (more than 2^53 femtoseconds).');
      }
    }
    if (r.tag() !== 'ECY') throw new WaveParseError('The waveform file has a damaged cycle.');
  }

  read(): void {
    try {
      while (!this.r.atEnd) {
        const tag = this.r.tag();
        if (tag === 'SNP') this.snapshot();
        else if (tag === 'CYC') this.cycles();
        else return; // `DIR`, `TAI`: the index at the end of a complete file
      }
    } catch (e) {
      if (!(e instanceof EndOfData)) throw e;
      this.truncated = true;
    }
  }

  traces(): Map<TraceId, Trace> {
    const traces = new Map<TraceId, Trace>();
    this.builders.forEach((builder, id) => traces.set(id, builder.build()));
    return traces;
  }
}

// ---------------------------------------------------------------- entry

function readHeader(r: Reader): void {
  if (r.atEnd) throw new WaveParseError('The waveform file is empty.');
  let magic = '';
  for (let i = 0; i < MAGIC.length; i++) magic += String.fromCharCode(r.byte());
  if (magic !== MAGIC) throw new WaveParseError('This is not a GHW waveform file.');
  const rest: number[] = [];
  for (let i = MAGIC.length; i < HEADER_LENGTH; i++) rest.push(r.byte());
  const [headerLength, major, , endian] = rest;
  if (headerLength !== HEADER_LENGTH || major !== 0) throw new WaveParseError('This GHW waveform file is of a version the viewer does not know.');
  if (endian !== LITTLE_ENDIAN_MARK && endian !== BIG_ENDIAN_MARK) throw new WaveParseError('This GHW waveform file has an unknown byte order.');
  r.littleEndian = endian === LITTLE_ENDIAN_MARK;
}

export function parseGhw(bytes: Uint8Array, status: RunWaveStatus = 'complete'): WaveformData {
  const r = new Reader(bytes);
  const header: Header = { strings: [], types: [] };
  let hierarchy: Hierarchy | undefined;
  try {
    readHeader(r);
    const types = new TypeReader(r, header);
    for (;;) {
      const tag = r.tag();
      if (tag === 'STR') header.strings = readStrings(r);
      else if (tag === 'TYP') types.read();
      else if (tag === 'WKT') types.readWellKnown();
      else if (tag === 'HIE') {
        const reader = new HierarchyReader(r, header);
        reader.read();
        hierarchy = reader.result;
      } else if (tag === 'EOH') break;
      else throw new WaveParseError(`The waveform file has a section the viewer does not know: ${tag}.`);
    }
  } catch (e) {
    if (e instanceof EndOfData) throw new WaveParseError('The waveform file ends before its list of signals is complete.');
    throw e;
  }
  if (hierarchy === undefined) throw new WaveParseError('The waveform file has no list of signals.');
  const values = new ValueReader(r, hierarchy);
  values.read();
  return {
    source: { format: 'ghw', status, truncated: values.truncated },
    tickFs: 1,
    endTime: values.endTime,
    root: hierarchy.tree.build(),
    traces: values.traces(),
  };
}
