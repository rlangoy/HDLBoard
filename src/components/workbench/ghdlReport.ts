// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * GHDL's `report` and `assert` messages, as the console shows them: a run of them
 * becomes one table — Time, Filename, Timestamp, Report Text — instead of lines
 * that repeat `file:line:col:@time:(report note):` in front of every message.
 * Pure — no React.
 */

import type { ConsoleLine } from './ConsoleOutput';

export type ReportSeverity = 'note' | 'warning' | 'error' | 'failure';

/** One message, from `and_gate_tb.vhd:31:9:@0ms:(report note): AND Truth Table`. */
export interface GhdlReport {
  readonly file: string;
  readonly line: number;
  /** Simulation time, as GHDL wrote it: `0ms`, `40ns`. */
  readonly simTime: string;
  /** `report` for a report statement, `assertion` for a failed assert. */
  readonly kind: 'report' | 'assertion';
  readonly severity: ReportSeverity;
  readonly text: string;
}

/** The console as runs of plain lines and of report rows, in order. */
export type ConsoleBlock =
  | { readonly kind: 'line'; readonly line: ConsoleLine }
  | { readonly kind: 'reports'; readonly rows: readonly ReportRow[] };

export interface ReportRow {
  readonly line: ConsoleLine;
  readonly report: GhdlReport;
}

// file.vhd(l):line:column:@time:(report|assertion severity): text — the text may span lines.
const GHDL_REPORT = /^(.+?\.vhdl?):(\d+):\d+:@([^:]+):\((report|assertion) (note|warning|error|failure)\): ?([\s\S]*)$/i;

/** The report a console line holds, or undefined for any other line. */
export function parseGhdlReport(text: string): GhdlReport | undefined {
  const match = GHDL_REPORT.exec(text);
  if (!match) return undefined;
  const [, file, line, simTime, kind, severity, message] = match;
  return {
    file,
    line: Number(line),
    simTime,
    kind: kind.toLowerCase() as GhdlReport['kind'],
    severity: severity.toLowerCase() as ReportSeverity,
    text: message,
  };
}

/** `40ns` → `40 ns`, easier to read in a column; anything else as it is. */
export function readableSimTime(simTime: string): string {
  return simTime.replace(/^([\d.]+)([a-z]+)$/i, '$1 $2');
}

/** Consecutive report lines grouped into one block each; every other line on its own. */
export function consoleBlocks(lines: readonly ConsoleLine[]): ConsoleBlock[] {
  const blocks: ConsoleBlock[] = [];
  for (const line of lines) {
    const report = parseGhdlReport(line.text);
    const last = blocks[blocks.length - 1];
    if (!report) blocks.push({ kind: 'line', line });
    else if (last?.kind === 'reports') blocks[blocks.length - 1] = { ...last, rows: [...last.rows, { line, report }] };
    else blocks.push({ kind: 'reports', rows: [{ line, report }] });
  }
  return blocks;
}
