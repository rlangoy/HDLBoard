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

function countOnPosix(name: string): number {
  const listing = spawnSync('pgrep', ['-x', name], { encoding: 'utf8' });
  return (listing.stdout ?? '').split('\n').filter(Boolean).length;
}

/** How many processes are running the program `name` (without extension). */
export function countProcesses(name: string): number {
  return WINDOWS ? countOnWindows(name) : countOnPosix(name);
}

/** Resolves once at most `atMost` such processes remain; rejects, naming them, after `timeoutMs`. */
export async function waitForProcessCount(name: string, atMost: number, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const count = countProcesses(name);
    if (count <= atMost) return;
    if (Date.now() > deadline) throw new Error(`${name}: ${count} process(es) still running, expected at most ${atMost}`);
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }
}
