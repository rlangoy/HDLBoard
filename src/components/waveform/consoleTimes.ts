// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * The simulated times the console names, so a click opens the waveform there (FR-16),
 * and the run's first error, where the waveform opens (FR-26, W11). Pure.
 *
 * GHDL: `tb.vhd:28:21:@1230ns:(report error): …`. Icarus Verilog prints `$error` and
 * `$fatal` as two lines – `ERROR: tb.v:12: …` then `       Time: 45000  Scope: tb` – with
 * the time in the design's precision, which HDLBoard's shared timescale fixes at 1 ps.
 */

import { parseGhdlReport } from '../workbench/ghdlReport';
import { parseSimTime } from './timeAxis';

/** `` `timescale 1ns/1ps ``: Icarus's `Time:` counts picoseconds. */
const VERILOG_PRECISION_FS = 1000;
const ICARUS_TIME = /^(\s*Time:\s*)(\d+)(\s+Scope:.*)$/;
const ICARUS_SEVERITY = /^(ERROR|FATAL|WARNING|INFO):\s/;
const ERROR_SEVERITIES = ['error', 'failure'];

/** A time a console line names: in femtoseconds, and where in the line it is written. */
export interface LineTime {
  readonly fs: number;
  /** The text before the time, the time as written, and the text after it. */
  readonly parts: readonly [string, string, string];
}

/** The time an Icarus `Time:` line names, or undefined for any other line. */
export function icarusLineTime(text: string): LineTime | undefined {
  const match = ICARUS_TIME.exec(text);
  if (!match) return undefined;
  return { fs: Number(match[2]) * VERILOG_PRECISION_FS, parts: [match[1], match[2], match[3]] };
}

/** The time of a GHDL report line in femtoseconds, or undefined. */
export function reportTimeFs(text: string): number | undefined {
  const report = parseGhdlReport(text);
  return report === undefined ? undefined : parseSimTime(report.simTime);
}

export interface RunError {
  readonly fs: number;
  readonly text: string;
}

/** The first message of the run with severity error or failure, and its time. */
export function firstError(lines: readonly string[]): RunError | undefined {
  for (let i = 0; i < lines.length; i++) {
    const report = parseGhdlReport(lines[i]);
    if (report !== undefined) {
      const fs = parseSimTime(report.simTime);
      if (ERROR_SEVERITIES.includes(report.severity) && fs !== undefined) return { fs, text: report.text };
      continue;
    }
    const severity = ICARUS_SEVERITY.exec(lines[i])?.[1];
    if (severity !== 'ERROR' && severity !== 'FATAL') continue;
    const time = lines[i + 1] === undefined ? undefined : icarusLineTime(lines[i + 1]);
    if (time !== undefined) return { fs: time.fs, text: lines[i].replace(/^\w+:\s*[^:]+:\d+:\s*/, '') };
  }
  return undefined;
}

/** The time of the last line that names one – where the cursor goes after a run without errors. */
export function lastReportFs(lines: readonly string[]): number | undefined {
  for (let i = lines.length - 1; i >= 0; i--) {
    const fs = reportTimeFs(lines[i]) ?? icarusLineTime(lines[i])?.fs;
    if (fs !== undefined) return fs;
  }
  return undefined;
}
