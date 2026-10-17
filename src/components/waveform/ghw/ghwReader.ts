// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * Reading the numbers of a GHW file (docs/waveform_viewer_spec.md § 8.3): fixed-size
 * words in the file's byte order, LEB128 numbers and four-letter section tags. Running
 * out of bytes throws `EndOfData`, which the parser turns into "cut off here". Pure.
 */

import { WaveParseError } from '../model';

/** The data ended in the middle of something. */
export class EndOfData extends Error {}

const TAG_LENGTH = 4;
const WORD32_LENGTH = 4;
const WORD64_LENGTH = 8;
const LEB_DATA_MASK = 0x7f;
const LEB_CONTINUES = 0x80;
const LEB_SIGN = 0x40;
const LEB_SCALE = 128;
const MAX_SAFE = BigInt(Number.MAX_SAFE_INTEGER);

export const TOO_LONG_MESSAGE = 'The simulation ran too long to be shown exactly (more than 2^53 femtoseconds).';

function safeNumber(value: bigint): number {
  if (value > MAX_SAFE || value < -MAX_SAFE) throw new WaveParseError(TOO_LONG_MESSAGE);
  return Number(value);
}

export class Reader {
  pos = 0;
  littleEndian = true;
  constructor(private readonly bytes: Uint8Array) {}

  get atEnd(): boolean {
    return this.pos >= this.bytes.length;
  }

  private need(n: number): void {
    if (this.pos + n > this.bytes.length) throw new EndOfData();
  }

  private view(n: number): DataView {
    this.need(n);
    const view = new DataView(this.bytes.buffer, this.bytes.byteOffset + this.pos, n);
    this.pos += n;
    return view;
  }

  byte(): number {
    if (this.pos >= this.bytes.length) throw new EndOfData();
    return this.bytes[this.pos++];
  }

  skip(n: number): void {
    this.need(n);
    this.pos += n;
  }

  /** A section tag such as `STR\0`, without its trailing zero. */
  tag(): string {
    this.need(TAG_LENGTH);
    const text = String.fromCharCode(...this.bytes.subarray(this.pos, this.pos + TAG_LENGTH));
    this.pos += TAG_LENGTH;
    return text.replace(/\0$/, '');
  }

  i32(): number {
    return this.view(WORD32_LENGTH).getInt32(0, this.littleEndian);
  }

  i64(): number {
    return safeNumber(this.view(WORD64_LENGTH).getBigInt64(0, this.littleEndian));
  }

  f64(): number {
    // libghw reads a double with `fread`: the writer's own byte order, little-endian in practice.
    return this.view(WORD64_LENGTH).getFloat64(0, true);
  }

  /** Unsigned LEB128, small enough for a JavaScript number. */
  uleb(): number {
    // Most numbers in the cycles are one byte: signal deltas, std_logic values.
    if (this.pos < this.bytes.length && this.bytes[this.pos] < LEB_CONTINUES) return this.bytes[this.pos++];
    let result = 0;
    for (let scale = 1; ; scale *= LEB_SCALE) {
      const b = this.byte();
      result += (b & LEB_DATA_MASK) * scale;
      if ((b & LEB_CONTINUES) === 0) return result;
    }
  }

  /** Signed LEB128. Numbers here are times, integers and ranges: exact while below 2^53. */
  sleb(): number {
    let result = 0;
    for (let scale = 1; ; ) {
      const b = this.byte();
      result += (b & LEB_DATA_MASK) * scale;
      scale *= LEB_SCALE;
      if ((b & LEB_CONTINUES) === 0) return b & LEB_SIGN ? result - scale : result;
    }
  }
}
