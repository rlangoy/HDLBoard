// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * How each language assigns signals, for the multiple-driver check
 * (docs/impl_sim_only_warnings.md § 8.1): the assignments of a body, which blocks
 * make one driver, and the names a body declares. Found by pattern on blanked code,
 * like the detector's rules; an assignment inside a generate is left out, since its
 * alternatives or loop index decide what it drives. Pure.
 */

import type { CodeBlock, Language } from '../tbDetect/types';
import { verilogBits, vhdlBits, type Bits } from './bits';
import { inside, type Range } from './constructText';
import type { Assignment } from './driverTypes';

/** A body (an architecture or a module) of a file: blanked code, the source, and where the body is. */
export interface BodyText {
  readonly code: string;
  readonly source: string;
  readonly from: number;
  readonly to: number;
}

export interface DriverLanguage {
  readonly assignments: (body: BodyText) => Assignment[];
  /** Blocks whose assignments are one driver; assignments in other blocks drive nothing on the FPGA. */
  readonly drivingBlock: CodeBlock['kind'];
  readonly declared: (body: BodyText) => string[];
  /** Names as the language compares them. */
  readonly key: (name: string) => string;
}

interface AssignmentSyntax {
  readonly pattern: RegExp;
  readonly bits: (index: string | undefined) => Bits;
  readonly tristate: RegExp;
}

/** Every match of `syntax.pattern` in the body, outside `excluded`: group 1 the target, group 2 its index. */
function assignmentsBy(body: BodyText, syntax: AssignmentSyntax, excluded: readonly Range[]): Assignment[] {
  const text = body.code.slice(body.from, body.to);
  return [...text.matchAll(syntax.pattern)].flatMap((m) => {
    const at = body.from + (m.index ?? 0) + targetOffset(m[0], m[1]);
    if (inside(at, excluded)) return [];
    const statement = body.source.slice(at, statementEnd(body.code, at));
    return [{ at, target: m[1], bits: syntax.bits(m[2]), tristate: syntax.tristate.test(statement) }];
  });
}

/** Where `target` stands in `match`: the word followed by its index or the assignment. */
function targetOffset(match: string, target: string): number {
  const found = new RegExp(String.raw`(?<!\w)${target}(?=\s*(?:[\[(]|<?=))`).exec(match);
  return found?.index ?? 0;
}

const statementEnd = (code: string, from: number): number => {
  const end = code.indexOf(';', from);
  return end < 0 ? code.length : end;
};

/** Regions from each opening keyword to its matching closing one, nested ones included in the outer. */
function nestedRegions(body: BodyText, tokens: RegExp, isClose: (token: string) => boolean): Range[] {
  const regions: Range[] = [];
  let depth = 0;
  let start = 0;
  for (const m of body.code.slice(body.from, body.to).matchAll(tokens)) {
    const at = body.from + (m.index ?? 0);
    if (!isClose(m[0])) {
      if (depth++ === 0) start = at;
    } else if (depth > 0 && --depth === 0) regions.push({ from: start, to: at });
  }
  return regions;
}

const namesIn = (body: BodyText, pattern: RegExp): string[] =>
  [...body.code.slice(body.from, body.to).matchAll(pattern)].flatMap((m) =>
    m[1].split(',').flatMap((item) => /^\s*([A-Za-z_]\w*)/.exec(item)?.[1] ?? []),
  );

/* ------------------------------- VHDL ------------------------------- */

/** A target at the start of a statement: after `;`, `then`, `else`, `begin`, `=>` (a case branch) or `select`. */
const VHDL_ASSIGNMENT = /(?:;|\bthen\b|\belse\b|\bbegin\b|\bloop\b|=>|\bselect\b|\bgenerate\b)\s*(?:\w+\s*:\s*)?(?:postponed\s+)?([A-Za-z]\w*)\s*(\((?:[^;()]|\([^;()]*\))*\))?\s*<=/gi;
const VHDL_GENERATE = /\bend\s+generate\b|\bgenerate\b/gi;
const VHDL_SIGNAL = /\bsignal\s+([\w\s,]+?)\s*:/gi;

const VHDL: DriverLanguage = {
  assignments: (body) => {
    const generates = nestedRegions(body, VHDL_GENERATE, (t) => /^end/i.test(t));
    return assignmentsBy(body, { pattern: VHDL_ASSIGNMENT, bits: vhdlBits, tristate: /'[zZ]'|"[zZ_]+"/ }, generates);
  },
  drivingBlock: 'process',
  declared: (body) => namesIn(body, VHDL_SIGNAL),
  key: (name) => name.toLowerCase(),
};

/* ------------------------------ Verilog ----------------------------- */

const VERILOG_TARGET = String.raw`([A-Za-z_]\w*)\s*(\[[^\]\[]*\](?:\s*\[[^\]\[]*\])*)?`;
/** In a block: after `;`, `begin`, `else`, `)` (an `if` or event control), `:` (a case item) or `end`. */
const VERILOG_PROCEDURAL = new RegExp(String.raw`(?:;|\bbegin\b|\belse\b|\)|:|\bend\b)\s*(?:#\s*(?:\([^)]*\)|[\w.]+)\s*)?${VERILOG_TARGET}\s*<?=(?!=)`, 'g');
const VERILOG_CONTINUOUS = new RegExp(String.raw`\bassign\s+(?:#\s*(?:\([^)]*\)|[\w.]+)\s*)?${VERILOG_TARGET}\s*=(?!=)|\b(?:wire|tri)\b(?:\s+signed)?\s*(?:\[[^\]]*\]\s*)?${VERILOG_TARGET}\s*=(?!=)`, 'g');
const VERILOG_GENERATE = /\bendgenerate\b|\bgenerate\b/g;
const VERILOG_DECLARED = /\b(?:reg|wire|logic|tri|wand|wor|output|inout)\b(?:\s+(?:reg|wire|logic|signed|unsigned))*\s*(?:\[[^\]]*\]\s*)*([^;()=]*)/g;
const VERILOG_TRISTATE = /'[sS]?[bBhHoO][0-9a-fA-F_xX]*[zZ?]/;
const FOR_HEADER = /\bfor\s*\(/g;

/** `for (i = 0; i < 8; i = i + 1)`: the loop's own assignments are no drivers. */
function forHeaders(body: BodyText): Range[] {
  const text = body.code.slice(body.from, body.to);
  return [...text.matchAll(FOR_HEADER)].map((m) => {
    const open = body.from + (m.index ?? 0) + m[0].length - 1;
    return { from: open, to: closingParen(body.code, open) };
  });
}

function closingParen(code: string, open: number): number {
  let depth = 0;
  for (let i = open; i < code.length; i++) {
    depth += code[i] === '(' ? 1 : code[i] === ')' ? -1 : 0;
    if (depth === 0) return i + 1;
  }
  return code.length;
}

function verilogAssignments(body: BodyText): Assignment[] {
  const excluded = [...nestedRegions(body, VERILOG_GENERATE, (t) => t === 'endgenerate'), ...forHeaders(body)];
  const syntax = (pattern: RegExp) => ({ pattern, bits: verilogBits, tristate: VERILOG_TRISTATE });
  return [...assignmentsBy(body, syntax(VERILOG_PROCEDURAL), excluded), ...continuous(body, syntax(VERILOG_CONTINUOUS), excluded)];
}

/** `assign` has its target in group 1 or 3 (`wire x = …`): normalised to groups 1 and 2. */
function continuous(body: BodyText, syntax: AssignmentSyntax, excluded: readonly Range[]): Assignment[] {
  const text = body.code.slice(body.from, body.to);
  return [...text.matchAll(syntax.pattern)].flatMap((m) => {
    const target = m[1] ?? m[3];
    const index = m[1] !== undefined ? m[2] : m[4];
    const at = body.from + (m.index ?? 0) + targetOffset(m[0], target);
    if (inside(at, excluded)) return [];
    const statement = body.source.slice(at, statementEnd(body.code, at));
    return [{ at, target, bits: syntax.bits(index), tristate: syntax.tristate.test(statement) }];
  });
}

const VERILOG: DriverLanguage = {
  assignments: verilogAssignments,
  drivingBlock: 'always',
  declared: (body) => namesIn(body, VERILOG_DECLARED),
  key: (name) => name,
};

export const DRIVER_LANGUAGES: Readonly<Record<Language, DriverLanguage>> = { vhdl: VHDL, verilog: VERILOG };
