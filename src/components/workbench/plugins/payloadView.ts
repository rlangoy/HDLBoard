// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * How the plugin pane shows a payload: as Hex and ASCII where the kind's payload is
 * bytes (`uart`), and as the raw text otherwise. The server never interprets a payload
 * (docs/plugin_batch_implementation_plan.md § 6.1); this is the frontend's reading of
 * the kinds it knows. Pure.
 */

import { parseUartPayload } from './uart/uartPayload';

export type PayloadView =
  | {
      readonly decoded: true;
      /** Two hex digits, or `XX` for a byte with an undefined bit. */
      readonly hex: string;
      /** The byte as a character; a control character as its Unicode picture (`␊` for LF). */
      readonly ascii: string;
      /** A name for the tooltip when `ascii` is not the character itself, e.g. `LF`. */
      readonly asciiName?: string;
      /** The stop bit was not '1'. */
      readonly framingError: boolean;
    }
  | { readonly decoded: false; readonly raw: string };

const FIRST_PRINTABLE = 0x20;
const DEL = 0x7f;
const ASCII_END = 0x80;
/** U+2400..U+241F show C0 control characters; U+2421 shows DEL. */
const CONTROL_PICTURES = 0x2400;
const DEL_PICTURE = '␡';
/** A byte outside 7-bit ASCII has no character of its own here. */
const NON_ASCII = '·';
const UNDEFINED = '?';

const CONTROL_NAMES = [
  'NUL', 'SOH', 'STX', 'ETX', 'EOT', 'ENQ', 'ACK', 'BEL', 'BS', 'TAB', 'LF', 'VT', 'FF', 'CR', 'SO', 'SI',
  'DLE', 'DC1', 'DC2', 'DC3', 'DC4', 'NAK', 'SYN', 'ETB', 'CAN', 'EM', 'SUB', 'ESC', 'FS', 'GS', 'RS', 'US',
];

/** One byte as the ASCII column shows it, with a name when it is not printable. */
export function asciiOf(value: number | null): { ascii: string; asciiName?: string } {
  if (value === null) return { ascii: UNDEFINED, asciiName: 'undefined byte' };
  if (value < FIRST_PRINTABLE) return { ascii: String.fromCharCode(CONTROL_PICTURES + value), asciiName: CONTROL_NAMES[value] };
  if (value === FIRST_PRINTABLE) return { ascii: '␠', asciiName: 'space' };
  if (value === DEL) return { ascii: DEL_PICTURE, asciiName: 'DEL' };
  if (value >= ASCII_END) return { ascii: NON_ASCII, asciiName: 'not ASCII' };
  return { ascii: String.fromCharCode(value) };
}

const HEX = 16;

export function payloadView(kind: string, payload: string): PayloadView {
  const byte = kind === 'uart' ? parseUartPayload(0, payload) : undefined;
  if (byte === undefined) return { decoded: false, raw: payload };
  const hex = byte.value === null ? 'XX' : byte.value.toString(HEX).toUpperCase().padStart(2, '0');
  return { decoded: true, hex, ...asciiOf(byte.value), framingError: byte.framingError };
}
