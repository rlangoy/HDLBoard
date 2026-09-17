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
  /**
   * Suspends/resumes the OS process outright (`SIGSTOP`/`SIGCONT`), not
   * anything VHDL-level — how `session.ts`'s real-time pacing (§ 5.9)
   * throttles a simulation that's running ahead of wall-clock time back
   * toward it. Safe to call `resume()` when not paused, or repeatedly;
   * both are plain signal deliveries, not stateful on this side.
   */
  pause(): void;
  resume(): void;
  onExit(cb: (code: number | null, stderr: string) => void): void;
  /**
   * One call per complete line of the simulation's own stdout — the
   * VHDL's `report`/`assert` output. This backend's own generated
   * testbench (`tbTemplate.ts`) never writes to stdout (its result line
   * goes to `output_file`, a real file, specifically so it can never be
   * confused with this), so every line here is the student's own design.
   */
  onOutput(cb: (line: string) => void): void;
}

/** Buffers arbitrary chunks and emits one callback per complete line. */
function lineSplitter(cb: (line: string) => void): (chunk: Buffer | string) => void {
  let buf = '';
  return (chunk) => {
    buf += chunk;
    const lines = buf.split('\n');
    buf = lines.pop() ?? '';
    for (const line of lines) cb(line);
  };
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
  heartbeatFile: string,
): RunHandle {
  const child = spawn(
    'ghdl',
    [
      '-r',
      '--std=08',
      entityName,
      `-ginput_file=${inputFile}`,
      `-goutput_file=${outputFile}`,
      `-gpoll_interval_ns=${pollIntervalNs}`,
      `-gheartbeat_file=${heartbeatFile}`,
    ],
    { cwd },
  );

  let stderr = '';
  child.stderr.on('data', (d) => (stderr += d));

  const outputCbs: Array<(line: string) => void> = [];
  const emitOutput = lineSplitter((line) => {
    for (const cb of outputCbs) cb(line);
  });
  child.stdout.on('data', emitOutput);

  const exitCbs: Array<(code: number | null, stderr: string) => void> = [];
  child.on('close', (code) => {
    for (const cb of exitCbs) cb(code, stderr);
  });

  return {
    kill: () => {
      child.stdout.removeAllListeners();
      child.stderr.removeAllListeners();
      // SIGCONT first: a process paused mid-throttle (§ 5.9) won't act on
      // SIGTERM until it's running again — on Linux, a stop-disposition
      // signal blocks delivery of most others to a stopped process, so
      // skipping this would leave Stop/Reset waiting out whatever pacing
      // window happened to be in progress instead of taking effect at once.
      child.kill('SIGCONT');
      child.kill('SIGTERM');
    },
    pause: () => {
      try {
        child.kill('SIGSTOP');
      } catch {
        // Already exited — nothing to pause.
      }
    },
    resume: () => {
      try {
        child.kill('SIGCONT');
      } catch {
        // Already exited — nothing to resume.
      }
    },
    onExit: (cb) => exitCbs.push(cb),
    onOutput: (cb) => outputCbs.push(cb),
  };
}

export interface BatchResult {
  /** `null` only if the process was killed (Stop, or the timeout below). */
  code: number | null;
  timedOut: boolean;
  stderr: string;
}

export interface BatchHandle {
  kill(): void;
  /** Resolves once, when the process exits — on its own, or via `kill()`. */
  done: Promise<BatchResult>;
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
  const child = spawn('ghdl', ['-r', '--std=08', entityName], { cwd });

  let stderr = '';
  let timedOut = false;
  child.stderr.on('data', (d) => (stderr += d));
  child.stdout.on('data', lineSplitter(onOutput));

  const timer = setTimeout(() => {
    timedOut = true;
    child.kill('SIGKILL');
  }, timeoutMs);

  const done = new Promise<BatchResult>((resolve) => {
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({ code, timedOut, stderr });
    });
  });

  return {
    kill: () => {
      clearTimeout(timer);
      child.stdout.removeAllListeners();
      child.stderr.removeAllListeners();
      child.kill('SIGTERM');
    },
    done,
  };
}
