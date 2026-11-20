// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * What the design check tells the student outside the code lines
 * (docs/impl_sim_only_warnings.md § 5.2, § 5.3): the SIM-only badge's tooltip and
 * *Detected* line, the console summary at Start, and the announcement when a file
 * changes group. Only findings the student is meant to read count: not `quiet`
 * ones, not those in a *Simulation model*. Pure.
 */

import type { TestbenchOverrides } from '../tbDetect/types';
import { detectedSimOnly, nowRtl, nowSimOnly, simOnlyTooltip } from './designCheckText';
import { isWarnable, makesSimOnly } from './findings';
import { CONSTRUCT_TITLE, multipleDriversSummary, simOnlySummary } from './simOnlyText';
import { TOOL_NAME } from './toolCheck/toolCheckText';
import type { DesignCheck, FileGroup, SimOnlyFinding } from './types';

/** The findings of `fileId` that its line warnings show, one per line, in line order. */
function warnedLines(check: DesignCheck, overrides: TestbenchOverrides, fileId: string): SimOnlyFinding[] {
  const shown = check.findings.filter((f) => f.fileId === fileId && makesSimOnly(f) && isWarnable(f, overrides));
  return shown.filter((f, i) => shown.findIndex((g) => g.line === f.line) === i);
}

export const isSimOnlyGroup = (group: FileGroup | undefined): boolean => group === 'sim-only' || group === 'mixed-sim-only';

/**
 * The SIM-only badge's tooltip and *Detected* line, or undefined when the file is not
 * SIM-only: the live findings, and the synthesis check's on other lines, named with its tool.
 */
export function simOnlyBadgeText(check: DesignCheck, overrides: TestbenchOverrides, fileId: string) {
  if (!isSimOnlyGroup(check.groups.byFile.get(fileId))) return undefined;
  const live = warnedLines(check, overrides, fileId).map((f) => ({ title: CONSTRUCT_TITLE[f.construct], line: f.line }));
  const tool = check.toolFindings
    .filter((f) => f.fileId === fileId && isWarnable(f, overrides))
    .map((f) => ({ title: `${f.title} (${TOOL_NAME[f.tool]})`, line: f.line }));
  const lines = [...live, ...tool].filter((f, i, all) => all.findIndex((g) => g.line === f.line) === i).sort((a, b) => a.line - b.line);
  return { tooltip: simOnlyTooltip(lines.length), detected: detectedSimOnly(lines) };
}

export interface SummaryLine {
  readonly text: string;
  readonly fileId: string;
  /** The first line that only works in simulation: where the console link goes. */
  readonly line: number;
}

/** One console line per SIM-only file with warnings, in the order of `files`. */
export function simOnlySummaries(check: DesignCheck, overrides: TestbenchOverrides, files: readonly { id: string; name: string }[]): SummaryLine[] {
  return files.flatMap((file) => {
    const lines = warnedLines(check, overrides, file.id);
    if (lines.length === 0) return [];
    return [{ text: simOnlySummary(file.name, lines.length), fileId: file.id, line: lines[0].line }];
  });
}

/** One console line per signal with more than one driver, linked to its first driver. */
export function driverSummaries(check: DesignCheck, overrides: TestbenchOverrides, files: readonly { id: string; name: string }[]): SummaryLine[] {
  return files.flatMap((file) => {
    const conflicts = check.driverConflicts.filter((c) => c.fileId === file.id && isWarnable(c, overrides));
    const signals = [...new Set(conflicts.map((c) => c.signal))];
    return signals.map((signal) => {
      const lines = conflicts.filter((c) => c.signal === signal).map((c) => c.line);
      return { text: multipleDriversSummary(file.name, signal, lines), fileId: file.id, line: lines[0] };
    });
  });
}

/** The announcements for files that turned RTL or SIM-only since `before`. */
export function groupChanges(
  before: ReadonlyMap<string, FileGroup>,
  after: ReadonlyMap<string, FileGroup>,
  nameOf: (fileId: string) => string | undefined,
): string[] {
  return [...after].flatMap(([fileId, group]) => {
    const was = before.get(fileId);
    const name = nameOf(fileId);
    if (was === undefined || name === undefined || isSimOnlyGroup(was) === isSimOnlyGroup(group)) return [];
    return [isSimOnlyGroup(group) ? nowSimOnly(name) : nowRtl(name)];
  });
}
