// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * Which bits of a signal an assignment drives (docs/impl_sim_only_warnings.md § 8.1):
 * all of it, a constant bit or range, or bits only known while running (`LEDR(i)`).
 * Two drivers clash only where that can be shown, so an unknown index never clashes
 * with a known one. Pure.
 */

export type Bits =
  | { readonly kind: 'all' }
  | { readonly kind: 'range'; readonly low: number; readonly high: number }
  | { readonly kind: 'unknown' };

export const ALL_BITS: Bits = { kind: 'all' };
const UNKNOWN_BITS: Bits = { kind: 'unknown' };

const range = (a: number, b: number): Bits => ({ kind: 'range', low: Math.min(a, b), high: Math.max(a, b) });

/** Whether two drivers certainly drive a bit in common. The whole signal meets any part of it, even an unknown one. */
export function overlap(a: Bits, b: Bits): boolean {
  if (a.kind === 'all' || b.kind === 'all') return true;
  if (a.kind === 'unknown' || b.kind === 'unknown') return false;
  return a.low <= b.high && b.low <= a.high;
}

const VHDL_BIT = /^\(\s*(\d+)\s*\)$/;
const VHDL_RANGE = /^\(\s*(\d+)\s+(?:downto|to)\s+(\d+)\s*\)$/i;

/** VHDL: none, `(3)`, `(7 downto 4)`, `(0 to 3)`; anything else is only known while running. */
export function vhdlBits(index: string | undefined): Bits {
  if (index === undefined) return ALL_BITS;
  return bitsFrom(index.trim(), VHDL_BIT, VHDL_RANGE);
}

const VERILOG_BIT = /^\[\s*(\d+)\s*\]$/;
const VERILOG_RANGE = /^\[\s*(\d+)\s*:\s*(\d+)\s*\]$/;

/** Verilog: none, `[3]`, `[7:4]`; anything else is only known while running. */
export function verilogBits(index: string | undefined): Bits {
  if (index === undefined) return ALL_BITS;
  return bitsFrom(index.trim(), VERILOG_BIT, VERILOG_RANGE);
}

function bitsFrom(index: string, bit: RegExp, span: RegExp): Bits {
  const one = bit.exec(index);
  if (one) return range(Number(one[1]), Number(one[1]));
  const two = span.exec(index);
  return two ? range(Number(two[1]), Number(two[2])) : UNKNOWN_BITS;
}
