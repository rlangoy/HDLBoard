// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * The `uart` plugin kind's payload (docs/plugin_batch_implementation_plan.md § 3.3,
 * § 7.5), for the stage-2 uart widget. Pure.
 *
 * Payload of a `uart` line:  "<hh>" | "<hh> FE" | "XX" | "XX FE"
 *   FE = framing error (stop bit was not '1'); XX = a data bit was undefined.
 */

export interface UartByte {
  /** Simulated time since the start of the run, ns (from the PLUGIN frame). */
  readonly timeNs: number;
  /** The byte, or `null` if a data bit was undefined (`XX`). */
  readonly value: number | null;
  /** The stop bit was not '1'. */
  readonly framingError: boolean;
}

const PAYLOAD = /^([0-9A-Fa-f]{2}|XX)( FE)?$/;

/** The byte in a `uart` payload, or `undefined` if the payload is not one. */
export function parseUartPayload(timeNs: number, payload: string): UartByte | undefined {
  const m = PAYLOAD.exec(payload);
  return m ? { timeNs, value: m[1] === 'XX' ? null : parseInt(m[1], 16), framingError: m[2] !== undefined } : undefined;
}

const CR = 0x0d;
const LF = 0x0a;
const TAB = 0x09;

/**
 * What the text view shows for each byte, in order: printable ASCII as itself,
 * CR, LF and CR LF each as one line break, TAB as itself, an undefined byte as
 * ⟨??⟩, anything else as ⟨hh⟩. The widget renders one span per entry (to colour framing errors and
 * show `timeNs` on hover) and joins them.
 */
export function uartDisplay(bytes: readonly UartByte[]): string[] {
  return bytes.map((byte, i) => {
    const v = byte.value;
    if (v === null) return '⟨??⟩';
    if (v === LF) return bytes[i - 1]?.value === CR ? '' : '\n';
    if (v === CR) return '\n';
    if (v === TAB || (v >= 0x20 && v < 0x7f)) return String.fromCharCode(v);
    return `⟨${v.toString(16).toUpperCase().padStart(2, '0')}⟩`;
  });
}
