// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * Which run each waveform came from (docs/waveform_viewer_spec.md § 8.7, FR-18). The
 * newest run's waveform is offered at once, but the view keeps showing the one before
 * until the new one is parsed – longer still when it fails. So the origin is kept per
 * run: the newest one says what is offered, the shown waveform's run says which files
 * its declarations are in. The files are kept by id, which a rename does not change.
 * Pure.
 */

import type { VhdlFile } from '../workbench/files';

/** A run's testbench – its source (file and unit) – and the files the run compiled. */
export interface RunOrigin {
  readonly source: string;
  readonly fileIds: readonly string[];
}

/** The runs that offered a waveform, oldest first. */
export type RunOrigins = ReadonlyArray<readonly [run: number, origin: RunOrigin]>;

/** Enough for the shown waveform to stay a few runs behind the newest. */
const KEPT_RUNS = 4;

/** `origins` with `run`'s origin added as the newest; only the last few are kept. */
export function withOrigin(origins: RunOrigins, run: number, origin: RunOrigin): RunOrigins {
  return [...origins.filter(([kept]) => kept !== run), [run, origin] as const].slice(-KEPT_RUNS);
}

/** The origin of `run`, or null when it is not known. */
export function originOf(origins: RunOrigins, run: number | null): RunOrigin | null {
  return origins.find(([kept]) => kept === run)?.[1] ?? null;
}

/**
 * The project's files that `origin`'s run compiled, as they read now (renamed or
 * edited since); every file while the origin is not known.
 */
export function filesOf(origin: RunOrigin | null, files: readonly VhdlFile[]): readonly VhdlFile[] {
  if (origin === null) return files;
  const ids = new Set(origin.fileIds);
  return files.filter((file) => ids.has(file.id));
}

/** The newest run's origin: the waveform on offer. */
export function newestOrigin(origins: RunOrigins): RunOrigin | null {
  return origins[origins.length - 1]?.[1] ?? null;
}
