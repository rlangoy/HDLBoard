// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * The board rename (docs/board_io_config_spec.md § 7): find and replace on whole
 * identifiers, never on text.
 *
 * Contract: rename whole identifiers whose name equals one of the old board's port
 * names, in every HDL file, consistently. Rename the same names in comments where the
 * file also uses them in code. Change nothing else. If a file cannot be renamed
 * safely, change no file at all and say why.
 *
 * It uses the editor's own tokenizer, so comments, strings and identifiers are exactly
 * what the editor colours as such. It is not a semantic refactoring: it does not know
 * whether `KEY_N` is a port or a signal, but renaming every occurrence in every file the
 * same way keeps the design's meaning — unless two names merge, which the conflict
 * check prevents.
 */

import { languageOfName, type Language } from '../components/workbench/fileKinds';
import { tokenizeSource } from '../components/workbench/highlight';
import type { Token } from '../components/workbench/vhdlHighlight';
import type { SavedWaveSignal, SavedWaveViews } from '../project/types';
import { DEFAULT_BOARD } from './boardCatalog';
import { renamesBetween, type PortRename } from './boardPorts';
import type { BoardDefinition } from './types';

export type SourceRename =
  | { readonly ok: true; readonly text: string; readonly count: number }
  | { readonly ok: false; readonly reasons: readonly string[] };

export const UNREADABLE_REASON = 'could not be read safely';

/** A name as a word: no letter, digit, `_` or `$` either side (`HEX0_N_reg` holds no `HEX0_N`). */
const WORD_CHAR = '[A-Za-z0-9_$]';
const PLAIN_NAME = /^[A-Za-z_][A-Za-z0-9_$]*$/;
const MACRO_MARK = '`';
const EXTENDED_IDENTIFIER_MARK = '\\';

/** Token kinds that can be a name. `keyword` too: the VHDL tokenizer colours a few plain names as one. */
const NAME_TOKEN_TYPES: ReadonlySet<Token['type']> = new Set(['identifier', 'type', 'keyword', 'directive']);

/** One token, and the name it stands for when it is one (a macro use `` `KEY_N `` stands for `KEY_N`). */
interface ReadToken {
  readonly token: Token;
  readonly name?: string;
}

function escapeForRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** The name a token stands for, if it is a name at all; `previous` tells a VHDL `\extended\` identifier. */
function nameOf(token: Token, previous: Token | undefined): string | undefined {
  if (!NAME_TOKEN_TYPES.has(token.type)) return undefined;
  if (token.type === 'directive') return token.text.slice(MACRO_MARK.length);
  const insideExtendedIdentifier = previous?.type === 'punctuation' && previous.text.endsWith(EXTENDED_IDENTIFIER_MARK);
  return PLAIN_NAME.test(token.text) && !insideExtendedIdentifier ? token.text : undefined;
}

/** Each line's tokens, or undefined when the tokenizer fails or loses a character (fail closed). */
function readLines(language: Language, lines: readonly string[]): ReadToken[][] | undefined {
  let tokenized: Token[][];
  try {
    tokenized = tokenizeSource(language, lines);
  } catch {
    return undefined;
  }
  const complete = tokenized.every((tokens, i) => tokens.map((t) => t.text).join('') === lines[i]);
  if (!complete) return undefined;
  return tokenized.map((tokens) => tokens.map((token, i) => ({ token, name: nameOf(token, tokens[i - 1]) })));
}

/** Every spelling each name is written in, by its lower-case form. */
function spellingsByKey(lines: readonly ReadToken[][]): Map<string, Set<string>> {
  const spellings = new Map<string, Set<string>>();
  for (const { name } of lines.flat()) {
    if (name === undefined) continue;
    const key = name.toLowerCase();
    spellings.set(key, (spellings.get(key) ?? new Set<string>()).add(name));
  }
  return spellings;
}

/**
 * Why renaming would merge two names: the new name is taken (`signal key` beside
 * `KEY_N` → `KEY`), or — Verilog being case-sensitive — one old name is spelled two
 * ways, which are two names there and would become one.
 */
function conflicts(
  renames: readonly PortRename[],
  used: ReadonlyMap<string, ReadonlySet<string>>,
  language: Language,
): string[] {
  const renamedAway = new Set(renames.map((r) => r.from.toLowerCase()));
  return renames.flatMap(({ from, to }) => {
    const spellings = used.get(from.toLowerCase());
    if (spellings === undefined) return [];
    const reasons: string[] = [];
    const target = to.toLowerCase();
    if (used.has(target) && !renamedAway.has(target)) reasons.push(`${to} is already a name in this file`);
    if (language === 'verilog' && spellings.size > 1) reasons.push(`${[...spellings].join(' and ')} are different names in Verilog`);
    return reasons;
  });
}

/**
 * Whitespace after a renamed name, so aligned columns stay aligned (`KEY_N    : in` ↔
 * `KEY      : in`). Only a run of two or more spaces is changed, by `lengthChange`
 * (the old name's length minus the new one's), and never below one space. A single
 * space and whitespace with a tab are left alone: with a tab the column depends on
 * the editor's tab width.
 */
export function keepColumn(whitespace: string, lengthChange: number): string {
  const isAlignment = whitespace.length >= 2 && /^ +$/.test(whitespace);
  if (!isAlignment) return whitespace;
  return ' '.repeat(Math.max(1, whitespace.length + lengthChange));
}

interface Rewritten {
  readonly text: string;
  readonly count: number;
}

/**
 * The words a comment may have renamed: the old names the file also uses in code, as
 * whole words in their exact case, with what each becomes. Built once per file.
 */
interface CommentWords {
  readonly pattern: RegExp;
  readonly byName: ReadonlyMap<string, string>;
}

/** One file's renames, as every line of it needs them. */
interface FileRenames {
  /** The renames by the old name, lower case: how a name in code is looked up. */
  readonly byKey: ReadonlyMap<string, PortRename>;
  /** Undefined when the file uses none of the old names in code: its comments stay as they are. */
  readonly commentWords?: CommentWords;
}

function commentWordsOf(renames: readonly PortRename[], used: ReadonlyMap<string, unknown>): CommentWords | undefined {
  const inCode = renames.filter((r) => used.has(r.from.toLowerCase()));
  if (inCode.length === 0) return undefined;
  const alternatives = inCode.map((r) => escapeForRegExp(r.from)).join('|');
  return {
    pattern: new RegExp(`(?<!${WORD_CHAR})(?:${alternatives})(?!${WORD_CHAR})`, 'g'),
    byName: new Map(inCode.map((r) => [r.from, r.to])),
  };
}

/** One comment with the board names the file also uses in code renamed, whole words and exact case only. */
function renameInComment(comment: string, words: CommentWords | undefined): Rewritten {
  if (words === undefined) return { text: comment, count: 0 };
  let count = 0;
  const text = comment.replace(words.pattern, (found) => {
    count++;
    return words.byName.get(found) ?? found;
  });
  return { text, count };
}

/** One line rewritten in a single pass, so a swap (A→B, B→A) or a chain cannot cascade. */
function renameInLine(line: readonly ReadToken[], file: FileRenames): Rewritten {
  let count = 0;
  let lengthChange: number | undefined;
  const parts = line.map(({ token, name }) => {
    const shift = lengthChange;
    lengthChange = undefined;
    if (token.type === 'comment') {
      const comment = renameInComment(token.text, file.commentWords);
      count += comment.count;
      return comment.text;
    }
    if (token.type === 'whitespace') return shift === undefined ? token.text : keepColumn(token.text, shift);
    const rename = name === undefined ? undefined : file.byKey.get(name.toLowerCase());
    if (rename === undefined) return token.text;
    count++;
    const renamed = token.type === 'directive' ? `${MACRO_MARK}${rename.to}` : rename.to;
    lengthChange = token.text.length - renamed.length;
    return renamed;
  });
  return { text: parts.join(''), count };
}

/**
 * One file's text with the board's port names renamed. Lines are split on `\n` only,
 * so `\r\n` endings and a leading byte-order mark come through byte for byte, and the
 * line numbers never change.
 */
export function renameInSource(text: string, language: Language, renames: readonly PortRename[]): SourceRename {
  const rawLines = text.split('\n');
  const lines = readLines(language, rawLines);
  if (lines === undefined) return { ok: false, reasons: [UNREADABLE_REASON] };

  const used = spellingsByKey(lines);
  const reasons = conflicts(renames, used, language);
  if (reasons.length > 0) return { ok: false, reasons };

  const file: FileRenames = { byKey: new Map(renames.map((r) => [r.from.toLowerCase(), r])), commentWords: commentWordsOf(renames, used) };
  const rewritten = lines.map((line) => renameInLine(line, file));
  const count = rewritten.reduce((sum, line) => sum + line.count, 0);
  return { ok: true, text: rewritten.map((line) => line.text).join('\n'), count };
}

/** A built-in source on a board: its text, and why it is still in the Default names when it could not be translated. */
export interface Translation {
  readonly text: string;
  /** Set when the text is as written: the reasons the rename gave. */
  readonly untranslated?: readonly string[];
}

/**
 * A built-in source, written in the Default board's names, as it reads on `board`.
 * A thin wrapper around renameInSource for the examples, the starter files and the New
 * File template; it has nothing to do with the interactive board change. The built-in
 * boards never conflict (tested), but a user board or a file the student names can
 * (`clk` already in the file, a new file called `key`): the source then comes back as
 * written, with the reasons, and the caller says so.
 */
export function translateFromDefault(text: string, language: Language, board: BoardDefinition): Translation {
  if (board.id === DEFAULT_BOARD.id) return { text };
  const result = renameInSource(text, language, renamesBetween(DEFAULT_BOARD, board));
  return result.ok ? { text: result.text } : { text, untranslated: result.reasons };
}

// --- The whole project ---------------------------------------------------------

/** The part of a file the rename needs. */
export interface RenameableFile {
  readonly id: string;
  readonly name: string;
  readonly content: string;
}

export interface FileChange {
  readonly fileId: string;
  readonly fileName: string;
  readonly text: string;
  readonly count: number;
}

export interface FileConflict {
  readonly fileName: string;
  readonly reasons: readonly string[];
}

export interface BoardChangePlan {
  readonly from: BoardDefinition;
  readonly to: BoardDefinition;
  readonly renames: readonly PortRename[];
  /** The files array the plan was made from, checked again before it is applied. */
  readonly basis: readonly RenameableFile[];
  /** Only the files that change. */
  readonly changes: readonly FileChange[];
  /** Not empty: the plan cannot be applied, and no file changes (all or nothing). */
  readonly conflicts: readonly FileConflict[];
  readonly totalCount: number;
}

/** What renaming every HDL file from `from`'s names to `to`'s would do. A query: nothing changes. */
export function planBoardChange(files: readonly RenameableFile[], from: BoardDefinition, to: BoardDefinition): BoardChangePlan {
  const renames = renamesBetween(from, to);
  const changes: FileChange[] = [];
  const conflictList: FileConflict[] = [];
  for (const file of files) {
    const language = languageOfName(file.name);
    if (language === undefined || renames.length === 0) continue;
    const result = renameInSource(file.content, language, renames);
    if (!result.ok) conflictList.push({ fileName: file.name, reasons: result.reasons });
    else if (result.count > 0) changes.push({ fileId: file.id, fileName: file.name, text: result.text, count: result.count });
  }
  const totalCount = changes.reduce((sum, change) => sum + change.count, 0);
  return { from, to, renames, basis: files, changes, conflicts: conflictList, totalCount };
}

export function canApply(plan: BoardChangePlan): boolean {
  return plan.conflicts.length === 0;
}

/** The files with the plan's changes. Precondition: `canApply(plan)`. Returns a new array; the input is unchanged. */
export function applyBoardChange<T extends RenameableFile>(files: readonly T[], plan: BoardChangePlan): T[] {
  if (!canApply(plan)) throw new Error('A board change with conflicts cannot be applied');
  const textById = new Map(plan.changes.map((change) => [change.fileId, change.text]));
  return files.map((file) => {
    const text = textById.get(file.id);
    return text === undefined ? file : { ...file, content: text };
  });
}

/**
 * The new name in the case the simulator wrote the old one in: GHDL lower-cases VHDL
 * names (`uut/key_n`), Icarus keeps Verilog's (`uut/KEY_N`), and a saved view must still
 * match the next run's paths exactly.
 */
function inSpellingOf(segment: string, to: string): string {
  return segment === segment.toLowerCase() ? to.toLowerCase() : to;
}

/** A saved signal path (`uut/KEY_N`) with each segment that is an old port name renamed. */
function renamePath(path: string, byKey: ReadonlyMap<string, PortRename>): string {
  return path
    .split('/')
    .map((segment) => {
      const rename = byKey.get(segment.toLowerCase());
      return rename === undefined ? segment : inSpellingOf(segment, rename.to);
    })
    .join('/');
}

function renameSignals(signals: readonly SavedWaveSignal[], byKey: ReadonlyMap<string, PortRename>): SavedWaveSignal[] {
  return signals.map((signal) => ({ ...signal, path: renamePath(signal.path, byKey) }));
}

/** The saved waveform views with the renamed ports, so a testbench's view still finds `uut/KEY`. */
export function renameWaveViews(views: SavedWaveViews | undefined, renames: readonly PortRename[]): SavedWaveViews | undefined {
  if (views === undefined || renames.length === 0) return views;
  const byKey = new Map(renames.map((r) => [r.from.toLowerCase(), r]));
  return Object.fromEntries(
    Object.entries(views).map(([testbench, view]) => [
      testbench,
      {
        ...view,
        signals: renameSignals(view.signals, byKey),
        ...(view.notShown !== undefined ? { notShown: renameSignals(view.notShown, byKey) } : {}),
      },
    ]),
  );
}
