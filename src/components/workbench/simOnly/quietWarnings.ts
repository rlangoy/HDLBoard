// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * The live warnings the student dismissed (docs/impl_sim_only_warnings.md § 5.2): a
 * click in the editor makes a file's warnings quiet (the text after the line goes; the
 * gutter's `!` and the problem card stay), and a console link to the file, or a click
 * on a line number, shows them again. Kept per file by headline, not line, so a warning
 * stays quiet while lines above it move, and a new problem still shows. Pure.
 */

import type { AdvisedDiagnostic } from '../diagnosticAdvice';

/** File id → the headlines of its dismissed warnings. */
export type QuietWarnings = ReadonlyMap<string, ReadonlySet<string>>;

export const NO_QUIET_WARNINGS: QuietWarnings = new Map();

type Warning = Pick<AdvisedDiagnostic, 'fileId' | 'line' | 'advice' | 'message' | 'quiet'>;

const headlineOf = (w: Warning): string => w.advice?.headline ?? w.message;
const isDismissed = (quiet: QuietWarnings, w: Warning): boolean => quiet.get(w.fileId)?.has(headlineOf(w)) === true;

/** The live warnings, those the student dismissed made quiet. */
export function withQuieted<T extends Warning>(warnings: readonly T[], quiet: QuietWarnings): T[] {
  return warnings.map((w) => (!w.quiet && isDismissed(quiet, w) ? { ...w, quiet: true } : w));
}

/** With the file's headlines set to `headlines`; the same map when nothing changes. */
function withFile(quiet: QuietWarnings, fileId: string, headlines: ReadonlySet<string>): QuietWarnings {
  const before = quiet.get(fileId) ?? new Set<string>();
  const same = before.size === headlines.size && [...headlines].every((h) => before.has(h));
  if (same) return quiet;
  const next = new Map(quiet);
  if (headlines.size === 0) next.delete(fileId);
  else next.set(fileId, headlines);
  return next;
}

/** A click in the editor: every live warning of the file becomes quiet. */
export function quietFile(quiet: QuietWarnings, warnings: readonly Warning[], fileId: string): QuietWarnings {
  const loud = warnings.filter((w) => w.fileId === fileId && !w.quiet).map(headlineOf);
  return withFile(quiet, fileId, new Set([...(quiet.get(fileId) ?? []), ...loud]));
}

/** A click on a line number or its `!`: the warnings on that line show again. */
export function showLine(quiet: QuietWarnings, warnings: readonly Warning[], place: { readonly fileId: string; readonly line: number }): QuietWarnings {
  const onLine = new Set(warnings.filter((w) => w.fileId === place.fileId && w.line === place.line).map(headlineOf));
  const kept = [...(quiet.get(place.fileId) ?? [])].filter((h) => !onLine.has(h));
  return withFile(quiet, place.fileId, new Set(kept));
}

/** A console link to the file: all its warnings show again. */
export function showFile(quiet: QuietWarnings, fileId: string): QuietWarnings {
  return withFile(quiet, fileId, new Set());
}
