// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * The Quick Fix for a missing package: where `use ieee.numeric_std.all;` goes in
 * a VHDL file, and whether the file can take it. Pure: it reads the source text
 * and returns an insertion; applying it is the editor's job.
 */

import { offsetOfLine } from './diagnosticLocation';
import { tokenizeVhdlLine } from './vhdlHighlight';
import {
  isSamePackage,
  libraryClauseText,
  needsLibraryClause,
  packagesClashingWith,
  useClauseText,
  type VhdlPackage,
} from './vhdlPackages';

/** Text to insert at one offset of the file. */
export interface TextInsertion {
  readonly offset: number;
  readonly text: string;
  /** Where the caret goes once inserted: the end of the new `use` clause, so the student sees it. */
  readonly caret: number;
}

/** One `library` or `use` clause: `use ieee.numeric_std.all, work.defs.all;` has two names. */
interface ContextClause {
  readonly keyword: 'library' | 'use';
  /** 1-based. */
  readonly line: number;
  /** As written, lower case: `ieee`, or `ieee.numeric_std.all`. */
  readonly names: readonly string[];
}

const CLAUSE = /^(?<keyword>library|use)\s+(?<names>.+)$/i;
/** The words that start a primary design unit: each gets the context clauses written just before it. */
const PRIMARY_UNIT_KEYWORDS: ReadonlySet<string> = new Set(['entity', 'package', 'configuration']);
const LEADING_WHITESPACE = /^[ \t]*/;
const CRLF = '\r\n';
const LF = '\n';

function codeOf(line: string): string {
  return tokenizeVhdlLine(line)
    .filter((token) => token.type !== 'comment')
    .map((token) => token.text)
    .join('');
}

/** The clauses of one line; a line may hold several (`library ieee; use ieee.std_logic_1164.all;`). */
function clausesOnLine(text: string, line: number): ContextClause[] {
  return codeOf(text)
    .split(';')
    .flatMap((statement) => {
      const groups = CLAUSE.exec(statement.trim())?.groups;
      if (groups === undefined) return [];
      const keyword = groups.keyword.toLowerCase() as ContextClause['keyword'];
      const names = groups.names.split(',').map((name) => name.replace(/\s+/g, '').toLowerCase());
      return [{ keyword, line, names }];
    });
}

/** The 1-based lines that start a primary design unit (`entity`, `package`, `package body`, `configuration`). */
function primaryUnitStarts(lines: readonly string[]): number[] {
  const firstWord = (text: string) => codeOf(text).trim().split(/\s+/)[0]?.toLowerCase() ?? '';
  return lines.flatMap((text, i) => (PRIMARY_UNIT_KEYWORDS.has(firstWord(text)) ? [i + 1] : []));
}

/** The context of the code on a line: the clauses that apply to it, and where its design unit starts. */
interface Context {
  readonly clauses: readonly ContextClause[];
  /** The first line of the primary unit the line belongs to; undefined when none is above it. */
  readonly unitStart?: number;
}

/**
 * A context clause applies to the next design unit only (and that unit's architecture or
 * body), so the clauses that apply to `line` are those between the unit before its own
 * and its own. With no unit above the line, every clause above it counts.
 */
function contextOf(lines: readonly string[], line: number): Context {
  const starts = primaryUnitStarts(lines).filter((start) => start <= line);
  const unitStart = starts[starts.length - 1];
  const after = starts[starts.length - 2] ?? 0;
  const end = unitStart ?? line;
  const clauses = lines.slice(after, end - 1).flatMap((text, i) => clausesOnLine(text, after + i + 1));
  return { clauses, unitStart };
}

function usesPackage(clauses: readonly ContextClause[], pkg: VhdlPackage): boolean {
  return clauses.some(
    (clause) =>
      clause.keyword === 'use' &&
      clause.names.some((name) => {
        const [library = '', packageName = ''] = name.split('.');
        return isSamePackage({ library, name: packageName }, pkg);
      }),
  );
}

function declaresLibrary(clauses: readonly ContextClause[], library: string): boolean {
  const wanted = library.toLowerCase();
  return clauses.some((clause) => clause.keyword === 'library' && clause.names.includes(wanted));
}

function splitLines(content: string): string[] {
  return content.split(LF).map((line) => line.replace(/\r$/, ''));
}

/** The package already used above `line` that cannot be used together with `pkg` (`std_logic_arith` for `numeric_std`). */
export function clashingPackageInUse(content: string, pkg: VhdlPackage, line: number): VhdlPackage | undefined {
  const { clauses } = contextOf(splitLines(content), line);
  return packagesClashingWith(pkg).find((other) => usesPackage(clauses, other));
}

/** The first line that holds code, or line 1: a new context clause goes after a file's header comment. */
function firstCodeLine(lines: readonly string[]): number {
  const index = lines.findIndex((text) => codeOf(text).trim().length > 0);
  return index < 0 ? 1 : index + 1;
}

/** The new clauses, in order: `library ieee;` only when no clause above declares it. */
function newClauses(clauses: readonly ContextClause[], pkg: VhdlPackage): string[] {
  const library = needsLibraryClause(pkg) && !declaresLibrary(clauses, pkg.library);
  return library ? [libraryClauseText(pkg), useClauseText(pkg)] : [useClauseText(pkg)];
}

/** The file being edited: its text, its lines without line endings, and the line ending it uses. */
interface Source {
  readonly content: string;
  readonly lines: readonly string[];
  readonly eol: string;
}

function sourceOf(content: string): Source {
  return { content, lines: splitLines(content), eol: content.includes(CRLF) ? CRLF : LF };
}

/** Under the last clause above the error, indented like it. */
function insertBelow({ content, lines, eol }: Source, anchor: number, added: readonly string[]): TextInsertion {
  const indent = LEADING_WHITESPACE.exec(lines[anchor - 1])?.[0] ?? '';
  const block = added.map((clause) => `${indent}${clause}`).join(eol);
  if (anchor === lines.length) {
    return { offset: content.length, text: `${eol}${block}`, caret: content.length + eol.length + block.length };
  }
  const offset = offsetOfLine(content, anchor + 1);
  return { offset, text: `${block}${eol}`, caret: offset + block.length };
}

/** A unit with no clauses yet: the new ones go before it (or the file's first code), with a blank line after them. */
function insertBefore({ content, lines, eol }: Source, unitStart: number | undefined, added: readonly string[]): TextInsertion {
  const offset = offsetOfLine(content, unitStart ?? firstCodeLine(lines));
  const block = added.join(eol);
  return { offset, text: `${block}${eol}${eol}`, caret: offset + block.length };
}

/**
 * Where `use <pkg>.all;` goes so that the code on `line` sees it: right below the
 * last `library`/`use` clause in front of that line's design unit (adding
 * `library ieee;` when it is missing), else just before the unit. `undefined` when
 * the package is already used there, or a package that clashes with it is.
 */
export function addUseClause(content: string, pkg: VhdlPackage, line: number): TextInsertion | undefined {
  const source = sourceOf(content);
  const { clauses, unitStart } = contextOf(source.lines, line);
  if (usesPackage(clauses, pkg) || clashingPackageInUse(content, pkg, line)) return undefined;
  const added = newClauses(clauses, pkg);
  const anchor = clauses[clauses.length - 1]?.line;
  return anchor === undefined ? insertBefore(source, unitStart, added) : insertBelow(source, anchor, added);
}

/** The file with the insertion made. */
export function applyInsertion(content: string, insertion: TextInsertion): string {
  return `${content.slice(0, insertion.offset)}${insertion.text}${content.slice(insertion.offset)}`;
}
