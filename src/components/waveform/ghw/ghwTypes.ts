// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * The type table of a GHW file (`TYP`, `WKT`): enumerations with their literals,
 * scalars, arrays and records, as GHDL's `libghw` describes them. Pure.
 */

import { WaveParseError } from '../model';
import type { Reader } from './ghwReader';

/** `ghdl_rtik` values of the type table. */
export const RTIK = {
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
const RANGE_DOWNTO = 0x80;
/** A section's four header bytes before its contents. */
export const SECTION_HEADER_LENGTH = 4;

export interface EnumGhwType {
  readonly kind: typeof RTIK.b2 | typeof RTIK.e8 | typeof RTIK.e32;
  readonly name: string;
  readonly literals: readonly string[];
  /** The well-known type it is (`WKT`): boolean, bit, std_ulogic; 0 for any other. */
  wkt: number;
}
export interface ScalarGhwType {
  readonly kind: typeof RTIK.i32 | typeof RTIK.i64 | typeof RTIK.f64;
  readonly name: string;
}
export interface PhysicalGhwType {
  readonly kind: typeof RTIK.p32 | typeof RTIK.p64;
  readonly name: string;
  /** The name of its first unit (`fs` for `time`). */
  readonly unit: string;
}
export interface Range {
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
export interface SubArrayGhwType {
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

export type GhwType =
  | EnumGhwType
  | ScalarGhwType
  | PhysicalGhwType
  | SubScalarGhwType
  | ArrayGhwType
  | SubArrayGhwType
  | RecordGhwType
  | SubRecordGhwType;

export type ScalarBase = EnumGhwType | ScalarGhwType | PhysicalGhwType;
export type RecordLike = RecordGhwType | SubRecordGhwType;

export function scalarBase(type: GhwType): ScalarBase | undefined {
  if (type.kind === RTIK.subtypeScalar) return scalarBase(type.base);
  if (type.kind <= RTIK.p64) return type as ScalarBase;
  return undefined;
}

export const isRecordLike = (type: GhwType): type is RecordLike => type.kind === RTIK.record || type.kind === RTIK.subtypeRecord;

/** How many basic signals one signal of this type is; -1 for an unbounded array. */
export function scalarCount(type: GhwType): number {
  if (type.kind === RTIK.subtypeArray || isRecordLike(type)) return type.scalars;
  return type.kind === RTIK.array ? -1 : 1;
}

function rangeLength(range: Range): number {
  return Math.max(0, range.downto ? range.left - range.right + 1 : range.right - range.left + 1);
}

/** What a type table holds and refers to: the strings read before it, the types so far. */
export interface Header {
  strings: string[];
  types: GhwType[];
}

/** Reads names and type references of a table: shared by the type and hierarchy readers. */
export class TableReader {
  constructor(
    protected readonly r: Reader,
    protected readonly header: Header,
  ) {}

  protected string(): string {
    return this.header.strings[this.r.uleb()] ?? '';
  }

  protected typeRef(): GhwType {
    const type = this.header.types[this.r.uleb() - 1];
    if (type === undefined) throw new WaveParseError('The waveform file refers to a type it does not define.');
    return type;
  }
}

type KindReader = (kind: number) => GhwType;

export class TypeReader extends TableReader {
  private readonly byKind: ReadonlyMap<number, KindReader> = new Map<number, KindReader>([
    [RTIK.b2, (kind) => this.enumeration(kind as EnumGhwType['kind'])],
    [RTIK.e8, (kind) => this.enumeration(kind as EnumGhwType['kind'])],
    [RTIK.e32, (kind) => this.enumeration(kind as EnumGhwType['kind'])],
    [RTIK.i32, (kind) => ({ kind: kind as ScalarGhwType['kind'], name: this.string() })],
    [RTIK.i64, (kind) => ({ kind: kind as ScalarGhwType['kind'], name: this.string() })],
    [RTIK.f64, (kind) => ({ kind: kind as ScalarGhwType['kind'], name: this.string() })],
    [RTIK.p32, (kind) => this.physical(kind as PhysicalGhwType['kind'])],
    [RTIK.p64, (kind) => this.physical(kind as PhysicalGhwType['kind'])],
    [RTIK.subtypeScalar, () => this.subtypeScalar()],
    [RTIK.array, () => this.array()],
    [RTIK.subtypeArray, () => this.subtypeArray()],
    [RTIK.record, () => this.record()],
    [RTIK.subtypeRecord, () => this.subtypeRecord()],
  ]);

  read(): void {
    this.r.skip(SECTION_HEADER_LENGTH);
    const count = this.r.i32();
    for (let i = 0; i < count; i++) this.header.types.push(this.one(this.r.byte()));
    if (this.r.byte() !== 0) throw new WaveParseError('The waveform file has a damaged type table.');
  }

  /** `WKT`: which enumerations are boolean, bit and std_ulogic. */
  readWellKnown(): void {
    this.r.skip(SECTION_HEADER_LENGTH);
    for (let wkt = this.r.byte(); wkt !== 0; wkt = this.r.byte()) {
      const type = this.typeRef();
      if (type.kind === RTIK.b2 || type.kind === RTIK.e8) type.wkt = wkt;
    }
  }

  private one(kind: number): GhwType {
    const read = this.byKind.get(kind);
    if (read === undefined) throw new WaveParseError(`The waveform file has a type of an unknown kind (${kind}).`);
    return read(kind);
  }

  private list<T>(readItem: () => T): T[] {
    const n = this.r.uleb();
    const items: T[] = [];
    for (let j = 0; j < n; j++) items.push(readItem());
    return items;
  }

  private enumeration(kind: EnumGhwType['kind']): EnumGhwType {
    const name = this.string();
    return { kind, name, literals: this.list(() => this.string()), wkt: 0 };
  }

  private physical(kind: PhysicalGhwType['kind']): PhysicalGhwType {
    const name = this.string();
    const units = this.list(() => {
      const unitName = this.string();
      this.r.sleb(); // the unit's value, not needed for display
      return unitName;
    });
    return { kind, name, unit: units[0] ?? '' };
  }

  private subtypeScalar(): SubScalarGhwType {
    const name = this.string();
    const base = this.typeRef();
    this.range();
    return { kind: RTIK.subtypeScalar, name, base };
  }

  private array(): ArrayGhwType {
    const name = this.string();
    const element = this.typeRef();
    const dims = this.list(() => this.typeRef()).length;
    return { kind: RTIK.array, name, element, dims };
  }

  private subtypeArray(): SubArrayGhwType {
    const name = this.string();
    const base = this.typeRef();
    const array = base.kind === RTIK.subtypeArray ? base.base : base;
    if (array.kind !== RTIK.array) throw new WaveParseError('The waveform file has an array subtype of a non-array type.');
    return this.arraySubtype(name, array);
  }

  private record(): RecordGhwType {
    const name = this.string();
    const fields = this.list(() => ({ name: this.string(), type: this.typeRef() }));
    const counts = fields.map((field) => scalarCount(field.type));
    const scalars = counts.some((n) => n < 0) ? -1 : counts.reduce((sum, n) => sum + n, 0);
    return { kind: RTIK.record, name, fields, scalars };
  }

  private subtypeRecord(): SubRecordGhwType {
    const name = this.string();
    const base = this.typeRef();
    const record = base.kind === RTIK.subtypeRecord ? base.base : base;
    if (record.kind !== RTIK.record) throw new WaveParseError('The waveform file has a record subtype of a non-record type.');
    return this.recordSubtype(name, record);
  }

  private range(): Range {
    const t = this.r.byte();
    const kind = t & RANGE_KIND_MASK;
    const downto = (t & RANGE_DOWNTO) !== 0;
    if (kind === RTIK.b2 || kind === RTIK.e8) return { kind, downto, left: this.r.byte(), right: this.r.byte() };
    if (kind === RTIK.f64) return { kind, downto, left: this.r.f64(), right: this.r.f64() };
    if (kind >= RTIK.i32 && kind <= RTIK.p64) return { kind, downto, left: this.r.sleb(), right: this.r.sleb() };
    throw new WaveParseError(`The waveform file has a range of an unknown kind (${kind}).`);
  }

  private arraySubtype(name: string, base: ArrayGhwType): SubArrayGhwType {
    const ranges: Range[] = [];
    for (let d = 0; d < base.dims; d++) ranges.push(this.range());
    const count = ranges.reduce((product, range) => product * rangeLength(range), 1);
    // An element type that is itself unbounded gets its bounds here.
    const element = scalarCount(base.element) >= 0 ? base.element : this.bounds(base.element);
    return { kind: RTIK.subtypeArray, name, base, ranges, element, scalars: count * scalarCount(element) };
  }

  private recordSubtype(name: string, base: RecordGhwType): SubRecordGhwType {
    if (base.scalars >= 0) return { kind: RTIK.subtypeRecord, name, base, fields: base.fields, scalars: base.scalars };
    const fields = base.fields.map((field) => ({
      name: field.name,
      type: scalarCount(field.type) >= 0 ? field.type : this.bounds(field.type),
    }));
    const scalars = fields.reduce((sum, field) => sum + scalarCount(field.type), 0);
    return { kind: RTIK.subtypeRecord, name, base, fields, scalars };
  }

  private bounds(type: GhwType): GhwType {
    if (type.kind === RTIK.array) return this.arraySubtype('', type);
    if (type.kind === RTIK.record) return this.recordSubtype('', type);
    if (type.kind === RTIK.subtypeArray) return this.arraySubtype('', type.base);
    if (type.kind === RTIK.subtypeRecord) return this.recordSubtype('', type.base);
    throw new WaveParseError('The waveform file has bounds for a type that has none.');
  }
}
