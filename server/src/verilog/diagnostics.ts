// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * Interpreting what Icarus Verilog says: which stage a compile failure belongs to, and
 * whether the installed version is one HDLBoard has been tested with
 * (docs/Verilog_implementation_plan.md § 5.5). Pure functions over text.
 */

import type { ErrorStage } from '../protocol.js';

export interface CompileFailure {
  /** `internal` is for failures that are HDLBoard's own assumption breaking, not the student's code. */
  readonly stage: Extract<ErrorStage, 'analyze' | 'elaborate' | 'internal'>;
  /** The compiler's own words, trimmed — shown to the student verbatim. */
  readonly text: string;
}

/**
 * Icarus parses and elaborates in one run, so it has no "analyze" and "elaborate"
 * stages of its own. These two messages only appear once elaboration has begun; the
 * split exists to fit the two stage names the frontend already prints.
 */
const ELABORATION_MARKERS: readonly RegExp[] = [/error\(s\) during elaboration/, /Unable to find the root module/];

export function classifyCompileFailure(stderr: string, exitCode: number): CompileFailure {
  const text = stderr.trim();
  if (text === '') {
    return { stage: 'analyze', text: `iverilog failed with exit code ${exitCode} and printed nothing.` };
  }
  const stage = ELABORATION_MARKERS.some((marker) => marker.test(text)) ? 'elaborate' : 'analyze';
  return { stage, text };
}

/** The first line of `iverilog -V` output, e.g. `Icarus Verilog version 13.0 (stable) (v13_0)`. */
export function extractBanner(versionOutput: string): string {
  return versionOutput.split(/\r?\n/, 1)[0]?.trim() ?? '';
}

export interface IcarusVersion {
  readonly major: number;
  readonly minor: number;
}

const VERSION_IN_BANNER = /Icarus Verilog version (\d+)\.(\d+)/;

export function parseVersion(banner: string): IcarusVersion | undefined {
  const match = VERSION_IN_BANNER.exec(banner);
  if (!match) return undefined;
  return { major: Number(match[1]), minor: Number(match[2]) };
}

/** The major versions the compile flags, output formats and `-tstub` dump were checked against (M12, M22). */
const DEBIAN_STABLE_MAJOR = 12;
const BUNDLED_MAJOR = 13;
const TESTED_MAJOR_VERSIONS: readonly number[] = [DEBIAN_STABLE_MAJOR, BUNDLED_MAJOR];
const RECOMMENDED_VERSION = '13.0';

function testedRange(): string {
  return `tested: ${TESTED_MAJOR_VERSIONS.map((major) => `${major}.x`).join(', ')}`;
}

/**
 * A warning to show once at the start of a run when the installed Icarus is outside the
 * tested versions, or `undefined` when it is fine. It only ever warns — a newer Icarus
 * is very likely to work, and refusing to run would be worse than a heads-up.
 */
export function versionWarning(banner: string): string | undefined {
  const advice = `if compiling or running misbehaves, install ${RECOMMENDED_VERSION}.`;
  const version = parseVersion(banner);
  if (version === undefined) {
    return `Could not read the Icarus Verilog version from "${banner}" (${testedRange()}); ${advice}`;
  }
  if (TESTED_MAJOR_VERSIONS.includes(version.major)) return undefined;
  return `Icarus Verilog ${version.major}.${version.minor} has not been tested with HDLBoard (${testedRange()}); ${advice}`;
}

/**
 * Said before a run when the top has ports of its own but none of the board's. Such a
 * module runs as a standalone testbench, which is right for a testbench with an
 * `output reg done` and puzzling for a board design that misspelled `LEDR` — this line
 * is what tells the two apart (§ 5.3).
 */
export function standaloneHint(top: string): string {
  return (
    `Top module '${top}' declares none of the board's ports (CLOCK_50, CLOCK_500Hz, SW, KEY_N, LEDR, HEX0_N…HEX5_N), ` +
    'so it runs as a standalone testbench. If it is a board design, check the port names.'
  );
}
