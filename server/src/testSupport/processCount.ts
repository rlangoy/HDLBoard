// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * Counting running processes by program name — for the teardown tests that assert a
 * dropped connection leaves no simulator behind (docs/ghdl_implementation_plan.md
 * § 5.10). `spawnSync` with an argument array only, never a shell string.
 */

import { spawnSync } from 'node:child_process';

const WINDOWS = process.platform === 'win32';
const POLL_INTERVAL_MS = 50;

function countOnWindows(name: string): number {
  const image = `${name}.exe`.toLowerCase();
  const listing = spawnSync('tasklist', ['/FI', `IMAGENAME eq ${image}`, '/FO', 'CSV', '/NH'], { encoding: 'utf8' });
  // Each match is a CSV row starting with the quoted image name; "no tasks" text does not.
  return (listing.stdout ?? '').split('\n').filter((line) => line.toLowerCase().startsWith(`"${image}"`)).length;
}

/** pgrep's exit status when it found no such process; 0 is "found", anything else a failure. */
const PGREP_NONE_FOUND = 1;

function countOnPosix(name: string): number {
  const listing = spawnSync('pgrep', ['-x', name], { encoding: 'utf8' });
  // A failed pgrep (macOS's can fail to read the process table) prints nothing too:
  // that must not read as "none running".
  if (listing.error || (listing.status !== 0 && listing.status !== PGREP_NONE_FOUND)) {
    const reason = listing.error?.message ?? `exit ${listing.status} ${listing.stderr ?? ''}`.trim();
    throw new Error(`pgrep -x ${name} failed: ${reason}`);
  }
  return (listing.stdout ?? '').split('\n').filter(Boolean).length;
}

/** How many processes are running the program `name` (without extension). Throws when the system cannot tell. */
export function countProcesses(name: string): number {
  return WINDOWS ? countOnWindows(name) : countOnPosix(name);
}

/** The count, or why it could not be had: not knowing is not "none left", so the wait asks again. */
function countOrWhyNot(name: string): number | string {
  try {
    return countProcesses(name);
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}

/** Resolves once at most `atMost` such processes remain; rejects, naming them, after `timeoutMs`. */
export async function waitForProcessCount(name: string, atMost: number, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const count = countOrWhyNot(name);
    if (typeof count === 'number' && count <= atMost) return;
    if (Date.now() > deadline) {
      throw new Error(typeof count === 'number' ? `${name}: ${count} process(es) still running, expected at most ${atMost}` : count);
    }
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }
}
