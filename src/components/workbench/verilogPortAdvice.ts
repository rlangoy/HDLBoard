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
 *   (`inputAssignWarnings`), as for VHDL's output port read (outputReads.ts).
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

/** A warning, in Icarus's format, on every `assign` to an input port of its module. */
export function inputAssignWarnings(snapshot: RunSnapshot): string[] {
  return snapshot.files.filter(isVerilogFile).flatMap((file) => {
    const lines = splitLines(file.content);
    const modules = modulePorts(sourceTokens(tokenizeVerilog(lines)));
    return lines.flatMap((text, i) =>
      continuousAssignmentsOn(withoutComment(text))
        .filter((statement) => portAt(modules, i + 1, nameOf(statement.target))?.direction === 'input')
        .map((statement) => `${file.name}:${i + 1}: warning: ${assignWarning(statement, portAt(modules, i + 1, nameOf(statement.value)))}`),
    );
  });
}

function assignWarning(statement: Statement, valuePort: VerilogPort | undefined): string {
  const name = nameOf(statement.target);
  const swapped = swappedWhen(statement, valuePort, (port) => !port.variable);
  return swapped === undefined ? projectCheckText.inputAssigned(name) : projectCheckText.inputAssignedSwapped(name, `assign ${swapped};`);
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
