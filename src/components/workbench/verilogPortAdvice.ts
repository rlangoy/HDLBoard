// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * An input port assigned in Verilog, measured on Icarus 13.0 with `-Wall`. Two ways:
 *
 * - In `always`, `SW <= 0;` is an error, `'SW' is not a valid l-value for a procedural
 *   assignment`, whose note calls `input wire SW` a wire — so Rule H would say to make
 *   it a `reg`, which an input cannot be. `adviseInputAssignedInAlways` says what it is.
 * - `assign SW = LEDR;` Icarus accepts without a word: the port gets a driver beside the
 *   board's, and reads x when they differ. HDLBoard warns at Start
 *   (`inputAssignChecks`), as for VHDL's output port read (outputReads.ts).
 *
 * Both offer the assignment the other way round when the other side is an output port
 * that takes it: an `output reg` in `always`, an output net for `assign`. Pure.
 */

import type { Advice } from './diagnosticAdvice';
import type { RunSnapshot } from './diagnosticLocation';
import { projectCheckText, verilogAdviceText } from './diagnosticText';
import { isVerilogFile } from './fileKinds';
import { sourceTokens } from './symbols/sourceTokens';
import { splitLines } from './textLines';
import { needsPreprocessing } from './verilogDirectives';
import { tokenizeVerilog } from './verilogHighlight';
import { modulePorts, portAt, type ModulePorts, type VerilogPort } from './verilogPorts';

/** Icarus 13.0: `'x' is not a valid l-value …`; 12.0: `x is not a valid l-value …`. */
const NOT_AN_L_VALUE = /^'?(?<name>[^'\s]+)'? is not a valid l-value/;
/** A value that is one name, maybe with a bit or a part select: `LEDR`, `LEDR[3]`, `LEDR[7:4]`. */
const ONE_NAME = /^(?<name>[A-Za-z_][\w$]*)\s*(?:\[[^\]]*\])?$/;
const ASSIGN = /\bassign\s+(?<target>(?<name>[A-Za-z_][\w$]*)\s*(?:\[[^\]]*\])?)\s*=\s*(?<value>[^;]*?)\s*;/g;

/** One assignment statement on a line: what is assigned, how, and from what. */
interface Statement {
  readonly target: string;
  readonly operator: '=' | '<=';
  readonly value: string;
  /** 0-based, in the line: where the target starts and ends. */
  readonly start: number;
  readonly end: number;
}

/** The Icarus error for an input port assigned in `always`: what the port is, and the swap if it fits. */
export function adviseInputAssignedInAlways(message: string, text: string, line: number, modules: readonly ModulePorts[]): Advice | undefined {
  const name = NOT_AN_L_VALUE.exec(message)?.groups?.name;
  if (name === undefined || portAt(modules, line, name)?.direction !== 'input') return undefined;
  const statement = proceduralAssignmentTo(withoutComment(text), name);
  if (statement === undefined) return { headline: verilogAdviceText.inputAssigned(name) };
  const swapped = swappedWhen(statement, portAt(modules, line, nameOf(statement.value)), (port) => port.variable);
  const headline = swapped === undefined ? verilogAdviceText.inputAssigned(name) : verilogAdviceText.inputAssignedSwapped(name, `${swapped};`);
  return { headline, span: { start: statement.start, end: statement.end } };
}

/** HDLBoard's check of the run's `assign`s to input ports, at Start. */
export interface InputAssignChecks {
  /** One warning, in Icarus's format, on every `assign` to an input port of its module. */
  readonly warnings: readonly string[];
  /** The output ports such an `assign` reads: Icarus's coercion of each is explained by a warning. */
  readonly drivingOutputs: ReadonlySet<string>;
}

/** An `assign` to an input port, where it is, and the port it reads if it reads one output port. */
interface InputAssign {
  readonly fileName: string;
  /** 1-based. */
  readonly line: number;
  readonly statement: Statement;
  readonly valuePort: VerilogPort | undefined;
}

export function inputAssignChecks(snapshot: RunSnapshot): InputAssignChecks {
  const assigns = snapshot.files.filter(isVerilogFile).flatMap(({ name, content }) => inputAssignsIn(name, splitLines(content)));
  const drivingOutputs = assigns.filter(readsOneOutput).map(({ statement }) => nameOf(statement.value));
  return { warnings: assigns.map(warningFor), drivingOutputs: new Set(drivingOutputs) };
}

/**
 * The file's `assign`s to its input ports. A file the preprocessor may change (`define,
 * `ifdef …) is not checked, as Icarus's own advice is not (verilogDirectives.ts): an
 * `assign` in an inactive branch is never compiled, so it is neither warned about nor lets
 * Icarus's coercion warning be left out.
 */
function inputAssignsIn(fileName: string, lines: readonly string[]): InputAssign[] {
  const tokenLines = tokenizeVerilog(lines);
  const tokens = sourceTokens(tokenLines);
  if (needsPreprocessing(tokens)) return [];
  const modules = modulePorts(tokens);
  return tokenLines.flatMap((tokens, i) =>
    continuousAssignmentsOn(tokens.map((token) => token.type === 'comment' || token.type === 'string' ? ' '.repeat(token.text.length) : token.text).join(''))
      .filter((statement) => portAt(modules, i + 1, nameOf(statement.target))?.direction === 'input')
      .map((statement) => ({ fileName, line: i + 1, statement, valuePort: portAt(modules, i + 1, nameOf(statement.value)) })),
  );
}

/** `assign SW = LEDR;`: the value is one name, an output port of the module. */
function readsOneOutput({ statement, valuePort }: InputAssign): boolean {
  return valuePort?.direction === 'output' && ONE_NAME.test(statement.value);
}

function warningFor(assign: InputAssign): string {
  const input = nameOf(assign.statement.target);
  const swapped = swappedWhen(assign.statement, assign.valuePort, (port) => !port.variable);
  const text = readsOneOutput(assign)
    ? projectCheckText.outputDrivesInput(nameOf(assign.statement.value), input, swapped === undefined ? undefined : `assign ${swapped};`)
    : projectCheckText.inputAssigned(input);
  return `${assign.fileName}:${assign.line}: warning: ${text}`;
}

/**
 * Icarus's `hdl_board_tb.v:11: warning: output port LEDR is coerced to inout.`, for an
 * output port that drives an input: it names HDLBoard's testbench, which the student
 * never sees. When a warning on the student's own `assign` explains it, it is left out.
 */
const TESTBENCH_COERCION = /^hdl_board_tb\.v:\d+: warning: output port (?<port>[A-Za-z_][\w$]*) is coerced to inout\.$/;

export function isExplainedCoercion(line: string, drivingOutputs: ReadonlySet<string>): boolean {
  const port = TESTBENCH_COERCION.exec(line.trim())?.groups?.port;
  return port !== undefined && drivingOutputs.has(port);
}

/** LOG and ERROR frames may contain several complete lines; keep all unrelated output. */
export function withoutExplainedCoercions(text: string, drivingOutputs: ReadonlySet<string>): string {
  return text.split('\n').filter((line) => !isExplainedCoercion(line, drivingOutputs)).join('\n');
}

/**
 * `LEDR <= SW` for `SW <= LEDR`: only when the value is one name, an output port that
 * `fits` takes the assignment (a `reg` in `always`, a net for `assign`).
 */
function swappedWhen(statement: Statement, valuePort: VerilogPort | undefined, fits: (port: VerilogPort) => boolean): string | undefined {
  const isOutput = valuePort !== undefined && valuePort.direction !== 'input' && fits(valuePort);
  return isOutput && ONE_NAME.test(statement.value) ? `${statement.value} ${statement.operator} ${statement.target}` : undefined;
}

/** `SW[2] <= LEDR[2];` for `name`, anywhere on the line (after `always @(…)` too). */
function proceduralAssignmentTo(text: string, name: string): Statement | undefined {
  const pattern = new RegExp(String.raw`(?<![\w$])(?<target>${escaped(name)}\s*(?:\[[^\]]*\])?)\s*(?<operator><=|=)\s*(?<value>[^;]*?)\s*;`);
  const match = pattern.exec(text);
  const groups = match?.groups;
  if (match === null || groups === undefined) return undefined;
  return { target: groups.target, operator: groups.operator as Statement['operator'], value: groups.value, start: match.index, end: match.index + groups.target.length };
}

function continuousAssignmentsOn(text: string): Statement[] {
  return [...text.matchAll(ASSIGN)].flatMap((match) => {
    const groups = match.groups;
    if (groups === undefined) return [];
    const start = match.index + match[0].indexOf(groups.target);
    return [{ target: groups.target.trim(), operator: '=' as const, value: groups.value, start, end: start + groups.target.trim().length }];
  });
}

/** The name in `LEDR[3]`. */
function nameOf(written: string): string {
  return ONE_NAME.exec(written.trim())?.groups?.name ?? written.trim();
}

function withoutComment(text: string): string {
  const comment = text.indexOf('//');
  return comment < 0 ? text : text.slice(0, comment);
}

function escaped(name: string): string {
  return name.replace(/[$]/g, '\\$');
}
