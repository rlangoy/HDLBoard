// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * The width check before elaboration (docs/board_io_v2_spec.md § 8). In VHDL a mismatch is an error (GHDL would refuse to elaborate); in Verilog a warning, as Icarus runs the design. A board port the
 * top declares with another width than the board's gets a plain message with the
 * declaration HDLBoard expects — not a GHDL or Icarus error about a testbench the
 * student never wrote. A width HDLBoard cannot read (a generic, an expression) is only
 * noted, and the run goes ahead. Pure.
 *
 * The backend never hears the board's name, so the messages say "the board"; the
 * frontend names it (`withBoardName` in src/components/workbench/boardText.ts).
 */

import { boardBindings, type BoardBinding, type BoardIo } from './boardPorts.js';
import type { Language } from './types.js';

/** A port the top declares, as the language's port reader saw it. */
export interface DeclaredPort {
  readonly name: string;
  /** The type as written: `std_logic_vector(9 downto 0)`, `input [9:0]`. */
  readonly declaration: string;
  /** Undefined when HDLBoard cannot read it. */
  readonly width?: number;
  /** VHDL: a vector type (`std_logic_vector(0 downto 0)`) rather than a scalar (`std_logic`); undefined when not told. */
  readonly vector?: boolean;
  /** Where it is declared, GHDL-style (`top.vhdl:5:9:`), to put the message on it; empty when unknown. */
  readonly location?: string;
}

export interface ShapeCheck {
  /** An error stops the run before elaboration; a note is shown and the run goes ahead. */
  readonly severity: 'error' | 'note';
  readonly text: string;
}

const bits = (width: number): string => (width === 1 ? '1 bit' : `${width} bits`);

/** The board ports that are one bit by nature; every other one is a vector, even of one bit. */
const SCALAR_ROLES: readonly string[] = ['clock', 'clock500Hz', 'resetButton', 'decimalPoint'];

/** Whether the testbench connects this port as a vector: `sw_sig`, not `sw_sig(0)` or `clk_sig`. */
const isVector = (binding: BoardBinding): boolean => binding.index === undefined && !SCALAR_ROLES.includes(binding.role);

/** `16 switches`, `4 digits`, `btnC as one bit`: what the board has for this port. */
function boardHas(binding: BoardBinding): string {
  const nouns: Readonly<Record<string, string>> = { switches: 'switches', leds: 'LEDs', pushbuttons: 'pushbuttons', segments: 'segments', digitEnables: 'digits' };
  const noun = nouns[binding.role];
  if (noun !== undefined) return `${binding.width} ${noun}`;
  if (binding.role.startsWith('sevenSegment')) return `${binding.width}-bit displays`;
  return `${binding.name} as one bit`;
}

/** `sw : in std_logic_vector(15 downto 0);` or `input wire [15:0] sw`: the declaration the board needs. */
function expectedDeclaration(binding: BoardBinding, language: Language): string {
  const { name, direction, width } = binding;
  const vector = isVector(binding);
  if (language === 'verilog') {
    const range = vector ? ` [${width - 1}:0]` : '';
    return `${direction === 'in' ? 'input' : 'output'} wire${range} ${name}`;
  }
  const type = vector ? `std_logic_vector(${width - 1} downto 0)` : 'std_logic';
  return `${name} : ${direction} ${type};`;
}

function checkPort(port: DeclaredPort, binding: BoardBinding, language: Language): ShapeCheck | undefined {
  const at = port.location ? `${port.location}error: ` : '';
  if (port.width === undefined) {
    return { severity: 'note', text: `Note: ${port.name} has a width HDLBoard cannot read (${port.declaration}); the board has ${boardHas(binding)}.` };
  }
  if (port.width === binding.width) return kindMismatch(port, binding, language);
  const headline = `${port.name} is declared as ${port.declaration} (${bits(port.width)}), but the board has ${boardHas(binding)}.`;
  const expected = `Expected: ${expectedDeclaration(binding, language)}`;
  // Icarus connects the low bits and runs, as in 1.6: a warning, so a design that works keeps working.
  if (language === 'verilog') return { severity: 'note', text: `Warning: ${headline} Icarus connects the low bits only.\n  ${expected}` };
  return { severity: 'error', text: `${at}${headline}\n${at}${expected}` };
}

/** VHDL: a 1-bit vector and a scalar are different types, and GHDL would refuse the testbench's port map. */
function kindMismatch(port: DeclaredPort, binding: BoardBinding, language: Language): ShapeCheck | undefined {
  if (language !== 'vhdl' || port.vector === undefined || port.vector === isVector(binding)) return undefined;
  const at = port.location ? `${port.location}error: ` : '';
  const boardKind = isVector(binding) ? 'a vector of 1 bit' : 'a single bit';
  const headline = `${port.name} is declared as ${port.declaration}, but on the board it is ${boardKind}.`;
  return { severity: 'error', text: `${at}${headline}
${at}Expected: ${expectedDeclaration(binding, language)}` };
}

/** Every board port the top declares whose width differs from the board's, or cannot be read. */
export function checkBoardPortShapes(declared: readonly DeclaredPort[], board: BoardIo, language: Language): ShapeCheck[] {
  return boardBindings(board).flatMap((binding) => {
    const port = declared.find((candidate) => candidate.name.toLowerCase() === binding.key);
    const check = port === undefined ? undefined : checkPort(port, binding, language);
    return check === undefined ? [] : [check];
  });
}

/** The errors as one text, or undefined when the run may go ahead. */
export function shapeErrors(checks: readonly ShapeCheck[]): string | undefined {
  const errors = checks.filter((check) => check.severity === 'error').map((check) => check.text);
  return errors.length === 0 ? undefined : errors.join('\n');
}

/** The notes, shown before the run. */
export function shapeNotes(checks: readonly ShapeCheck[]): string[] {
  return checks.filter((check) => check.severity === 'note').map((check) => check.text);
}
