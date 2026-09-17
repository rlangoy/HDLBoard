/**
 * Spawning and managing GHDL child processes.
 * ../../ghdl_implementation_plan.md § 7.4 / § 11 (security).
 *
 * `spawn(cmd, argsArray, { cwd })` only, everywhere — never a shell
 * string. No source content, filename, or generic value is ever
 * concatenated into a command line. Do not "simplify" this to `exec`.
 */

import { spawn } from 'node:child_process';

export interface CmdResult {
  code: number;
  out: string;
  err: string;
  timedOut: boolean;
}

/** A bounded command: used for `-a`/`-e`, which are expected to finish in seconds. */
export function runCmd(
  cmd: string,
  args: string[],
  cwd: string,
  timeoutMs = 30_000,
): Promise<CmdResult> {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, { cwd });
    let out = '';
    let err = '';
    let timedOut = false;

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGKILL');
    }, timeoutMs);

    child.stdout.on('data', (d) => (out += d));
    child.stderr.on('data', (d) => (err += d));
    child.on('error', (e) => {
      clearTimeout(timer);
      resolve({ code: -1, out, err: err + String(e), timedOut });
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({ code: code ?? -1, out, err, timedOut });
    });
  });
}

export interface RunHandle {
  kill(): void;
  onExit(cb: (code: number | null, stderr: string) => void): void;
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
  pollCycles: number,
): RunHandle {
  const child = spawn(
    'ghdl',
    [
      '-r',
      '--std=08',
      entityName,
      `-ginput_file=${inputFile}`,
      `-goutput_file=${outputFile}`,
      `-gpoll_cycles=${pollCycles}`,
    ],
    { cwd },
  );

  let stderr = '';
  child.stderr.on('data', (d) => (stderr += d));

  const exitCbs: Array<(code: number | null, stderr: string) => void> = [];
  child.on('close', (code) => {
    for (const cb of exitCbs) cb(code, stderr);
  });

  return {
    kill: () => {
      child.stdout.removeAllListeners();
      child.stderr.removeAllListeners();
      child.kill('SIGTERM');
    },
    onExit: (cb) => exitCbs.push(cb),
  };
}
