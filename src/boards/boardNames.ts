// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * The rules a board's port names and labels follow (docs/board_io_config_spec.md § 4.4).
 * One board serves both VHDL and Verilog, so a name has to be valid in both.
 */

import { isVerilogReservedWord } from '../components/workbench/verilogWords';
import { isReservedWord } from '../components/workbench/vhdlWords';

/**
 * A VHDL basic identifier that is also a Verilog one: a letter first, then letters and
 * digits, with single underscores between them (no `__`, no trailing `_`).
 */
const PLAIN_IDENTIFIER = /^[A-Za-z](?:_?[A-Za-z0-9])*$/;

export const MAX_PORT_NAME_LENGTH = 32;
/** `HEX` + `5` must still fit under a display. */
export const MAX_LABEL_LENGTH = 8;
/** Legacy VHDL tolerance: wired from the first pushbutton by the backend, never a board's name. */
export const LEGACY_RESET_PORT = 'rst';

export function isPlainIdentifier(name: string): boolean {
  return PLAIN_IDENTIFIER.test(name);
}

/** Why `name` cannot be a board's port name, or undefined when it can. */
export function portNameProblem(name: string): string | undefined {
  if (!isPlainIdentifier(name)) return 'is not a plain identifier (a letter, then letters, digits and single underscores)';
  if (name.length > MAX_PORT_NAME_LENGTH) return `is longer than ${MAX_PORT_NAME_LENGTH} characters`;
  if (isReservedWord(name)) return 'is a VHDL reserved word';
  if (isVerilogReservedWord(name)) return 'is a Verilog reserved word';
  if (name.toLowerCase() === LEGACY_RESET_PORT) return `is reserved (HDLBoard wires "${LEGACY_RESET_PORT}" itself)`;
  return undefined;
}

/** Why `label` cannot be a board's silkscreen label, or undefined when it can. */
export function labelProblem(label: string): string | undefined {
  if (!isPlainIdentifier(label)) return 'is not a plain identifier (a letter, then letters, digits and single underscores)';
  if (label.length > MAX_LABEL_LENGTH) return `is longer than ${MAX_LABEL_LENGTH} characters`;
  return undefined;
}
