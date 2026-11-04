// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * An architecture pasted into a VHDL file, from a chat or another project, may
 * be `of` an entity this project does not have, have the name of an
 * architecture the project already has, or join others of its entity. These are
 * the questions asked before it goes in, and the edits the answers make. Pure.
 */

import { offsetOfLine, type RunSnapshot } from './diagnosticLocation';
import { isVhdlFile } from './fileKinds';
import { uniqueNearest } from './nearestWord';
import { applyTextEdit, splitLines, type TextEdit } from './textLines';
import {
  architectureHeaders,
  architectureKey,
  architectureLastLine,
  entityHeaders,
  sameName,
  suggestedEntityName,
  type ArchitectureHeader,
} from './vhdlUnits';

type ProjectFile = RunSnapshot['files'][number];

/** An architecture already in the project: its file and lines. */
export interface ExistingArchitecture {
  readonly fileId: string;
  readonly fileName: string;
  readonly name: string;
  readonly entity: string;
  /** Its header line, 1-based. */
  readonly line: number;
  /** Its `end architecture;` line. */
  readonly lastLine: number;
}

type Lines = Pick<ExistingArchitecture, 'line' | 'lastLine'>;

export interface EntityRename {
  readonly from: string;
  readonly to: string;
}

/** Architectures found for the paste as it was copied, and after the rename. */
export interface FoundBothWays {
  readonly asPasted: readonly ExistingArchitecture[];
  readonly renamed: readonly ExistingArchitecture[];
}

export interface PasteQuestions {
  /** The pasted architecture is of an entity no file declares: offer the one probably meant. */
  readonly rename?: EntityRename;
  /** The architectures the paste would give a second definition. */
  readonly duplicates: FoundBothWays;
  /** The other architectures of the pasted one's entity, under other names: they may stay, or go. */
  readonly others: FoundBothWays;
}

export interface PasteAnswers {
  readonly rename: boolean;
  readonly replace: boolean;
  readonly deleteOthers: boolean;
}

/** Where the paste goes: a file and the selection it replaces. */
export interface PasteTarget {
  readonly fileId: string;
  readonly selectionStart: number;
  readonly selectionEnd: number;
}

/** Whether one of `architectures` is in a file other than the one pasted into: deleting it there cannot be undone with Ctrl+Z. */
export function inAnotherFile(architectures: readonly ExistingArchitecture[], targetFileId: string): boolean {
  return architectures.some((a) => a.fileId !== targetFileId);
}

/** What the answers make of the paste: the text that goes in, and the architectures deleted. */
export interface AnsweredPaste {
  readonly text: string;
  readonly deleted: readonly ExistingArchitecture[];
}

interface Range {
  readonly start: number;
  readonly end: number;
}

/** A range of the text and what takes its place. */
export interface Replacement extends Range {
  readonly text: string;
}

/** The characters of an architecture's lines, from its header to the end of its `end architecture;` line. */
function linesRange(content: string, { line, lastLine }: Lines): Range {
  const end = Math.min(offsetOfLine(content, lastLine + 1), content.length);
  return { start: offsetOfLine(content, line), end };
}

/** Its lines and the blank line after them, so removing it leaves no gap — short of where the paste goes. */
function removalRange(content: string, architecture: Lines, insert: Range): Range {
  const lines = linesRange(content, architecture);
  const lineAfter = architecture.lastLine + 1;
  const blankAfter = splitLines(content)[lineAfter - 1]?.trim() === '';
  const end = blankAfter ? linesRange(content, { line: lineAfter, lastLine: lineAfter }).end : lines.end;
  const insertIsBelow = insert.start >= lines.end;
  return { start: lines.start, end: insertIsBelow ? Math.min(end, insert.start) : end };
}

function overlaps(a: Range, b: Range): boolean {
  return a.start < b.end && b.start < a.end;
}

type HeaderTest = (header: ArchitectureHeader) => boolean;

/**
 * The architectures of `files` that pass `wanted`, leaving out one the
 * selection touches: the paste goes over that one.
 */
function existingWhere(wanted: HeaderTest, files: readonly ProjectFile[], target: PasteTarget): ExistingArchitecture[] {
  // A caret (an empty selection) touches only an architecture it is inside of, not one it stands just before or after.
  const selection = { start: target.selectionStart, end: target.selectionEnd };
  const isPastedOver = (file: ProjectFile, existing: Lines): boolean =>
    file.id === target.fileId && overlaps(linesRange(file.content, existing), selection);
  return files.flatMap((file) =>
    architectureHeaders(file.content)
      .filter(wanted)
      .map(placedIn(file))
      .filter((existing) => !isPastedOver(file, existing)),
  );
}

/** A header of `file` as an existing architecture: where it is, and where it ends. */
function placedIn(file: ProjectFile): (header: ArchitectureHeader) => ExistingArchitecture {
  const lines = splitLines(file.content);
  return ({ name, entity, line }) => ({ fileId: file.id, fileName: file.name, name, entity, line, lastLine: architectureLastLine(lines, line) });
}

/** An architecture one of `pasted` would define again. */
function isDuplicateOf(pasted: readonly ArchitectureHeader[]): HeaderTest {
  const keys = new Set(pasted.map(architectureKey));
  return (header) => keys.has(architectureKey(header));
}

/** Another architecture of a pasted one's entity, under a name none of `pasted` has. */
function isOtherOf(pasted: readonly ArchitectureHeader[]): HeaderTest {
  const isDuplicate = isDuplicateOf(pasted);
  return (header) => pasted.some((p) => sameName(p.entity, header.entity)) && !isDuplicate(header);
}

function withEntityRenamed(headers: readonly ArchitectureHeader[], rename: EntityRename): ArchitectureHeader[] {
  return headers.map((h) => (sameName(h.entity, rename.from) ? { ...h, entity: rename.to } : h));
}

/** The paste and where it goes, as the searches for existing architectures need them. */
interface PasteSearch {
  readonly headers: readonly ArchitectureHeader[];
  readonly rename: EntityRename | undefined;
  readonly files: readonly ProjectFile[];
  readonly target: PasteTarget;
}

/** What `test` finds for the paste as copied and after `rename`. */
function foundBothWays(test: (pasted: readonly ArchitectureHeader[]) => HeaderTest, { headers, rename, files, target }: PasteSearch): FoundBothWays {
  const asPasted = existingWhere(test(headers), files, target);
  if (rename === undefined) return { asPasted, renamed: asPasted };
  return { asPasted, renamed: existingWhere(test(withEntityRenamed(headers, rename)), files, target) };
}

/** The architectures `found` names as the rename stands: applied or not. */
export function foundAsRenamed(found: FoundBothWays, renameApplied: boolean): readonly ExistingArchitecture[] {
  return renameApplied ? found.renamed : found.asPasted;
}

/**
 * The entity to offer for an unknown one: a near spelling of a declared entity
 * (`countr` → `counter`), else the target file's own entity (a chat's
 * `de1_soc_top` pasted into DE1_SoC.vhd), else the only entity there is.
 */
function entityToOffer(unknown: string, targetFile: ProjectFile, declared: readonly string[]): string | undefined {
  const own = entityHeaders(targetFile.content);
  const ownEntity = own.length === 1 ? own[0].name : undefined;
  return uniqueNearest(unknown, declared) ?? ownEntity ?? suggestedEntityName(unknown, declared);
}

/**
 * The first pasted architecture of an entity neither the project nor the paste
 * declares, and the entity to offer instead. A second unknown entity in the same
 * paste is left as it is: one paste is one architecture, nearly always.
 */
function renameFor(pasted: string, targetFile: ProjectFile, vhdlFiles: readonly ProjectFile[]): EntityRename | undefined {
  const sources = [...vhdlFiles.map((file) => file.content), pasted];
  const declared = sources.flatMap((content) => entityHeaders(content).map((e) => e.name));
  const unknown = architectureHeaders(pasted).find((h) => !declared.some((name) => sameName(name, h.entity)))?.entity;
  if (unknown === undefined) return undefined;
  const offered = entityToOffer(unknown, targetFile, declared);
  return offered === undefined ? undefined : { from: unknown, to: offered };
}

/**
 * What to ask before `pasted` goes into the target file, or `undefined` when it
 * holds no architecture that needs a question (or the file is not VHDL).
 * `files` are those compiled with the target (`filesForRun`), the target's text
 * exactly as the textarea holds it, so the selection's offsets fit it.
 */
export function pasteQuestions(pasted: string, target: PasteTarget, files: readonly ProjectFile[]): PasteQuestions | undefined {
  const targetFile = files.find((file) => file.id === target.fileId);
  const headers = architectureHeaders(pasted);
  if (targetFile === undefined || !isVhdlFile(targetFile) || headers.length === 0) return undefined;
  const vhdlFiles = files.filter(isVhdlFile);
  const rename = renameFor(pasted, targetFile, vhdlFiles);
  const search = { headers, rename, files: vhdlFiles, target };
  const duplicates = foundBothWays(isDuplicateOf, search);
  const others = foundBothWays(isOtherOf, search);
  const asksNothing = rename === undefined && duplicates.asPasted.length === 0 && others.asPasted.length === 0;
  return asksNothing ? undefined : { rename, duplicates, others };
}

/** `pasted` with `rename.from` after `of` in its architecture headers changed to `rename.to`. */
export function renamePasted(pasted: string, rename: EntityRename): string {
  // From the last header up, so the offsets of the ones above stay true.
  return architectureHeaders(pasted)
    .filter((h) => sameName(h.entity, rename.from))
    .reduceRight((text, h) => {
      const at = offsetOfLine(text, h.line) + h.entityStart;
      return text.slice(0, at) + rename.to + text.slice(at + h.entity.length);
    }, pasted);
}

/** The text that goes in and the architectures it deletes, as answered. */
export function answeredPaste(pasted: string, questions: PasteQuestions, answers: PasteAnswers): AnsweredPaste {
  const rename = answers.rename ? questions.rename : undefined;
  const renameApplied = rename !== undefined;
  const deleted = [
    ...(answers.replace ? foundAsRenamed(questions.duplicates, renameApplied) : []),
    ...(answers.deleteOthers ? foundAsRenamed(questions.others, renameApplied) : []),
  ];
  return { text: rename ? renamePasted(pasted, rename) : pasted, deleted };
}

/**
 * One edit of `content` that removes the `removed` architectures and puts
 * `insert` in its range: one edit, so one Ctrl+Z undoes it all. The caret goes
 * to the end of the inserted text. `insert` must not overlap the architectures' lines.
 */
export function removeAndInsert(content: string, removed: readonly Lines[], insert: Replacement): TextEdit {
  const pieces: Replacement[] = [...removed.map((architecture) => ({ ...removalRange(content, architecture, insert), text: '' })), insert];
  // An insert where a removal starts goes first: its range is empty.
  pieces.sort((a, b) => a.start - b.start || a.end - b.end);
  const offset = pieces[0].start;
  let text = '';
  let at = offset;
  let caret = offset;
  for (const piece of pieces) {
    text += content.slice(at, piece.start) + piece.text;
    at = piece.end;
    if (piece === insert) caret = offset + text.length;
  }
  return { offset, removed: at - offset, text, caret };
}

/** `content` without the `removed` architectures: another file the paste deletes from. */
export function withoutArchitectures(content: string, removed: readonly Lines[]): string {
  const nothingInserted = { start: 0, end: 0, text: '' };
  return applyTextEdit(content, removeAndInsert(content, removed, nothingInserted));
}
