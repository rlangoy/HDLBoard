// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * One Session per WebSocket connection — ../../docs/ghdl_implementation_plan.md
 * § 7.2. Owns a temp directory, the elaborated design, and (once running)
 * the persistent GHDL process for it. Nothing here touches the socket
 * directly; `send` is a callback so this class stays testable without a
 * real WebSocket.
 */

import {
  promises as fs,
  closeSync,
  constants as fsConstants,
  mkdtempSync,
  openSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
  writeSync,
} from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { BatchHandle, RunHandle } from './runtime.js';
import { createOutputLimiter, type OutputLimiter } from './outputLimiter.js';
import { normaliseBoardBits } from './engines/boardBits.js';
import { mismatchedFiles, mismatchMessage } from './engines/language.js';
import { selectEngine } from './engines/selectEngine.js';
import { firstUnsafeName } from './engines/sourceNames.js';
import type { BoardFiles, RunPlan, SimEngine } from './engines/types.js';
import { STATE_LENGTH, type ErrorStage, type ServerFrame, type VhdlFileInput } from './protocol.js';

/** The files a board testbench exchanges data through, in the session directory. */
const INPUT_FILE_NAME = 'input.txt';
const OUTPUT_FILE_NAME = 'output.txt';

/**
 * Bound on not-yet-acknowledged transitions (§ 5.13). Far above anything a
 * person can click within one acknowledgement round trip; exists only so
 * a stalled simulation can't make input.txt grow without limit.
 */
const MAX_STIM_QUEUE = 256;
/**
 * How often the Node side re-reads output.txt for a change (§ 7.2). Once
 * § 5.12 cut the VHDL side's own sampling to milliseconds, this became the
 * dominant term in switch-to-LED latency; it is a small read of a small
 * file, so paying it more often is the cheapest latency left to buy.
 */
const OUTPUT_POLL_MS = 20;
/** How often a finished flood window is checked for its summary line (`outputLimiter.ts`). */
const LIMITER_FLUSH_MS = 250;
/**
 * Real-time pacing (§ 5.9, reworked in § 5.13). GHDL runs a session's own
 * simulated time as fast as it can — without this, a design not declaring
 * CLOCK_50 finishes in a handful of real seconds regardless of how much
 * simulated time (a literal 10 real-hardware minutes, say) it represents,
 * which doesn't predict the design's actual timing on the board.
 *
 * The testbench blocks after every `PACING_STEP_MS` of simulated time
 * until this side writes one line into its pacing FIFO, and this side
 * writes one line per `PACING_STEP_MS` of real time. Must match the
 * `wait for 20 ms` in `tbTemplate.ts`'s heartbeat process.
 */
const PACING_STEP_MS = 20;
/** How often grants are topped up. Lateness here only slows the simulation. */
const PACING_CHECK_MS = 10;
/**
 * Bound on grants written but not yet consumed — a CLOCK_50 design runs
 * far behind real time and consumes them slowly — so the FIFO's kernel
 * buffer (64 KiB on Linux, one byte per grant) can never fill.
 */
const PACING_MAX_OUTSTANDING = 1000;
/**
 * Backing store for the one-millisecond synchronous sleep in
 * `renameOverOpenFile`. `Atomics.wait` needs a `SharedArrayBuffer`-backed
 * array and never actually observes a change here — the timeout is the
 * only exit, which is precisely the "sleep without yielding" wanted.
 */
const SLEEP_SIGNAL = new Int32Array(new SharedArrayBuffer(Int32Array.BYTES_PER_ELEMENT));
const MS_PER_SECOND = 1000;
/** How often a contended rename is retried before giving up (`renameOverOpenFile`). */
const MAX_RENAME_RETRIES = 50;
const CONTENDED_RENAME_CODES: readonly string[] = ['EPERM', 'EACCES', 'EBUSY'];
/**
 * Bound on a batch (portless-entity) run. Generous relative to the 30 s
 * build timeout (`DEFAULT_COMMAND_TIMEOUT_MS`): an actual simulation, not just analysis, and unlike
 * the persistent board mode there is no polling loop to keep a runaway
 * design alive on purpose — this is what stops a design bug (a loop with
 * no `wait`) from hanging the server instead.
 */
const BATCH_TIMEOUT_MS = 60_000;
/**
 * A simulator that died without a word on stderr still owes the student a reason.
 * Where every run is memory-capped (`HDLBOARD_SIM_MEMORY_MB`, the Docker render
 * stage's `simlimit.sh`), running out is the likely one: GHDL then dies on a
 * segfault without printing anything.
 */
function unexplainedExitText(): string {
  const capMb = process.env.HDLBOARD_SIM_MEMORY_MB;
  if (!capMb) return 'Simulation exited unexpectedly.';
  return (
    `Simulation exited unexpectedly, possibly out of memory: each simulation on this server gets ${capMb} MB. ` +
    'GHDL needs about 350 bytes per std_logic bit of a signal, so a large RAM signal can use it up.'
  );
}

/** True once `from` has replaced `to`; false when the destination is held open by another process. */
function renamed(from: string, to: string): boolean {
  try {
    renameSync(from, to);
    return true;
  } catch (e) {
    if (CONTENDED_RENAME_CODES.includes((e as NodeJS.ErrnoException).code ?? '')) return false;
    throw e;
  }
}

/**
 * Why a run cannot even be compiled, or `undefined` when it can. Names come first:
 * every engine writes them into the session directory, so no engine may see one that
 * would land outside it.
 */
function refusalBeforeCompile(files: readonly VhdlFileInput[], topFile: string | undefined, engine: SimEngine): string | undefined {
  const unsafeName = firstUnsafeName(files);
  if (unsafeName !== undefined) return unsafeName;
  const strangers = mismatchedFiles(files, engine.language);
  if (strangers.length > 0) return mismatchMessage(engine.language, topFile ?? '(none)', strangers);
  return undefined;
}

type SessionState = 'new' | 'compiling' | 'running' | 'stopped';

export class Session {
  private readonly send: (frame: ServerFrame) => void;
  private readonly dir: string;
  private state: SessionState = 'new';
  private engine: SimEngine | null = null;
  private plan: RunPlan | null = null;
  private run: RunHandle | null = null;
  private batchRun: BatchHandle | null = null;
  private outputPollTimer: NodeJS.Timeout | null = null;
  private pacingTimer: NodeJS.Timeout | null = null;
  private pacingFd: number | null = null;
  private runStartTime = 0;
  /**
   * Bumped per run so `heartbeatPath()` is unique to it. Deleting a shared
   * heartbeat file instead would be a race, not a fix: `RESET` kills the
   * old process and starts the new one synchronously, so the old one can
   * still write once between the delete and the new run's first pacing
   * read — and that one stale value stalls the new run (§ 5.9/§ 5.11).
   * A name it cannot know makes the collision impossible rather than
   * unlikely.
   */
  private runSeq = 0;
  /**
   * `STIM`s the running testbench has not yet acknowledged, oldest first
   * (§ 5.13). `stimSeq` is per session, never per run, so an ack from a
   * just-killed process can't be mistaken for one from its replacement.
   */
  private stimQueue: Array<{ seq: number; bits: string }> = [];
  private stimSeq = 0;
  private lastStimBits: string | null = null;
  private lastSentState: string | null = null;
  private limiter: OutputLimiter | null = null;
  private limiterTimer: NodeJS.Timeout | null = null;
  private destroyed = false;
  /**
   * Bumped per `RUN`. A compile is awaited, so a newer `RUN` — or the socket
   * closing — can arrive before it finishes; comparing against this after the
   * await is how the older one knows it no longer owns the session.
   */
  private runRequest = 0;
  private readonly chooseEngine: (topFile: string | undefined) => SimEngine;

  /** `chooseEngine` is replaceable so tests can drive a run without a real simulator. */
  constructor(send: (frame: ServerFrame) => void, chooseEngine: (topFile: string | undefined) => SimEngine = selectEngine) {
    this.send = send;
    this.chooseEngine = chooseEngine;
    this.dir = mkdtempSync(join(tmpdir(), 'hdl-board-'));
  }

  private inputPath(): string {
    return join(this.dir, INPUT_FILE_NAME);
  }

  private outputPath(): string {
    return join(this.dir, OUTPUT_FILE_NAME);
  }

  private heartbeatName(): string {
    return `heartbeat-${this.runSeq}.txt`;
  }

  private heartbeatPath(): string {
    return join(this.dir, this.heartbeatName());
  }

  private pacingName(): string {
    return `pacing-${this.runSeq}.fifo`;
  }

  private pacingPath(): string {
    return join(this.dir, this.pacingName());
  }

  /** The names the testbench exchanges data through, relative to the session directory. */
  private boardFiles(plan: RunPlan): BoardFiles {
    return {
      input: INPUT_FILE_NAME,
      output: OUTPUT_FILE_NAME,
      heartbeat: this.heartbeatName(),
      // No FIFO with stdin pacing: the testbench reads its grants from stdin instead.
      pacing: plan.pacing === 'fifo' ? this.pacingName() : undefined,
    };
  }

  async handleRun(files: VhdlFileInput[], topFile?: string, runTarget?: string): Promise<void> {
    this.stopActive('stopped');
    this.state = 'compiling';
    const request = ++this.runRequest;

    const engine = this.chooseEngine(topFile);
    const refusal = refusalBeforeCompile(files, topFile, engine);
    if (refusal !== undefined) {
      this.failRun('analyze', refusal);
      return;
    }

    const prepared = await engine.prepare({ dir: this.dir, files, topFile, runTarget });
    // Closed, or superseded by a newer RUN while compiling: starting now would leave a
    // simulator running that nothing tracks, and even a failure is no longer news.
    if (this.destroyed || request !== this.runRequest) return;
    if (!prepared.ok) {
      this.failRun(prepared.stage, prepared.text);
      return;
    }

    this.engine = engine;
    this.plan = prepared.plan;
    for (const message of prepared.plan.messages) this.send({ verb: 'LOG', text: message });
    if (prepared.plan.mode === 'batch') this.startBatchRun(engine, prepared.plan);
    else this.startRun(engine, prepared.plan);
  }

  private failRun(stage: ErrorStage, text: string): void {
    this.send({ verb: 'ERROR', stage, text });
    this.state = 'stopped';
  }

  private startRun(engine: SimEngine, plan: RunPlan): void {
    this.lastSentState = null;
    // These outlive a single run — they live in the session's temp
    // directory, and a re-`RUN`/`RESET` reuses it. Inheriting them is not
    // cosmetic: the pacing loop (§ 5.9) reads the heartbeat as "how far
    // this run has got", so a stale one reports the *previous* run's
    // simulated time and stalls the fresh process for exactly as long as
    // that run lasted (§ 5.11). The heartbeat gets a per-run name rather
    // than a delete, since the old process may outlive the delete by a
    // few ms; `output.txt` is shared but milder — one stale board state,
    // corrected by this run's first real one.
    this.runSeq++;
    rmSync(this.outputPath(), { force: true });
    // A fresh process starts having applied nothing, so the queue restarts
    // as the one current input state rather than replaying the old run's
    // backlog — what `input.txt` surviving across runs used to give for
    // free (§ 5.11), now that it holds transitions instead of a snapshot.
    this.stimQueue = this.lastStimBits ? [{ seq: ++this.stimSeq, bits: this.lastStimBits }] : [];
    this.writeStimQueue();
    // Opened read-write and non-blocking before the simulator starts: read-write so
    // this open doesn't wait for a reader and the simulator's own read-mode open
    // doesn't wait for a writer; non-blocking so a full FIFO could never
    // stall this event loop (PACING_MAX_OUTSTANDING keeps it from filling).
    if (plan.pacing === 'fifo') {
      execFileSync('mkfifo', [this.pacingPath()]);
      this.pacingFd = openSync(this.pacingPath(), fsConstants.O_RDWR | fsConstants.O_NONBLOCK);
    }
    const handle = engine.startBoardRun(plan, this.boardFiles(plan));
    this.run = handle;
    if (plan.pacing === 'fifo') this.startPacing(handle);
    else this.startStdinPacing(handle);
    // Identity-checked against `handle`, not just `this.destroyed`/
    // `this.state`: `kill()` (Stop/Reset/a new RUN) sets `this.run = null`
    // synchronously, but the killed child's own `close` event is
    // necessarily asynchronous — if a new run has *already* started by
    // the time it arrives, `this.state` reads 'running' again (the new
    // run's), so a plain state check would misattribute this stale exit
    // to it. `this.run !== handle` is what actually tells them apart.
    handle.onExit((code, stderr) => {
      if (this.destroyed || this.run !== handle) return;
      this.run = null;
      const wasRunning = this.state === 'running';
      this.state = 'stopped';
      this.stopOutputPolling();
      this.stopPacing();
      this.endOutput();
      if (!wasRunning) return;
      // A board design that ends the simulation itself (`$finish`, `std.env.finish`)
      // is a completed run, not a crash: the student asked for it.
      if (code === 0) this.send({ verb: 'DONE', reason: 'completed' });
      else this.send({ verb: 'ERROR', stage: 'runtime', text: stderr || unexplainedExitText() });
    });
    // The design's own report/assert/$display output — the simulator writes this to
    // stdout, not the result file, so it needs its own forwarding path
    // (the generated testbench itself never writes to stdout, so
    // everything that arrives here is the student's own `report`/
    // `assert`, never internal plumbing).
    this.beginOutput();
    handle.onOutput((line) => this.forwardOutputLine(line));
    this.state = 'running';
    this.send({ verb: 'READY' });
    this.startOutputPolling();
  }

  /**
   * The simulator's own output — a design's `$display`/`report` text — goes through a
   * per-run line budget so a design that prints on every clock edge cannot flood the
   * socket and the console (`outputLimiter.ts`). Both run kinds share these three.
   */
  private beginOutput(): void {
    this.endOutput();
    this.limiter = createOutputLimiter(Date.now);
    this.limiterTimer = setInterval(() => this.sendLogLines(this.limiter?.flush() ?? []), LIMITER_FLUSH_MS);
  }

  private forwardOutputLine(line: string): void {
    if (/\S/.test(line)) this.sendLogLines(this.limiter?.accept(line) ?? []);
  }

  /** Reports what the budget dropped in the last window, then stops budgeting. */
  private endOutput(): void {
    this.stopLimiterTimer();
    if (this.limiter) this.sendLogLines(this.limiter.finish());
    this.limiter = null;
  }

  private stopLimiterTimer(): void {
    if (this.limiterTimer) {
      clearInterval(this.limiterTimer);
      this.limiterTimer = null;
    }
  }

  private sendLogLines(lines: readonly string[]): void {
    for (const text of lines) this.send({ verb: 'LOG', text });
  }

  private startOutputPolling(): void {
    this.stopOutputPolling();
    this.outputPollTimer = setInterval(() => this.pollOutput(), OUTPUT_POLL_MS);
  }

  private stopOutputPolling(): void {
    if (this.outputPollTimer) {
      clearInterval(this.outputPollTimer);
      this.outputPollTimer = null;
    }
  }

  /** The first line of `output.txt` as `<board bits> <last applied seq>`, or nothing before the run has written one. */
  private readBoardLine(): { bits: string; ack: number } | undefined {
    let text: string;
    try {
      text = readFileSync(this.outputPath(), 'utf8');
    } catch {
      return undefined; // Nothing written yet.
    }
    const [rawBits = '', ackText = ''] = (text.split('\n')[0] ?? '').trim().split(/\s+/);
    const bits = normaliseBoardBits(rawBits);
    return bits.length === STATE_LENGTH ? { bits, ack: parseInt(ackText, 10) } : undefined;
  }

  /** Drops the queued transitions the testbench says it has applied. */
  private acknowledge(ack: number): void {
    if (Number.isNaN(ack) || this.stimQueue[0]?.seq === undefined || this.stimQueue[0].seq > ack) return;
    this.stimQueue = this.stimQueue.filter((s) => s.seq > ack);
    this.writeStimQueue();
  }

  private pollOutput(): void {
    const line = this.readBoardLine();
    if (line === undefined) return;
    this.acknowledge(line.ack);
    if (line.bits === this.lastSentState) return;
    this.lastSentState = line.bits;
    this.send({ verb: 'STATE', bits: line.bits });
  }

  /**
   * Real-time pacing (§ 5.13): tops the testbench's pacing FIFO up to one
   * grant per `PACING_STEP_MS` of real time since the run started. Grants
   * only ever let the simulation proceed, so a tick that fires late (a
   * loaded or CPU-capped machine) holds the simulation back instead of
   * letting it run ahead — the failure mode of § 5.9's pause-when-ahead
   * design, which on such a machine let a clockless design get a minute
   * ahead and then froze it, inputs and all, for that minute.
   * Identity-checked against `handle`, same pattern as `startRun`'s
   * `onExit`: a stale tick must not act on whatever replaced this run.
   */
  private startPacing(handle: RunHandle): void {
    this.runStartTime = Date.now();
    let granted = 0;
    const tick = () => {
      if (this.run !== handle || this.pacingFd === null) return;
      let consumed = 0;
      try {
        const n = parseInt(readFileSync(this.heartbeatPath(), 'utf8').trim(), 10);
        if (!Number.isNaN(n)) consumed = Math.floor(n / PACING_STEP_MS);
      } catch {
        // No heartbeat yet — nothing consumed.
      }
      const due = Math.floor((Date.now() - this.runStartTime) / PACING_STEP_MS);
      const target = Math.min(due, consumed + PACING_MAX_OUTSTANDING);
      if (target > granted) {
        try {
          granted += writeSync(this.pacingFd, '\n'.repeat(target - granted));
        } catch {
          // EAGAIN: FIFO full — retry next tick.
        }
      }
      this.pacingTimer = setTimeout(tick, PACING_CHECK_MS);
    };
    tick();
  }

  /**
   * `startPacing`, for `plan.pacing === 'stdin'` (Windows): the same schedule —
   * one grant per `PACING_STEP_MS` of real time since the run started,
   * never more than `PACING_MAX_OUTSTANDING` ahead of what the testbench
   * has consumed — delivered through the child's stdin instead of a FIFO.
   * Kept separate rather than folded into `startPacing` so the POSIX path
   * above stays exactly as it was verified.
   *
   * There is no EAGAIN to handle: the write is a Node stream write, queued
   * in memory if the OS pipe is full (bounded by the outstanding cap, at
   * one byte per grant), so it can neither block the event loop nor fail
   * for want of room.
   */
  private startStdinPacing(handle: RunHandle): void {
    this.runStartTime = Date.now();
    let granted = 0;
    const tick = () => {
      if (this.run !== handle) return;
      let consumed = 0;
      try {
        const n = parseInt(readFileSync(this.heartbeatPath(), 'utf8').trim(), 10);
        if (!Number.isNaN(n)) consumed = Math.floor(n / PACING_STEP_MS);
      } catch {
        // No heartbeat yet, or GHDL has the file open mid-write (Windows
        // refuses a read of a file held open for writing more readily than
        // POSIX does) — either way, treat it as nothing consumed yet.
      }
      const due = Math.floor((Date.now() - this.runStartTime) / PACING_STEP_MS);
      const target = Math.min(due, consumed + PACING_MAX_OUTSTANDING);
      if (target > granted) {
        handle.grantPacing(target - granted);
        granted = target;
      }
      this.pacingTimer = setTimeout(tick, PACING_CHECK_MS);
    };
    tick();
  }

  private stopPacing(): void {
    if (this.pacingTimer) {
      clearTimeout(this.pacingTimer);
      this.pacingTimer = null;
    }
    if (this.pacingFd !== null) {
      closeSync(this.pacingFd);
      this.pacingFd = null;
      rmSync(this.pacingPath(), { force: true });
    }
  }

  private startBatchRun(engine: SimEngine, plan: RunPlan): void {
    this.beginOutput();
    const handle = engine.startBatchRun(plan, (line) => this.forwardOutputLine(line), BATCH_TIMEOUT_MS);
    this.batchRun = handle;
    this.state = 'running';
    this.send({ verb: 'READY' });

    handle.done.then(({ code, timedOut, stderr }) => {
      if (this.destroyed || this.batchRun !== handle) return; // superseded by Stop/Reset/a new RUN
      this.batchRun = null;
      const wasRunning = this.state === 'running';
      this.state = 'stopped';
      this.endOutput();
      if (!wasRunning) return; // already reported via handleStop's own DONE
      if (timedOut) {
        this.send({
          verb: 'ERROR',
          stage: 'runtime',
          text: `Simulation exceeded ${BATCH_TIMEOUT_MS / MS_PER_SECOND}s and was stopped. Check for a process with no wait statement, or a wait condition that never becomes true.`,
        });
      } else if (code !== 0) {
        this.send({ verb: 'ERROR', stage: 'runtime', text: stderr || unexplainedExitText() });
      } else {
        this.send({ verb: 'DONE', reason: 'completed' });
      }
    });
  }

  handleStim(bits: string): void {
    if (this.state !== 'running' || this.plan?.mode !== 'board') return;
    if (bits === this.lastStimBits) return;
    this.lastStimBits = bits;
    // Queued, not overwritten (§ 5.13): a press and its release can reach
    // this process in the same event-loop turn on a loaded machine, and a
    // snapshot file would let the release replace the press before GHDL
    // ever sampled it — a lost click.
    this.stimQueue.push({ seq: ++this.stimSeq, bits });
    if (this.stimQueue.length > MAX_STIM_QUEUE) this.stimQueue.splice(0, this.stimQueue.length - MAX_STIM_QUEUE);
    this.writeStimQueue();
  }

  private writeStimQueue(): void {
    // Write-then-rename: input.txt is read concurrently by the running
    // GHDL process, and a rename within the same directory is atomic on
    // POSIX, so the reader never observes a partially-written queue.
    const tmp = `${this.inputPath()}.tmp`;
    writeFileSync(tmp, this.stimQueue.map((s) => `${s.seq} ${s.bits}\n`).join(''));
    this.renameOverOpenFile(tmp, this.inputPath());
  }

  /**
   * `renameSync`, retried — because the atomicity the method above relies
   * on is POSIX-only.
   *
   * Windows refuses to replace a file while another process holds it
   * open, and the running testbench reopens `input.txt` on every poll
   * (every 10 us or 1 ms of simulated time), so the two collide with
   * `EPERM` sooner or later. Observed in the packaged app: a switch flip
   * threw out of the `pollOutput` timer, which is an unhandled rejection
   * away from taking the backend down.
   *
   * Retrying rather than writing in place is the point: an in-place write
   * is exactly the torn read the temp-file dance exists to prevent. GHDL
   * holds the file open only for the microseconds it takes to read a
   * handful of lines, so the contended window is far shorter than one
   * retry step, and in practice the first retry succeeds.
   *
   * Giving up is survivable and deliberately quiet: the queue is still in
   * memory, and the next `STIM` or acknowledgement rewrites it. A dropped
   * write costs at worst one input update; a thrown error costs the
   * session.
   */
  private renameOverOpenFile(from: string, to: string): void {
    for (let attempt = 0; attempt <= MAX_RENAME_RETRIES; attempt++) {
      if (renamed(from, to)) return;
      // A synchronous sleep, because the whole point is to not yield to
      // an event loop that could start another write in between.
      Atomics.wait(SLEEP_SIGNAL, 0, 0, 1);
    }
    // Gave up; the next write will carry the same queue.
  }

  handleReset(): void {
    if (this.state !== 'running' || !this.engine || !this.plan) return;
    this.stopActive(null);
    if (this.plan.mode === 'board') this.startRun(this.engine, this.plan);
    else this.startBatchRun(this.engine, this.plan);
  }

  handleStop(): void {
    this.stopActive('stopped');
  }

  /** Tears down whichever of the two run kinds is currently active. */
  private stopActive(reason: 'stopped' | null): void {
    this.stopOutputPolling();
    this.stopPacing();
    this.endOutput();
    if (this.run) {
      this.run.kill();
      this.run = null;
    }
    if (this.batchRun) {
      this.batchRun.kill();
      this.batchRun = null;
    }
    if (reason && this.state === 'running') {
      this.state = 'stopped';
      this.send({ verb: 'DONE', reason });
    }
  }

  destroy(): void {
    this.destroyed = true;
    this.stopOutputPolling();
    this.stopPacing();
    this.stopLimiterTimer();
    if (this.run) this.run.kill();
    if (this.batchRun) this.batchRun.kill();
    void fs.rm(this.dir, { recursive: true, force: true }).catch(() => {});
  }
}
