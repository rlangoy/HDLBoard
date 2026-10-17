// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * The hierarchy of a GHW file (`HIE`): scopes, and the signals in them as the model's
 * `SignalRef`s – a std_logic vector as one vector, a record or an array of non-bits as
 * its fields, an enumeration with its literals. Each shown signal (a leaf) knows the
 * basic signals its value is made of. Pure.
 */

import { NO_TRACE, WaveParseError, type ScopeKind, type SignalKind, type SignalRef, type TraceId } from '../model';
import { ScopeTree } from '../scopeTree';
import {
  RTIK,
  SECTION_HEADER_LENGTH,
  TableReader,
  isRecordLike,
  scalarBase,
  scalarCount,
  type GhwType,
  type RecordLike,
  type ScalarBase,
  type SubArrayGhwType,
} from './ghwTypes';
import { isCharacterType, isLogicType, readValue } from './ghwValues';

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
  portLinkage: 21,
} as const;
const SCOPE_KINDS: readonly number[] = [HIE.block, HIE.generateIf, HIE.generateFor, HIE.instance, HIE.package, HIE.generic];
/** Scopes, declared signals, basic signals: counts the reader does not need. */
const HIERARCHY_COUNTS = 3;

/** One shown signal: the basic signals it is made of and how their values combine into its text. */
export interface Leaf {
  readonly trace: TraceId;
  readonly sigs: readonly number[];
  readonly combine: 'single' | 'concat';
}

export interface Hierarchy {
  /** The type of each basic signal the hierarchy names, by its number. */
  readonly basics: Map<number, ScalarBase>;
  readonly leaves: Leaf[];
  readonly tree: ScopeTree;
}

const isSignalEntry = (kind: number) => kind >= HIE.signal && kind <= HIE.portLinkage;
const ENUM_KINDS: readonly number[] = [RTIK.b2, RTIK.e8, RTIK.e32];

export class HierarchyReader extends TableReader {
  private readonly leafByKey = new Map<string, Leaf>();
  readonly result: Hierarchy = { basics: new Map(), leaves: [], tree: new ScopeTree() };

  read(): void {
    this.r.skip(SECTION_HEADER_LENGTH);
    for (let i = 0; i < HIERARCHY_COUNTS; i++) this.r.i32();
    for (let kind = this.r.byte(); kind !== HIE.end; kind = this.r.byte()) this.entry(kind);
  }

  private entry(kind: number): void {
    if (kind === HIE.endOfScope) return this.result.tree.leave();
    const name = this.string();
    if (kind === HIE.process) return;
    if (isSignalEntry(kind)) return this.signal(name);
    if (SCOPE_KINDS.includes(kind)) return this.scope(kind, name);
    throw new WaveParseError(`The waveform file has a hierarchy entry of an unknown kind (${kind}).`);
  }

  private signal(name: string): void {
    const type = this.typeRef();
    const sigs: number[] = [];
    this.readSigs(type, sigs);
    this.result.tree.addSignal(this.signalRef(name, type, sigs));
  }

  private scope(kind: number, name: string): void {
    const label = kind === HIE.generateFor ? `${name}(${this.generateIndex()})` : name;
    const scopeKind: ScopeKind = kind === HIE.package ? 'package' : 'instance';
    this.result.tree.enter(label, scopeKind);
  }

  /** The value of a for-generate's iterator, written after its type. */
  private generateIndex(): string {
    const base = scalarBase(this.typeRef());
    if (base === undefined) throw new WaveParseError('The waveform file has a for-generate over an unknown type.');
    return readValue(this.r, base);
  }

  /** The basic signal numbers of one signal of `type`, in element order. */
  private readSigs(type: GhwType, into: number[]): void {
    if (type.kind === RTIK.subtypeArray) {
      const stride = scalarCount(type.element);
      for (let i = 0; i < type.scalars; i += stride) this.readSigs(type.element, into);
    } else if (isRecordLike(type)) {
      for (const field of type.fields) this.readSigs(field.type, into);
    } else {
      into.push(this.readBasic(type));
    }
  }

  private readBasic(type: GhwType): number {
    if (type.kind === RTIK.array) throw new WaveParseError('The waveform file has a signal of an unbounded array type.');
    const sig = this.r.uleb();
    const base = scalarBase(type);
    if (base === undefined) throw new WaveParseError('The waveform file has a signal of an unknown type.');
    if (!this.result.basics.has(sig)) this.result.basics.set(sig, base);
    return sig;
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
    if (type.kind === RTIK.subtypeArray) return this.arrayRef(name, type, sigs);
    if (isRecordLike(type)) return this.recordRef(name, type, sigs);
    return this.scalarRef(name, scalarBase(type), sigs);
  }

  /** A one-dimensional array of bits is a vector; any other array shows its elements. */
  private arrayRef(name: string, type: SubArrayGhwType, sigs: readonly number[]): SignalRef {
    const elementBase = scalarBase(type.element);
    const [range] = type.ranges;
    if (type.ranges.length === 1 && elementBase !== undefined && isLogicType(elementBase)) {
      return { name, trace: this.leaf(sigs, 'concat'), kind: 'vector', width: sigs.length, range: { left: range.left, right: range.right } };
    }
    const labels = elementLabels(name, type, sigs.length);
    const stride = scalarCount(type.element);
    const fields = labels.map((label, k) => this.signalRef(label, type.element, sigs.slice(k * stride, (k + 1) * stride)));
    return { name, trace: NO_TRACE, kind: 'array', width: sigs.length, fields };
  }

  private recordRef(name: string, type: RecordLike, sigs: readonly number[]): SignalRef {
    let offset = 0;
    const fields = type.fields.map((field) => {
      const n = scalarCount(field.type);
      const ref = this.signalRef(field.name, field.type, sigs.slice(offset, offset + n));
      offset += n;
      return ref;
    });
    return { name, trace: NO_TRACE, kind: 'record', width: sigs.length, fields };
  }

  private scalarRef(name: string, base: ScalarBase | undefined, sigs: readonly number[]): SignalRef {
    const trace = this.leaf(sigs, 'single');
    if (base !== undefined && ENUM_KINDS.includes(base.kind) && !isLogicType(base) && !isCharacterType(base) && 'literals' in base) {
      return { name, trace, kind: 'enum', width: 1, enumType: { name: base.name, literals: base.literals } };
    }
    return { name, trace, kind: scalarKind(base), width: 1 };
  }
}

/** `mem(3)`, `mem(2)`, … in the array's own index order; a multi-dimensional array is counted from 0. */
function elementLabels(name: string, type: SubArrayGhwType, scalars: number): string[] {
  const count = scalars / scalarCount(type.element);
  const [range] = type.ranges;
  const oneDimension = type.ranges.length === 1 && range !== undefined;
  const step = oneDimension && range.downto ? -1 : 1;
  const first = oneDimension ? range.left : 0;
  return Array.from({ length: count }, (_, k) => `${name}(${first + k * step})`);
}

function scalarKind(base: ScalarBase | undefined): SignalKind {
  if (base === undefined) return 'integer';
  if (isLogicType(base)) return 'logic';
  if (isCharacterType(base)) return 'character';
  return base.kind === RTIK.f64 ? 'real' : 'integer';
}
