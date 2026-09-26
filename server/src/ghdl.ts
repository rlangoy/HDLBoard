// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * Spawning and managing GHDL child processes.
 * ../../docs/ghdl_implementation_plan.md § 7.4 / § 11 (security).
 *
 * `spawn(cmd, argsArray, { cwd })` only, everywhere — never a shell
 * string. No source content, filename, or generic value is ever
 * concatenated into a command line. Do not "simplify" this to `exec`.
 */

import { spawn } from 'node:child_process';
import { createBatchHandle, createRunHandle, type BatchHandle, type RunHandle } from './runtime.js';

/**
 * Which GHDL to run. `'ghdl'` means "whatever is on PATH", which is what
 * every non-desktop deployment wants and what the environment variable
 * lets an operator override. The packaged Windows app is the case that
 * needs more: it ships its own GHDL under `resources/ghdl/` and must not
 * depend on the student having installed one, so Electron passes that
 * absolute path to `startBackend()`, which calls `setGhdlExe()` before
 * anything can spawn.
 */
let ghdlExe = process.env.GHDL_EXE ?? 'ghdl';

export function setGhdlExe(path: string): void {
  ghdlExe = path;
}

/** The resolved executable. */
export function getGhdlExe(): string {
  return ghdlExe;
}

/**
 * Starts the persistent, free-running simulation — Candidate A
 * (§ 5.4.1). Not awaited to completion: the process runs until `kill()`
 * is called (Stop/Reset/session teardown), which is the whole point of
 * this architecture over re-simulating from t=0.
 */
export function startPersistentRun(
  cwd: string,
  entityName: string,
  inputFile: string,
  outputFile: string,
  pollIntervalNs: number,
  minDwellNs: number,
  heartbeatFile: string,
  pacingFile: string,
): RunHandle {
  const child = spawn(
    ghdlExe,
    [
      '-r',
      '--std=08',
      entityName,
      `-ginput_file=${inputFile}`,
      `-goutput_file=${outputFile}`,
      `-gpoll_interval_ns=${pollIntervalNs}`,
      `-gmin_dwell_ns=${minDwellNs}`,
      `-gheartbeat_file=${heartbeatFile}`,
      // Omitted rather than passed empty when there is no FIFO (Windows,
      // which paces through stdin instead — see session.ts's PACING):
      // `-gpacing_file=` with no value is a hard "missing value in generic
      // override option" from GHDL, not an empty string. The generic's own
      // declared default in tbTemplate.ts is already `""`, which is exactly
      // the "no FIFO" state.
      ...(pacingFile ? [`-gpacing_file=${pacingFile}`] : []),
    ],
    { cwd },
  );

  return createRunHandle(child);
}

/**
 * Runs a design directly — `ghdl -r <entityName>`, no generated wrapper,
 * no board polling. For a genuinely portless entity (`session.ts` only
 * calls this when the resolved top declares zero ports at all): a design
 * with real board ports still gets `startPersistentRun`'s wrapper, since
 * *something* has to supply `CLOCK_50`/`SW`/`KEY` for it to do anything.
 * A portless entity supplies its own stimuli (the classic self-contained
 * testbench shape — this file's own `stim_proc`, say), so wrapping it in
 * anything would be redundant at best and an elaboration error at worst.
 *
 * Bounded by `timeoutMs`, unlike the persistent run: this process is
 * expected to reach quiescence and exit on its own, and without our own
 * infinite polling loop keeping it alive, a design bug (an unconditional
 * loop with no `wait`) has nothing else to save it from a hang.
 */
export function runBatch(cwd: string, entityName: string, onOutput: (line: string) => void, timeoutMs: number): BatchHandle {
  const child = spawn(ghdlExe, ['-r', '--std=08', entityName], { cwd });
  return createBatchHandle(child, onOutput, timeoutMs);
}
