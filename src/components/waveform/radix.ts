// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * A value as text, the way the student chose to see it – "Show as" (FR-9, S4, S7).
 * Vectors are stored as their bits, most significant first, and shown as hexadecimal
 * with `0x` unless the student picks Decimal, ASCII (in quotes, `'A'`) or Binary; a group of bits that is
 * not all `0`/`1` is shown by its own letter (`U`, `X`, `Z`) instead of a made-up
 * number. Signed decimal and floating point are not offered yet. Pure.
 */

import type { SignalRef } from './model';

export type ShowAs = 'hex' | 'decimal' | 'ascii' | 'binary';

/** The words of the "Show as" menu, in its order (S4: no "radix"). */
export const SHOW_AS_LABELS: ReadonlyArray<readonly [ShowAs, string]> = [
  ['hex', 'Hexadecimal'],
  ['decimal', 'Decimal'],
  ['ascii', 'ASCII'],
  ['binary', 'Binary'],
];

/** Whether a stored word is a "Show as" this version knows. */
export const isShowAs = (value: string): value is ShowAs => SHOW_AS_LABELS.some(([known]) => known === value);

const HEX_PREFIX = '0x';
const HEX_BASE = 16;
const BITS_PER_HEX_DIGIT = 4;
const BITS_PER_CHARACTER = 8;
const PRINTABLE_FIRST = 0x20;
const PRINTABLE_LAST = 0x7e;
const NOT_PRINTABLE = '·';

const KNOWN_BITS = /^[01]+$/;

/** Whether "Show as" means anything for this signal: only vectors have a choice. */
export function hasShowAs(signal: SignalRef): boolean {
  return signal.kind === 'vector';
}

/** Vectors as hexadecimal, integers as decimal (FR-9). */
export function defaultShowAs(signal: SignalRef): ShowAs {
  return signal.kind === 'integer' ? 'decimal' : 'hex';
}

/** The letter for a group of bits that are not all known: theirs when they all agree (`UUUU` → `U`), else `X`. */
function unknownLetter(bits: string): string {
  return bits === bits[0].repeat(bits.length) ? bits[0] : 'X';
}

function hex(bits: string): string {
  let text = '';
  for (let end = bits.length; end > 0; end -= BITS_PER_HEX_DIGIT) {
    const group = bits.slice(Math.max(0, end - BITS_PER_HEX_DIGIT), end);
    text = (KNOWN_BITS.test(group) ? parseInt(group, 2).toString(HEX_BASE).toUpperCase() : unknownLetter(group)) + text;
  }
  return HEX_PREFIX + text;
}

function decimal(bits: string): string {
  if (!KNOWN_BITS.test(bits)) return unknownLetter(bits);
  return BigInt(`0b${bits}`).toString();
}

function ascii(bits: string): string {
  let out = '';
  for (let end = bits.length; end > 0; end -= BITS_PER_CHARACTER) {
    const group = bits.slice(Math.max(0, end - BITS_PER_CHARACTER), end);
    if (!KNOWN_BITS.test(group)) {
      out = unknownLetter(group) + out;
      continue;
    }
    const code = parseInt(group, 2);
    out = (code >= PRINTABLE_FIRST && code <= PRINTABLE_LAST ? String.fromCharCode(code) : NOT_PRINTABLE) + out;
  }
  return out;
}

/** A vector's bits as `showAs` says. */
export function formatBits(bits: string, showAs: ShowAs): string {
  switch (showAs) {
    case 'binary':
      return bits;
    case 'hex':
      return hex(bits);
    case 'decimal':
      return decimal(bits);
    case 'ascii':
      // In quotes, as VHDL writes a character: 'A' is never read as the hex digit A.
      return `'${ascii(bits)}'`;
  }
}

/** A stored value of `signal` as the value column and the trace show it. */
export function formatValue(signal: SignalRef, value: string, showAs: ShowAs = defaultShowAs(signal)): string {
  return signal.kind === 'vector' ? formatBits(value, showAs) : value;
}

/** Whether a value has an undefined part (`U`, `X`, `W`): drawn red (§ 8.5). */
export function isUndefinedValue(signal: SignalRef, value: string): boolean {
  if (signal.kind !== 'vector' && signal.kind !== 'logic') return value === 'X';
  return /[UXW]/.test(value);
}
