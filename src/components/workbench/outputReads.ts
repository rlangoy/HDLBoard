// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * An `out` port read inside its own design (`LEDR <= LEDR(8 downto 0) & '0';`):
 * VHDL-2008, which HDLBoard compiles, allows it, so GHDL says nothing; VHDL-93 does
 * not, and many FPGA tools still default to it, so a design that runs here fails to
 * build there. HDLBoard checks the run's files itself at Start, as it does for
 * duplicate architectures (duplicateArchitectures.ts), and warns. Pure.
 *
 * What counts as a read: a name on the right of an assignment, or in an `if`,
 * `elsif`, `case` or `while` condition. An attribute (`LEDR'length`) is no read, and a
 * port map (`LEDR => LEDR`) connects the port rather than reading it.
 */

import type { RunSnapshot } from './diagnosticLocation';
import { projectCheckText } from './diagnosticText';
import { isVhdlFile } from './fileKinds';
import { indexToGhdlColumn } from './ghdlColumn';
import { splitLines } from './textLines';
import { VhdlDeclarations, type PortMode } from './vhdlDeclarations';
import { assignmentOn, codeShape } from './vhdlExpression';
import { tokenizeVhdlLine } from './vhdlHighlight';
import { architectureHeaders, entityHeaders, sameName, type ArchitectureHeader, type EntityHeader } from './vhdlUnits';

/** A condition, read from after its keyword up to the keyword that ends it (or the line's end). */
const CONDITION = /^\s*(?:if|elsif|case|while)\b/i;
const CONDITION_END = /\b(?:then|loop|is)\b/i;
/** A keyword that only opens what follows it on the line: `else LEDR <= '0';`. */
const OPENING_KEYWORD = /^\s*(?:else|begin|then|loop)\b/i;

/** Columns of a line, from `start` up to `end`. */
interface Span {
  readonly start: number;
  readonly end: number;
}

/** One `out` port read: its name as written, and where. */
interface OutputRead {
  readonly port: string;
  /** 1-based. */
  readonly line: number;
  /** 0-based, in the line. */
  readonly index: number;
}

/** A warning, in GHDL's format, on every place a design reads one of its own `out` ports. */
export function outputReadWarnings(snapshot: RunSnapshot): string[] {
  return snapshot.files.filter(isVhdlFile).flatMap((file) => {
    const lines = splitLines(file.content);
    return outputReadsIn(file.content, lines).map(({ port, line, index }) => {
      const column = indexToGhdlColumn(lines[line - 1] ?? '', index);
      return `${file.name}:${line}:${column}:warning: ${projectCheckText.outputRead(port)}`;
    });
  });
}

function outputReadsIn(content: string, lines: readonly string[]): OutputRead[] {
  const declarations = new VhdlDeclarations(lines);
  const entities = entityHeaders(content);
  const units = [...entities.map((e) => e.line), ...architectureHeaders(content).map((a) => a.line)];
  return architectureHeaders(content).flatMap((architecture) => {
    const modeOf = portModesOf(architecture, entities, declarations);
    const end = Math.min(...units.filter((line) => line > architecture.line), lines.length + 1);
    const body = lines.slice(architecture.line, end - 1);
    return body.flatMap((text, i) => {
      const line = architecture.line + 1 + i;
      return readsOn(text, (name) => modeOf(name, line)).map((read) => ({ ...read, line }));
    });
  });
}

/**
 * The mode of a port of the architecture's entity, declared in the same file, where `line`
 * sees it; undefined for any other name, and where a local of the same name (a subprogram's
 * parameter, a variable) hides the port.
 */
function portModesOf(architecture: ArchitectureHeader, entities: readonly EntityHeader[], declarations: VhdlDeclarations): ModeOnLine {
  const entity = entities.find((e) => sameName(e.name, architecture.entity));
  if (entity === undefined) return () => undefined;
  const nextUnit = Math.min(...entities.map((e) => e.line).filter((line) => line > entity.line), Number.POSITIVE_INFINITY);
  return (name, line) => {
    const port = declarations.portAfter(entity.line, name);
    if (port === undefined || port.line >= nextUnit) return undefined;
    const seen = declarations.objectAt(name, line);
    return seen === undefined || seen.objectClass === 'port' ? port.mode : undefined;
  };
}

type ModeOnLine = (name: string, line: number) => PortMode | undefined;
/** A name's port mode on one line. */
type ModeOf = (name: string) => PortMode | undefined;

/** The `out` ports the line reads, each where it is written. */
function readsOn(text: string, modeOf: ModeOf): Omit<OutputRead, 'line'>[] {
  const read = readSpans(text, modeOf);
  const isReadAt = (index: number) => read.some((span) => index >= span.start && index < span.end);
  const reads: Omit<OutputRead, 'line'>[] = [];
  let start = 0;
  for (const { text: word, type } of tokenizeVhdlLine(text)) {
    const isRead = isReadAt(start) && type === 'identifier' && !isAttributePrefix(text, start + word.length) && modeOf(word) === 'out';
    if (isRead) reads.push({ port: word, index: start });
    start += word.length;
  }
  return reads;
}

/** The parts of the line that read values: in each of its statements, conditions and an assigned value. */
function readSpans(text: string, modeOf: ModeOf): Span[] {
  const shape = codeShape(text);
  return statementsOf(shape).flatMap((statement) => readSpansIn(shape, statement, modeOf));
}

/** The statements on the line, each up to its `;` (a literal's `;` is filled out of the shape). */
function statementsOf(shape: string): Span[] {
  const statements: Span[] = [];
  let start = 0;
  for (let end = shape.indexOf(';'); end !== -1; end = shape.indexOf(';', start)) {
    statements.push({ start, end });
    start = end + 1;
  }
  if (shape.slice(start).trim() !== '') statements.push({ start, end: shape.length });
  return statements;
}

/**
 * What one statement reads: the conditions it opens with (`if … then`, `case … is`), then
 * the value of the assignment after them, `when` conditions included. An assignment to an
 * input port is GHDL's error already, with advice of its own (portModeAdvice.ts): its
 * value is not warned about too.
 */
function readSpansIn(shape: string, statement: Span, modeOf: ModeOf): Span[] {
  const spans: Span[] = [];
  let at = statement.start;
  for (let part = leadingPart(shape.slice(at, statement.end)); part !== undefined; part = leadingPart(shape.slice(at, statement.end))) {
    if (part.condition) spans.push({ start: at + part.condition.start, end: at + part.condition.end });
    at += part.length;
  }
  const assignment = assignmentOn(shape.slice(at, statement.end));
  if (assignment !== undefined && modeOf(assignment.targetName) !== 'in') spans.push({ start: at + assignment.value.start, end: statement.end });
  return spans;
}

/** A condition or an opening keyword at the start of `rest`, and how much of `rest` it takes. */
function leadingPart(rest: string): { length: number; condition?: Span } | undefined {
  const condition = CONDITION.exec(rest);
  if (condition !== null) {
    const start = condition[0].length;
    const close = CONDITION_END.exec(rest.slice(start));
    if (close === null) return { length: rest.length, condition: { start, end: rest.length } };
    return { length: start + close.index + close[0].length, condition: { start, end: start + close.index } };
  }
  const keyword = OPENING_KEYWORD.exec(rest);
  return keyword === null ? undefined : { length: keyword[0].length };
}

/** `LEDR'length`: the name is followed by an attribute, which reads no value. */
function isAttributePrefix(text: string, end: number): boolean {
  return /^\s*'[A-Za-z]/.test(text.slice(end)) && !/^\s*'.'/.test(text.slice(end));
}
