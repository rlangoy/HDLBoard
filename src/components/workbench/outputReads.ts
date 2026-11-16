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
import { assignmentOn } from './vhdlExpression';
import { tokenizeVhdlLine } from './vhdlHighlight';
import { architectureHeaders, entityHeaders, sameName, type ArchitectureHeader, type EntityHeader } from './vhdlUnits';

/** Where a condition is read, after its keyword. */
const CONDITION = /^\s*(?:if|elsif|case|while)\b/i;

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
    return body.flatMap((text, i) => readsOn(text, modeOf).map((read) => ({ ...read, line: architecture.line + 1 + i })));
  });
}

/** The mode of a port of the architecture's entity, declared in the same file; undefined for any other name. */
function portModesOf(architecture: ArchitectureHeader, entities: readonly EntityHeader[], declarations: VhdlDeclarations): ModeOf {
  const entity = entities.find((e) => sameName(e.name, architecture.entity));
  if (entity === undefined) return () => undefined;
  const nextUnit = Math.min(...entities.map((e) => e.line).filter((line) => line > entity.line), Number.POSITIVE_INFINITY);
  return (name) => {
    const port = declarations.portAfter(entity.line, name);
    return port !== undefined && port.line < nextUnit ? port.mode : undefined;
  };
}

type ModeOf = (name: string) => PortMode | undefined;

/** The `out` ports the line reads, each where it is written. */
function readsOn(text: string, modeOf: ModeOf): Omit<OutputRead, 'line'>[] {
  const from = readingPartStart(text, modeOf);
  if (from === undefined) return [];
  const reads: Omit<OutputRead, 'line'>[] = [];
  let start = 0;
  for (const { text: word, type } of tokenizeVhdlLine(text)) {
    const isRead = start >= from && type === 'identifier' && !isAttributePrefix(text, start + word.length) && modeOf(word) === 'out';
    if (isRead) reads.push({ port: word, index: start });
    start += word.length;
  }
  return reads;
}

/**
 * Where the part of the line that is read starts: an assignment's value, or a condition.
 * An assignment to an input port is GHDL's error already, with advice of its own
 * (portModeAdvice.ts): its value is not warned about as well.
 */
function readingPartStart(text: string, modeOf: ModeOf): number | undefined {
  const condition = CONDITION.exec(text);
  if (condition !== null) return condition[0].length;
  const assignment = assignmentOn(text);
  return assignment === undefined || modeOf(assignment.targetName) === 'in' ? undefined : assignment.value.start;
}

/** `LEDR'length`: the name is followed by an attribute, which reads no value. */
function isAttributePrefix(text: string, end: number): boolean {
  return /^\s*'[A-Za-z]/.test(text.slice(end)) && !/^\s*'.'/.test(text.slice(end));
}
