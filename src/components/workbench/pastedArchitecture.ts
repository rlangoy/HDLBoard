// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * An architecture pasted into a VHDL file, from a chat or another project, is
 * often `of` an entity this project does not have, or has the name of an
 * architecture the project already has. These are the two questions asked
 * before it goes in, and the edits the answers make. Pure.
 */

import { offsetOfLine, type RunSnapshot } from './diagnosticLocation';
import { languageOfName } from './fileKinds';
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

/**
 * The files compiled with the target: the caller gives those of its run
 * (`filesForRun`), with the target's text exactly as the textarea holds it,
 * so the selection's offsets fit it.
 */
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

interface Range {
  readonly start: number;
  readonly end: number;
}

/** A range of the text and what takes its place. */
export interface Replacement extends Range {
  readonly text: string;
}

function isVhdl(file: ProjectFile): boolean {
  return languageOfName(file.name) === 'vhdl';
}

/** The characters of an architecture's lines, from its header to the end of its `end architecture;` line. */
function linesRange(content: string, { line, lastLine }: Lines): Range {
  return { start: offsetOfLine(content, line), end: Math.min(offsetOfLine(content, lastLine + 1), content.length) };
}

/** Its lines and the blank line after them, so removing it leaves no gap — short of where the paste goes. */
function removalRange(content: string, architecture: Lines, insert?: Range): Range {
  const lines = linesRange(content, architecture);
  const blankAfter = splitLines(content)[architecture.lastLine]?.trim() === '';
  const end = blankAfter ? linesRange(content, { line: architecture.lastLine + 1, lastLine: architecture.lastLine + 1 }).end : lines.end;
  const beforeInsert = insert && insert.start >= lines.end ? Math.min(end, insert.start) : end;
  return { start: lines.start, end: beforeInsert };
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
  return files.flatMap((file) => {
    const lines = splitLines(file.content);
    return architectureHeaders(file.content)
      .filter(wanted)
      .map(({ name, entity, line }) => ({ fileId: file.id, fileName: file.name, name, entity, line, lastLine: architectureLastLine(lines, line) }))
      .filter((existing) => existing.fileId !== target.fileId || !overlaps(linesRange(file.content, existing), selection));
  });
}

/** An architecture one of `pasted` would define again. */
function isDuplicateOf(pasted: readonly ArchitectureHeader[]): HeaderTest {
  const keys = new Set(pasted.map(architectureKey));
  return (header) => keys.has(architectureKey(header));
}

/** Another architecture of a pasted one's entity, under a name none of `pasted` has. */
function isOtherOf(pasted: readonly ArchitectureHeader[]): HeaderTest {
  const duplicate = isDuplicateOf(pasted);
  return (header) => pasted.some((p) => sameName(p.entity, header.entity)) && !duplicate(header);
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
  return { asPasted, renamed: rename ? existingWhere(test(renamed(headers, rename)), files, target) : asPasted };
}

function renamed(headers: readonly ArchitectureHeader[], rename: EntityRename | undefined): ArchitectureHeader[] {
  if (rename === undefined) return [...headers];
  return headers.map((h) => (sameName(h.entity, rename.from) ? { ...h, entity: rename.to } : h));
}

/** The entity to offer for an unknown one: the target file's own entity, else the one probably meant. */
function entityToOffer(unknown: string, targetFile: ProjectFile, declared: readonly string[]): string | undefined {
  const own = entityHeaders(targetFile.content);
  return own.length === 1 ? own[0].name : suggestedEntityName(unknown, declared);
}

/**
 * The first pasted architecture of an entity neither the project nor the paste
 * declares, and the entity to offer instead. A second unknown entity in the same
 * paste is left as it is: one paste is one architecture, nearly always.
 */
function renameFor(pasted: string, targetFile: ProjectFile, vhdlFiles: readonly ProjectFile[]): EntityRename | undefined {
  const declared = [...vhdlFiles.map((file) => file.content), pasted].flatMap((content) => entityHeaders(content).map((e) => e.name));
  const unknown = architectureHeaders(pasted).find((h) => !declared.some((name) => sameName(name, h.entity)))?.entity;
  if (unknown === undefined) return undefined;
  const offered = entityToOffer(unknown, targetFile, declared);
  return offered === undefined ? undefined : { from: unknown, to: offered };
}

/**
 * What to ask before `pasted` goes into the target file, or `undefined` when it
 * holds no architecture that needs a question (or the file is not VHDL).
 */
export function pasteQuestions(pasted: string, target: PasteTarget, files: readonly ProjectFile[]): PasteQuestions | undefined {
  const targetFile = files.find((file) => file.id === target.fileId);
  const headers = architectureHeaders(pasted);
  if (targetFile === undefined || !isVhdl(targetFile) || headers.length === 0) return undefined;
  const vhdlFiles = files.filter(isVhdl);
  const rename = renameFor(pasted, targetFile, vhdlFiles);
  const search = { headers, rename, files: vhdlFiles, target };
  const duplicates = foundBothWays(isDuplicateOf, search);
  const others = foundBothWays(isOtherOf, search);
  const asksNothing = rename === undefined && duplicates.asPasted.length === 0 && others.asPasted.length === 0;
  return asksNothing ? undefined : { rename, duplicates, others };
}

/** `pasted` with `rename.from` after `of` in its architecture headers changed to `rename.to`. */
export function renamePasted(pasted: string, rename: EntityRename): string {
  const edits = architectureHeaders(pasted)
    .filter((h) => sameName(h.entity, rename.from))
    .map((h) => ({ offset: offsetOfLine(pasted, h.line) + h.entityStart, removed: h.entity.length, text: rename.to, caret: 0 }));
  return edits.reduceRight(applyTextEdit, pasted);
}

/** The text that goes in and the architectures it replaces, as answered. */
export function answeredPaste(pasted: string, questions: PasteQuestions, answers: PasteAnswers): { text: string; replaced: readonly ExistingArchitecture[] } {
  const rename = answers.rename ? questions.rename : undefined;
  const text = rename ? renamePasted(pasted, rename) : pasted;
  const asAnswered = (found: FoundBothWays) => (rename ? found.renamed : found.asPasted);
  const replaced = [
    ...(answers.replace ? asAnswered(questions.duplicates) : []),
    ...(answers.deleteOthers ? asAnswered(questions.others) : []),
  ];
  return { text, replaced };
}

/**
 * One edit of `content` that removes the `removed` architectures and, when
 * given, puts `insert` in its range: one edit, so one Ctrl+Z undoes it all. The
 * caret goes to the end of the inserted text. `insert` must not overlap the
 * architectures' lines.
 */
export function removeAndInsert(content: string, removed: readonly Lines[], insert?: Replacement): TextEdit {
  const pieces: Replacement[] = removed.map((architecture) => ({ ...removalRange(content, architecture, insert), text: '' }));
  if (insert) pieces.push(insert);
  // An insert where a removal starts goes first: its range is empty.
  pieces.sort((a, b) => a.start - b.start || a.end - b.end);
  const offset = pieces[0]?.start ?? 0;
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
