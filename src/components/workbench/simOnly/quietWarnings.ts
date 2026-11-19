// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * The live warnings the student dismissed (docs/impl_sim_only_warnings.md § 5.2): a
 * click in the editor makes a file's warnings quiet (the text after the line goes; the
 * gutter's `!` and the problem card stay), and a console link to the file, or a click
 * on a line number, shows them again.
 *
 * A warning is kept as its headline and its occurrence: the n-th warning with that
 * headline in the file, in line order. So it stays quiet while lines above it are added
 * or removed, restoring one line restores no other line with the same headline, and a
 * new warning below the others is not taken for a dismissed one. Pure.
 */

import type { AdvisedDiagnostic } from '../diagnosticAdvice';

/** File id → the dismissed warnings of the file, as `headline` + occurrence keys. */
export type QuietWarnings = ReadonlyMap<string, ReadonlySet<string>>;

export const NO_QUIET_WARNINGS: QuietWarnings = new Map();

type Warning = Pick<AdvisedDiagnostic, 'fileId' | 'line' | 'advice' | 'message' | 'quiet'>;

const headlineOf = (w: Warning): string => w.advice?.headline ?? w.message;

/** Each warning's key in its file: its headline and how many warnings with that headline come before it. */
function occurrenceKeys<T extends Warning>(warnings: readonly T[]): Map<T, string> {
  const keys = new Map<T, string>();
  const seen = new Map<string, number>();
  for (const w of [...warnings].sort((a, b) => a.line - b.line)) {
    const id = `${w.fileId}\n${headlineOf(w)}`;
    const n = seen.get(id) ?? 0;
    seen.set(id, n + 1);
    keys.set(w, `${headlineOf(w)}\n${n}`);
  }
  return keys;
}

/** The live warnings, those the student dismissed made quiet. */
export function withQuieted<T extends Warning>(warnings: readonly T[], quiet: QuietWarnings): T[] {
  if (quiet.size === 0) return [...warnings];
  const keys = occurrenceKeys(warnings);
  return warnings.map((w) => (!w.quiet && quiet.get(w.fileId)?.has(keys.get(w) ?? '') ? { ...w, quiet: true } : w));
}

/** With the file's keys set to `keys`; the same map when nothing changes. */
function withFile(quiet: QuietWarnings, fileId: string, keys: ReadonlySet<string>): QuietWarnings {
  const before = quiet.get(fileId) ?? new Set<string>();
  const same = before.size === keys.size && [...keys].every((k) => before.has(k));
  if (same) return quiet;
  const next = new Map(quiet);
  if (keys.size === 0) next.delete(fileId);
  else next.set(fileId, keys);
  return next;
}

/** A click in the editor: every live warning of the file becomes quiet. */
export function quietFile(quiet: QuietWarnings, warnings: readonly Warning[], fileId: string): QuietWarnings {
  const keys = occurrenceKeys(warnings.filter((w) => w.fileId === fileId));
  const loud = [...keys].filter(([w]) => !w.quiet).map(([, key]) => key);
  return withFile(quiet, fileId, new Set([...(quiet.get(fileId) ?? []), ...loud]));
}

/** A click on a line number or its `!`: the warnings on that line, and only those, show again. */
export function showLine(quiet: QuietWarnings, warnings: readonly Warning[], place: { readonly fileId: string; readonly line: number }): QuietWarnings {
  const keys = occurrenceKeys(warnings.filter((w) => w.fileId === place.fileId));
  const onLine = new Set([...keys].filter(([w]) => w.line === place.line).map(([, key]) => key));
  const kept = [...(quiet.get(place.fileId) ?? [])].filter((k) => !onLine.has(k));
  return withFile(quiet, place.fileId, new Set(kept));
}

/** A console link to the file: all its warnings show again. */
export function showFile(quiet: QuietWarnings, fileId: string): QuietWarnings {
  return withFile(quiet, fileId, new Set());
}

/** Only the files that still exist: a deleted file's dismissals go with it. */
export function onlyFiles(quiet: QuietWarnings, fileIds: ReadonlySet<string>): QuietWarnings {
  const gone = [...quiet.keys()].filter((id) => !fileIds.has(id));
  if (gone.length === 0) return quiet;
  const next = new Map(quiet);
  for (const id of gone) next.delete(id);
  return next;
}
