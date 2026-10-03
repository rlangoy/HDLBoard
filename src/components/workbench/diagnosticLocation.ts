// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * Matches parsed diagnostics to project files and answers questions about
 * lines — docs/editor_diagnostics_implementation_plan.md § 4.4. Pure.
 */

import type { Diagnostic } from './diagnostics';
import type { VhdlFile } from './files';

export { normalizeFileName } from './diagnostics';

/**
 * The files exactly as they were sent at Start — what the line numbers refer to.
 * Built from the same `filesForRun` that `HdlClient.run` sends, so it can never
 * contain a file the compiler did not see.
 */
export interface RunSnapshot {
  readonly files: readonly Pick<VhdlFile, 'id' | 'name' | 'content'>[];
}

/** A diagnostic matched to a project file. */
export interface LocatedDiagnostic extends Omit<Diagnostic, 'fileName'> {
  readonly fileId: string;
}

type SnapshotFile = RunSnapshot['files'][number];

/**
 * The only line counter: `''` is 1 line and a trailing newline adds an empty
 * last line, the same as the editor's gutter. A `\r` stays part of its line.
 */
export function countLines(text: string): number {
  return text.split('\n').length;
}

export function isLineInFile(line: number, content: string): boolean {
  return line >= 1 && line <= countLines(content);
}

/** Character offset of the start of a 1-based line. */
export function offsetOfLine(content: string, line: number): number {
  const lines = content.split('\n').slice(0, line - 1);
  return lines.reduce((offset, text) => offset + text.length + 1, 0);
}

/**
 * A pixel line height from the element when it has one; otherwise measured from
 * the rendered lines (a theme that sets `normal`).
 */
export function lineHeightOrFallback(computed: string, scrollHeight: number, lineCount: number): number {
  const height = parseFloat(computed);
  return Number.isFinite(height) && height > 0 ? height : scrollHeight / lineCount;
}

/**
 * Finds the one snapshot file a printed name means, or `undefined`. An exact
 * match wins; else a case-insensitive one (Windows file systems ignore case).
 * Two matches at the same step are ambiguous: the compiler saw only one of them
 * and the browser cannot tell which, so nothing is marked (a marker on the
 * wrong file is worse than none). Generated files (`hdl_board_tb.*`,
 * `_hdlboard_ts.v`) are not in the snapshot, so they never resolve.
 */
export function resolveFileId(name: string, snapshot: RunSnapshot): string | undefined {
  const exact = snapshot.files.filter((file) => file.name === name);
  if (exact.length > 0) return exact.length === 1 ? exact[0].id : undefined;
  const lowered = name.toLowerCase();
  const caseInsensitive = snapshot.files.filter((file) => file.name.toLowerCase() === lowered);
  return caseInsensitive.length === 1 ? caseInsensitive[0].id : undefined;
}

function locate(
  diagnostic: Diagnostic,
  snapshot: RunSnapshot,
  currentFiles: RunSnapshot['files'],
): LocatedDiagnostic | undefined {
  const fileId = resolveFileId(diagnostic.fileName, snapshot);
  const snapshotFile: SnapshotFile | undefined = snapshot.files.find((file) => file.id === fileId);
  if (fileId === undefined || snapshotFile === undefined) return undefined;
  if (!isLineInFile(diagnostic.line, snapshotFile.content)) return undefined;
  // The student edited the file while it compiled: its line numbers are stale.
  const current = currentFiles.find((file) => file.id === fileId);
  const fileChangedSinceStart = current?.content !== snapshotFile.content;
  if (fileChangedSinceStart) return undefined;
  const { fileName: _printedName, ...rest } = diagnostic;
  return { ...rest, fileId };
}

export function locateDiagnostics(
  diagnostics: readonly Diagnostic[],
  snapshot: RunSnapshot,
  currentFiles: RunSnapshot['files'],
): LocatedDiagnostic[] {
  const located: LocatedDiagnostic[] = [];
  for (const diagnostic of diagnostics) {
    const place = locate(diagnostic, snapshot, currentFiles);
    if (place) located.push(place);
  }
  return located;
}

/**
 * Where a console link goes: the first place the text names, as it was at Start.
 * Unlike a marker, a link stays useful after the student edits the file (fixing
 * the error is the usual edit) — landing a line or two off is fine for a jump.
 * Only a file deleted since breaks it, and a line past the end of a file that
 * has since got shorter goes to its last line.
 */
export function locateLink(
  diagnostics: readonly Diagnostic[],
  snapshot: RunSnapshot,
  currentFiles: RunSnapshot['files'],
): LocatedDiagnostic | undefined {
  // The snapshot stands in for the current files, so an edit does not count as stale.
  const [place] = locateDiagnostics(diagnostics, snapshot, snapshot.files);
  const current = place && currentFiles.find((file) => file.id === place.fileId);
  if (current === undefined) return undefined;
  return { ...place, line: Math.min(place.line, countLines(current.content)) };
}

/**
 * The file of the first error, at that file's lowest error line — for the
 * DE1_SoC.v case that is line 19 (the statement), not line 23 (where Icarus
 * noticed it). Warnings alone never move the view.
 */
export function firstRevealTarget<T extends LocatedDiagnostic>(located: readonly T[]): T | undefined {
  const errors = located.filter((d) => d.severity === 'error');
  if (errors.length === 0) return undefined;
  const { fileId } = errors[0];
  return errors.filter((d) => d.fileId === fileId).reduce((lowest, d) => (d.line < lowest.line ? d : lowest));
}
