// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * The value data of a GHW file: a snapshot (`SNP`) and cycles (`CYC`) of changes to
 * basic signals, turned into the traces of the shown signals. The cycles are the hot
 * path (NFR-1): values are kept as numbers and typed arrays are reused, so a 16 MiB
 * file parses in well under a second. A cycle is applied only once it is complete,
 * so a file cut off inside one keeps everything before it. Pure.
 */

import { WaveParseError, type Trace, type TraceId } from '../model';
import { TraceBuilder } from '../traceBuilder';
import { EndOfData, TOO_LONG_MESSAGE, type Reader } from './ghwReader';
import type { Hierarchy, Leaf } from './ghwHierarchy';
import { RTIK, SECTION_HEADER_LENGTH, type EnumGhwType, type ScalarBase } from './ghwTypes';

/** Well-known types (`WKT`): what an enumeration stands for. */
const WKT_BOOLEAN = 1;
const WKT_BIT = 2;
const WKT_STD_ULOGIC = 3;
const LOGIC_WKTS: readonly number[] = [WKT_BOOLEAN, WKT_BIT, WKT_STD_ULOGIC];
const LOGIC_LITERAL_LISTS: readonly string[] = ["'U','X','0','1','Z','W','L','H','-'", "'0','1'", 'false,true'];
/** `'U'`: a character literal of one letter. */
const CHARACTER_LITERAL_LENGTH = 3;
/** Marks the end of a cycle's list of time steps. */
const LAST_STEP = -1;

/** A basic signal's value as a number: the literal's position, the integer, the real. */
export function readRaw(r: Reader, base: ScalarBase): number {
  if (base.kind === RTIK.b2 || base.kind === RTIK.e8) return r.byte();
  return base.kind === RTIK.f64 ? r.f64() : r.sleb();
}

/** std_ulogic, bit and boolean: shown as levels, their values as one letter. */
export function isLogicType(base: ScalarBase): boolean {
  if (base.kind !== RTIK.b2 && base.kind !== RTIK.e8) return false;
  return LOGIC_WKTS.includes(base.wkt) || LOGIC_LITERAL_LISTS.includes(base.literals.join(','));
}

export function isCharacterType(base: ScalarBase): boolean {
  return base.kind === RTIK.e8 && base.name.toLowerCase() === 'character';
}

/** A logic value as one upper-case character (`'U'` → `U`, `true` → `1`); any other literal as written. */
function literalText(base: EnumGhwType, index: number): string {
  const literal = base.literals[index] ?? '?';
  if (!isLogicType(base)) return literal;
  if (literal === 'false' || literal === 'true') return literal === 'true' ? '1' : '0';
  return literal.length === CHARACTER_LITERAL_LENGTH && literal[0] === "'" ? literal[1].toUpperCase() : literal;
}

/** Turns a raw value of one scalar type into text; enumerations through a table made once. */
export function textMaker(base: ScalarBase): (raw: number) => string {
  if (base.kind === RTIK.b2 || base.kind === RTIK.e8 || base.kind === RTIK.e32) {
    const texts = base.literals.map((_, i) => literalText(base, i));
    return (raw) => texts[raw] ?? '?';
  }
  if (base.kind === RTIK.p32 || base.kind === RTIK.p64) return (raw) => `${raw} ${base.unit}`;
  return (raw) => String(raw);
}

export function readValue(r: Reader, base: ScalarBase): string {
  return textMaker(base)(readRaw(r, base));
}

/** How the leaves (shown signals) are made of basic signals, by position among the basic signals. */
interface LeafIndex {
  /** The leaves each position is part of. */
  readonly leavesAt: number[][];
  /** By leaf: its basic signals as positions. */
  readonly leafPositions: number[][];
}

function indexLeaves(order: readonly number[], leaves: readonly Leaf[]): LeafIndex {
  const positionOf = new Map(order.map((sig, i) => [sig, i]));
  const leafPositions = leaves.map((leaf) => leaf.sigs.map((sig) => positionOf.get(sig) ?? 0));
  const leavesAt: number[][] = order.map(() => []);
  leafPositions.forEach((positions, leaf) => {
    for (const p of positions) if (!leavesAt[p].includes(leaf)) leavesAt[p].push(leaf);
  });
  return { leavesAt, leafPositions };
}

export class ValueReader {
  private readonly builders: TraceBuilder[];
  /** By position among the basic signals with a type, ascending – a cycle counts its deltas through these. */
  private readonly bases: ScalarBase[];
  private readonly raw: Float64Array;
  private readonly texts: Array<(raw: number) => string>;
  private readonly index: LeafIndex;
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
    this.bases = order.map((sig) => h.basics.get(sig)).filter((base): base is ScalarBase => base !== undefined);
    this.raw = new Float64Array(order.length);
    this.texts = this.bases.map(textMaker);
    this.index = indexLeaves(order, h.leaves);
    this.leafCombine = h.leaves.map((leaf) => leaf.combine === 'concat');
    this.builders = h.leaves.map(() => new TraceBuilder());
    this.stamp = new Int32Array(h.leaves.length).fill(-1);
    this.touched = new Int32Array(h.leaves.length);
    this.changedAt = new Int32Array(order.length);
    this.changedRaw = new Float64Array(order.length);
  }

  /** Reads snapshots and cycles to the end of the file, or to where it was cut off. */
  read(): void {
    try {
      for (let tag = this.nextTag(); tag === 'SNP' || tag === 'CYC'; tag = this.nextTag()) {
        if (tag === 'SNP') this.snapshot();
        else this.cycles();
      }
    } catch (e) {
      if (!(e instanceof EndOfData)) throw e;
      this.truncated = true;
    }
  }

  traces(): Map<TraceId, Trace> {
    return new Map(this.builders.map((builder, id) => [id, builder.build()]));
  }

  /** The next section; `DIR` and `TAI` – the index at the end of a complete file – end the data. */
  private nextTag(): string | undefined {
    return this.r.atEnd ? undefined : this.r.tag();
  }

  private text(leaf: number): string {
    const positions = this.index.leafPositions[leaf];
    if (!this.leafCombine[leaf]) return this.texts[positions[0]](this.raw[positions[0]]);
    let text = '';
    for (const p of positions) text += this.texts[p](this.raw[p]);
    return text;
  }

  /** Marks the leaves of the basic signal at `p` as touched in this cycle; returns how many are touched now. */
  private touch(p: number, nTouched: number): number {
    const { stamp, touched, cycle } = this;
    for (const leaf of this.index.leavesAt[p]) {
      if (stamp[leaf] === cycle) continue;
      stamp[leaf] = cycle;
      touched[nTouched++] = leaf;
    }
    return nTouched;
  }

  /** Applies one complete set of changes at `time`. */
  private commit(time: number): void {
    this.cycle++;
    let nTouched = 0;
    for (let i = 0; i < this.changed; i++) {
      const p = this.changedAt[i];
      this.raw[p] = this.changedRaw[i];
      nTouched = this.touch(p, nTouched);
    }
    for (let i = 0; i < nTouched; i++) this.builders[this.touched[i]].change(time, this.text(this.touched[i]));
    if (time > this.endTime) this.endTime = time;
  }

  private snapshot(): void {
    this.r.skip(SECTION_HEADER_LENGTH);
    const time = this.r.i64();
    for (let p = 0; p < this.bases.length; p++) {
      this.changedAt[p] = p;
      this.changedRaw[p] = readRaw(this.r, this.bases[p]);
    }
    this.changed = this.bases.length;
    if (this.r.tag() !== 'ESN') throw new WaveParseError('The waveform file has a damaged snapshot.');
    this.commit(time);
  }

  /** One cycle's list of changed signals: deltas between positions, then each value. */
  private readChanges(): void {
    const { r, changedAt, changedRaw, bases } = this;
    let n = 0;
    for (let position = -1, delta = r.uleb(); delta !== 0; delta = r.uleb()) {
      position += delta;
      if (position >= bases.length) throw new WaveParseError('The waveform file names a signal it does not define.');
      changedAt[n] = position;
      changedRaw[n++] = readRaw(r, bases[position]);
    }
    this.changed = n;
  }

  private cycles(): void {
    for (let time = this.r.i64(); ; ) {
      this.readChanges();
      // Committed only once the cycle's list is complete: a cut inside it is not data.
      this.commit(time);
      const step = this.r.sleb();
      if (step === LAST_STEP) break;
      time += step;
      if (time > Number.MAX_SAFE_INTEGER) throw new WaveParseError(TOO_LONG_MESSAGE);
    }
    if (this.r.tag() !== 'ECY') throw new WaveParseError('The waveform file has a damaged cycle.');
  }
}
