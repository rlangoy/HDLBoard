// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * Advice on GHDL's `port "SW" can't be assigned`: an input port written to. GHDL names
 * neither which way the port goes nor the way out, and a beginner mostly meant the
 * other way round: `SW <= LEDR;` for `LEDR <= SW;`. Measured on GHDL 6.0.0 with
 * `--std=08`, where reading an output is allowed, so this is the only message. Pure.
 */

import type { Advice } from './diagnosticAdvice';
import { portText } from './diagnosticText';
import type { PortLookup } from './typeAdvice';
import type { PortMode } from './vhdlDeclarations';
import { assignmentOn, type Assignment } from './vhdlExpression';
import { architectureAbove } from './vhdlStructure';
import { architectureHeaders, sameName } from './vhdlUnits';

const CANT_BE_ASSIGNED = /^port "(?<port>[^"]+)" can't be assigned$/;
/** A value that is one name, maybe indexed or sliced: `LEDR`, `LEDR(3)`, `LEDR(7 downto 4)`. */
const ONE_NAME = /^(?<name>[A-Za-z]\w*)\s*(?:\(.*\))?$/s;
/** The modes of the ports the design drives: what can be swapped onto the left. */
const DRIVEN_BY_THE_DESIGN: ReadonlySet<PortMode> = new Set(['out', 'inout', 'buffer']);

/** A GHDL error on a line of a file of the project. */
export interface PortErrorPlace {
  readonly message: string;
  readonly lines: readonly string[];
  /** 1-based. */
  readonly line: number;
  readonly ports: PortLookup;
}

/** Which way an input port goes, and, for `SW <= LEDR;`, the assignment the other way round. */
export function adviseInputAssigned(place: PortErrorPlace): Advice | undefined {
  const port = CANT_BE_ASSIGNED.exec(place.message)?.groups?.port;
  if (port === undefined) return undefined;
  const text = place.lines[place.line - 1] ?? '';
  const assignment = assignmentOn(text);
  const ofPort = assignment !== undefined && sameName(assignment.targetName, port) ? assignment : undefined;
  if (ofPort === undefined) return { headline: portText.inputAssigned(port) };
  const fix = swapped(ofPort, text, entityAround(place), place.ports);
  const headline = fix === undefined ? portText.inputAssigned(port) : portText.swapped(port, fix);
  return { headline, span: { start: ofPort.target.start, end: ofPort.target.end } };
}

/** The entity of the architecture the line is in. */
function entityAround({ lines, line }: Pick<PortErrorPlace, 'lines' | 'line'>): string | undefined {
  const header = architectureAbove(lines, line);
  return header && architectureHeaders(lines[header.line - 1] ?? '')[0]?.entity;
}

/**
 * `LEDR <= SW;` for `SW <= LEDR;`: only when the value is the whole statement, one
 * name, and a port the design drives — a signal or an expression may be meant otherwise.
 */
function swapped(assignment: Assignment, text: string, entity: string | undefined, ports: PortLookup): string | undefined {
  const endsTheStatement = text.slice(assignment.value.end).trimStart().startsWith(';');
  if (assignment.operator !== '<=' || entity === undefined || !endsTheStatement) return undefined;
  const value = assignment.value.text.trim();
  const name = ONE_NAME.exec(value)?.groups?.name;
  const mode = name === undefined ? undefined : ports(entity, name)?.mode;
  return mode !== undefined && DRIVEN_BY_THE_DESIGN.has(mode) ? `${value} <= ${assignment.target.text.trim()};` : undefined;
}
