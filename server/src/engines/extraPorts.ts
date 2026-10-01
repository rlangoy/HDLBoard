// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * Ports of the top entity that are not board ports — a typo of `SW` such as `SdsW`, of
 * `LEDR` such as `LEDRR`, or an extra `Dummy` meant for a testbench. Pure.
 *
 * The design still runs, as Quartus only warns about a top-level pin with no location:
 * the generated testbench leaves an extra output or inout open, which VHDL allows, and
 * holds an extra input of a bit or vector type at 0 (`planExtraPorts`). Each gets a
 * console warning; it is not in GHDL's `file:line:col:` shape, so the editor gives it
 * only a quiet `!` in the gutter.
 *
 * Any other extra input cannot be left open: GHDL rejects the testbench with
 * `hdl_board_tb.vhdl:52:3:error: port "X" of mode IN must be connected`, about an
 * internal file the student cannot open. `explainUnconnectedPorts` reports it on the
 * student's own declaration instead, in GHDL's shape, so the editor marks it in full.
 */

import type { TiedInput } from '../tbTemplate.js';
import { BOARD_INPUT_NAMES, BOARD_PORTS } from './boardPorts.js';
import { suggestBoardInput, suggestBoardOutput } from './boardPortSuggestions.js';
import { ghdlPosition, portDeclarations, type PortDeclaration } from './vhdlPorts.js';

export interface TopSource {
  readonly fileName: string;
  readonly content: string;
  readonly entityName: string;
  /** The entity's ports, lower case. */
  readonly ports: ReadonlySet<string>;
}

/** What the run does with the top entity's extra ports. */
export interface ExtraPortPlan {
  /** The extra inputs, each with the 0 the testbench holds it at. */
  readonly tiedInputs: readonly TiedInput[];
  /** One console message per extra port the run goes on without, in declaration order. */
  readonly warnings: readonly string[];
}

/**
 * GHDL's wording, and only on a line of the generated testbench: an error GHDL
 * reports in a file the student wrote is already shown on that file.
 */
const MUST_BE_CONNECTED =
  /^hdl_board_tb\.vhdl:\d+:\d+:error: (?<message>port "(?<name>[^"]+)" of mode (?:IN|INOUT) must be connected)/gim;

const BOARD_PORT_NAMES: ReadonlySet<string> = new Set(BOARD_PORTS);
const BIT_TYPES: ReadonlySet<string> = new Set(['std_logic', 'std_ulogic', 'bit']);
const VECTOR_TYPES: ReadonlySet<string> = new Set(['std_logic_vector', 'std_ulogic_vector', 'bit_vector', 'unsigned', 'signed']);

/** How a warning names an extra port, and what the board does with it. */
interface ExtraPortWording {
  /** "is not a board …" */
  readonly kind: string;
  /** What happens to it, as the end of a sentence. */
  readonly effect: string;
  /** "To … it, simulate a testbench". */
  readonly verb: string;
  readonly suggest?: (name: string, declared: ReadonlySet<string>) => string | undefined;
}

const INPUT_WORDING: ExtraPortWording = {
  kind: 'input',
  effect: 'the board holds it at 0',
  verb: 'drive',
  suggest: suggestBoardInput,
};
const OUTPUT_WORDING: ExtraPortWording = {
  kind: 'output',
  effect: 'the board does not show it',
  verb: 'see',
  suggest: suggestBoardOutput,
};
const OTHER_PORT_WORDING: ExtraPortWording = { kind: 'port', effect: 'the board does not connect it', verb: 'drive or see' };

const inBackticks = (text: string): string => `\`${text}\``;
const capitalized = (text: string): string => text.charAt(0).toUpperCase() + text.slice(1);

function isBoardPort(port: PortDeclaration): boolean {
  return BOARD_PORT_NAMES.has(port.name.toLowerCase());
}

/** The constant 0 of the port's type, or `undefined` when it is not a bit or a constrained vector of bits. */
function zeroOf(port: PortDeclaration): string | undefined {
  if (BIT_TYPES.has(port.type) && !port.constrained) return "'0'";
  if (VECTOR_TYPES.has(port.type) && port.constrained) return "(others => '0')";
  return undefined;
}

/** The value an extra input is held at; none for an input that keeps its default, or any other mode. */
function heldValueOf(port: PortDeclaration): string | undefined {
  const needsValue = port.mode === 'in' && !port.hasDefault;
  return needsValue ? zeroOf(port) : undefined;
}

/** How the warning about an extra port reads; none when the run does not go on without it. */
function wordingFor(port: PortDeclaration): ExtraPortWording | undefined {
  if (port.mode === 'out' || port.mode === 'buffer') return OUTPUT_WORDING;
  if (port.mode !== 'in') return OTHER_PORT_WORDING;
  return heldValueOf(port) === undefined ? undefined : INPUT_WORDING;
}

function extraPortWarning(top: TopSource, port: PortDeclaration, wording: ExtraPortWording): string {
  const { line } = ghdlPosition(top.content, port.offset);
  const suggestion = wording.suggest?.(port.name, top.ports);
  const what = `${inBackticks(port.name)} (${top.fileName}, line ${line}) is not a board ${wording.kind}`;
  const headline = suggestion
    ? `Warning: ${what} — did you mean ${inBackticks(suggestion)}? ${capitalized(wording.effect)}.`
    : `Warning: ${what}, so ${wording.effect}.`;
  const advice =
    `  Not a syntax error: a port like this is normal in a design meant for a testbench. ` +
    `To ${wording.verb} it, simulate a testbench that instantiates ${top.entityName}.`;
  return [headline, advice].join('\n');
}

/** The extra ports' values for the testbench, and a warning for each the run goes on without. */
export function planExtraPorts(top: TopSource): ExtraPortPlan {
  const extraPorts = portDeclarations(top.content, top.entityName).filter((port) => !isBoardPort(port));
  const tiedInputs = extraPorts.flatMap((port) => {
    const value = heldValueOf(port);
    return value === undefined ? [] : [{ name: port.name, value }];
  });
  const warnings = extraPorts.flatMap((port) => {
    const wording = wordingFor(port);
    return wording === undefined ? [] : [extraPortWarning(top, port, wording)];
  });
  return { tiedInputs, warnings };
}

/** The ports GHDL says the testbench left open: the name as it printed it, and its sentence. */
export function unconnectedPorts(ghdlText: string): Array<{ name: string; message: string }> {
  return [...ghdlText.matchAll(MUST_BE_CONNECTED)].map((m) => ({
    name: m.groups?.name ?? '',
    message: m.groups?.message ?? '',
  }));
}

/** GHDL-shaped lines about one open input, on its declaration: the headline, then `(…)` details. */
function unconnectedPortError(top: TopSource, port: PortDeclaration, ghdlMessage: string): string {
  const { line, column } = ghdlPosition(top.content, port.offset);
  const suggestion = suggestBoardInput(port.name, top.ports);
  const what = `${inBackticks(port.name)} is not a board input`;
  const headline = suggestion
    ? `${what} — did you mean ${inBackticks(suggestion)}? Nothing on the board drives this port.`
    : `${what}, so nothing on the board drives it.`;
  const at = `${top.fileName}:${line}:${column}:error:`;
  const remedy = `(the board's inputs are ${BOARD_INPUT_NAMES.join(', ')}; give the port a default value with := to keep it)`;
  return [`${at} ${headline}`, `${at} ${remedy}`, `${at} (GHDL: ${ghdlMessage})`].join('\n');
}

/**
 * GHDL's complaints about inputs the testbench left open, moved onto the student's own
 * declarations. `undefined` when the text is not about open ports, or a port cannot be
 * found in the top file — the caller then keeps GHDL's own text.
 */
export function explainUnconnectedPorts(ghdlText: string, top: TopSource): string | undefined {
  const open = unconnectedPorts(ghdlText);
  if (open.length === 0) return undefined;
  const declared = portDeclarations(top.content, top.entityName);
  const errors = open.map(({ name, message }) => {
    const port = declared.find((candidate) => candidate.name.toLowerCase() === name.toLowerCase());
    return port === undefined ? undefined : unconnectedPortError(top, port, message);
  });
  return errors.every((error) => error !== undefined) ? errors.join('\n') : undefined;
}
