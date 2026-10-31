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
  statSync,
  writeFileSync,
  writeSync,
} from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { BatchHandle, BatchResult, RunHandle } from './runtime.js';
import { createOutputLimiter, type OutputLimiter } from './outputLimiter.js';
import { normaliseBoardBits } from './engines/boardBits.js';
import { mismatchedFiles, mismatchMessage } from './engines/language.js';
import { selectEngine } from './engines/selectEngine.js';
import { firstUnsafeName } from './engines/sourceNames.js';
import type { BoardFiles, PrepareRequest, PrepareResult, RunPlan, SimEngine, WaveRequest } from './engines/types.js';
import { DEFAULT_BOARD_IO, type BoardIo } from './engines/boardPorts.js';
import { describeStimFields, sameStimMeaning, stateLength, stimLength } from './engines/boardShape.js';
import type { DecodedBoard } from './boardFrame.js';
import { type ErrorStage, type ServerFrame, type StimStep, type VhdlFileInput, type WaveFormat, type WaveStatus } from './protocol.js';
import { MAX_WAVE_BYTES, WAVE_CHECK_MS, readIntSetting, readVhdlWaveFormat } from './settings.js';
import { isOwnDumpNotice, OWN_DUMP_MISSING_MESSAGE, sizeLimitMessage } from './wave/waveConsole.js';
import { sendWaveFile } from './wave/waveTransfer.js';

/** What a `RUN` after an invalid `BOARD` frame is told (docs/board_io_config_spec.md § 8.2). */
export const RUN_REFUSED_FOR_BOARD = 'RUN refused: the last BOARD frame was not valid.';

/**
 * `STIM needs 21 bits for this board (switches 16 + buttons 5), got 14.` The backend
 * never hears the board's name; the frontend puts it in front when it shows this.
 */
export function stimLengthMessage(board: BoardIo, got: number): string {
  return `STIM needs ${stimLength(board)} bits for this board (${describeStimFields(board)}), got ${got}.`;
}

/** The files a board testbench exchanges data through, in the session directory. */
const INPUT_FILE_NAME = 'input.txt';
const OUTPUT_FILE_NAME = 'output.txt';

/**
 * Bound on not-yet-acknowledged transitions (§ 5.13). Far above anything a
 * person can click within one acknowledgement round trip; exists only so
 * a stalled simulation can't make input.txt grow without limit.
 */
const MAX_STIM_QUEUE = 256;

/** A `STIM` step the running testbench has not acknowledged yet. */
interface QueuedStim extends StimStep {
  readonly seq: number;
}

/** A line of the testbench's input queue: `<seq> <bits>`, then ` <holdNs>` for a timed step. */
function queueLine({ seq, bits, holdNs }: QueuedStim): string {
  return holdNs === undefined ? `${seq} ${bits}\n` : `${seq} ${bits} ${holdNs}\n`;
}

/** A single untimed state equal to the last one queued changes nothing; timed steps always count. */
function isUnchanged(steps: readonly StimStep[], lastBits: string | null): boolean {
  return steps.length === 1 && steps[0].holdNs === undefined && steps[0].bits === lastBits;
}
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
/** How often, and how far apart, removing the session folder is tried on teardown. */
const TEARDOWN_RETRIES = 10;
const TEARDOWN_RETRY_MS = 100;

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

/** What a session needs besides its text frames; every field has a production default. */
export interface SessionOptions {
  /** Binary frames: a waveform's gzip content between WAVE-BEGIN and WAVE-END. */
  readonly sendBinary?: (chunk: Buffer) => void;
  readonly maxWaveBytes?: number;
  readonly waveCheckMs?: number;
  readonly vhdlWaveFormat?: WaveFormat;
}

/** The waveform of the newest batch run (docs/waveform_viewer_spec.md § 7.4). */
interface RunWave {
  /** The run's number in `WAVE-READY`/`WAVE-GET`. */
  readonly run: number;
  readonly format: WaveFormat;
  /** Relative to the session directory. */
  readonly fileName: string;
  /** The student's own `$dumpfile` wrote it, not HDLBoard. */
  readonly own: boolean;
  /** Set once the run has ended; only then is the file offered. */
  status?: WaveStatus;
}

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
  private stimQueue: QueuedStim[] = [];
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
  /** Whether the client asked for waveforms (`WAVE on`); off for a client that never says. */
  private waveRequested = false;
  /**
   * The board the next run is for (docs/board_io_config_spec.md § 8.2): the Default names
   * until a `BOARD` frame arrives, then that board — sticky, like `WAVE`. After an invalid
   * one, runs are refused with its reason until a valid one arrives.
   */
  private decodedBoard: DecodedBoard = { ok: true, board: DEFAULT_BOARD_IO };
  /** The compile in progress, if any: the next one waits for it (`prepareInTurn`). */
  private compiling: Promise<void> = Promise.resolve();
  /** The board of the run in progress: what its `STIM` and `STATE` lengths are (§ 6.2). */
  private runBoard: BoardIo = DEFAULT_BOARD_IO;
  /** The newest batch run's waveform, until the next run, Reset or teardown deletes it. */
  private wave: RunWave | null = null;
  /** Numbers each batch start's waveform; never reused within a session (W10). */
  private waveSeq = 0;
  private waveWatchdog: NodeJS.Timeout | null = null;
  /** The size guard stopped the current run (§ 7.5). */
  private waveLimitHit = false;
  private readonly sendBinary: (chunk: Buffer) => void;
  private readonly maxWaveBytes: number;
  private readonly waveCheckMs: number;
  private readonly vhdlWaveFormat: WaveFormat;

  /** `chooseEngine` is replaceable so tests can drive a run without a real simulator. */
  constructor(
    send: (frame: ServerFrame) => void,
    chooseEngine: (topFile: string | undefined) => SimEngine = selectEngine,
    options: SessionOptions = {},
  ) {
    this.send = send;
    this.chooseEngine = chooseEngine;
    this.dir = mkdtempSync(join(tmpdir(), 'hdl-board-'));
    this.sendBinary = options.sendBinary ?? (() => {});
    this.maxWaveBytes = options.maxWaveBytes ?? readIntSetting(MAX_WAVE_BYTES);
    this.waveCheckMs = options.waveCheckMs ?? readIntSetting(WAVE_CHECK_MS);
    this.vhdlWaveFormat = options.vhdlWaveFormat ?? readVhdlWaveFormat();
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

  /** `WAVE on|off`: whether the next batch run records a waveform (docs/waveform_viewer_spec.md § 7.1). */
  handleWave(on: boolean): void {
    this.waveRequested = on;
  }

  /** `BOARD`: the port names of the next runs. An invalid one is not answered here: the next RUN is refused with its reason. */
  handleBoard(decoded: DecodedBoard): void {
    this.decodedBoard = decoded;
  }

  /**
   * `WAVE-GET <run>`: the newest finished run's waveform, or `WAVE-NONE` – for an older
   * run, one still running, or one whose file is gone (§ 7.4).
   */
  handleWaveGet(run: number): Promise<void> {
    const wave = this.wave;
    if (wave === null || wave.run !== run || wave.status === undefined) {
      this.send({ verb: 'WAVE-NONE', run });
      return Promise.resolve();
    }
    return sendWaveFile({
      path: join(this.dir, wave.fileName),
      run,
      sink: { send: this.send, sendBinary: this.sendBinary },
      isCurrent: () => !this.destroyed && this.wave === wave,
    });
  }

  private waveRequest(): WaveRequest | undefined {
    return this.waveRequested ? { vhdlFormat: this.vhdlWaveFormat } : undefined;
  }

  /** Icarus's "dumpfile opened" notice for HDLBoard's own recording is not shown (§ 7.6). */
  private isHiddenWaveNotice(line: string): boolean {
    return this.wave !== null && !this.wave.own && isOwnDumpNotice(line, this.wave.fileName);
  }

  /** Deletes the last run's waveform: a new run, Reset and teardown each make it obsolete. */
  private clearWave(): void {
    this.stopWaveWatchdog();
    const wave = this.wave;
    this.wave = null;
    if (wave === null) return;
    try {
      rmSync(join(this.dir, wave.fileName), { force: true });
    } catch {
      // Windows: a just-stopped simulator may still hold it. It goes with the session directory.
    }
  }

  /** The waveform this batch start records, named for this start (W10), or null. */
  private beginWave(plan: RunPlan): RunWave | null {
    this.clearWave();
    this.waveLimitHit = false;
    const planned = plan.wave;
    if (planned === undefined || planned.unusableOwnDump) return null;
    const run = ++this.waveSeq;
    const own = planned.ownFile !== undefined;
    const fileName = planned.ownFile ?? `wave-${run}.${planned.format}`;
    this.wave = { run, format: planned.format, fileName, own };
    return this.wave;
  }

  private waveBytes(wave: RunWave): number | undefined {
    try {
      return statSync(join(this.dir, wave.fileName)).size;
    } catch {
      return undefined;
    }
  }

  /** The size guard (§ 7.5, W6): stops a run whose waveform passes the limit, keeping what it wrote. */
  private startWaveWatchdog(wave: RunWave, handle: BatchHandle): void {
    this.stopWaveWatchdog();
    this.waveWatchdog = setInterval(() => {
      if (this.wave !== wave || this.batchRun !== handle) return this.stopWaveWatchdog();
      if ((this.waveBytes(wave) ?? 0) <= this.maxWaveBytes) return;
      this.stopWaveWatchdog();
      this.waveLimitHit = true;
      handle.kill();
    }, this.waveCheckMs);
  }

  private stopWaveWatchdog(): void {
    if (this.waveWatchdog) {
      clearInterval(this.waveWatchdog);
      this.waveWatchdog = null;
    }
  }

  /** Offers the ended run's waveform with `WAVE-READY`, sent before its `DONE`/`ERROR` (§ 7.4). */
  private announceWave(status: WaveStatus): void {
    this.stopWaveWatchdog();
    const wave = this.wave;
    if (wave === null) return;
    const bytes = this.waveBytes(wave);
    if (bytes === undefined) {
      // A run that wrote nothing has no waveform to offer; the student's own dump says why.
      if (wave.own) this.send({ verb: 'LOG', text: OWN_DUMP_MISSING_MESSAGE });
      this.wave = null;
      return;
    }
    wave.status = status;
    this.send({ verb: 'WAVE-READY', run: wave.run, format: wave.format, bytes, status });
  }

  async handleRun(files: VhdlFileInput[], topFile?: string, runTarget?: string): Promise<void> {
    // Cleared first: the run being replaced is not offered, its waveform is obsolete (W10).
    this.clearWave();
    this.stopActive('stopped');
    this.state = 'compiling';
    const request = ++this.runRequest;

    const board = this.boardForRun();
    if (board === undefined) return;

    const engine = this.chooseEngine(topFile);
    const refusal = refusalBeforeCompile(files, topFile, engine);
    if (refusal !== undefined) {
      this.failRun('analyze', refusal);
      return;
    }

    const prepared = await this.prepareInTurn(engine, request, { dir: this.dir, files, topFile, runTarget, wave: this.waveRequest(), board });
    // Closed, or superseded by a newer RUN while compiling: starting now would leave a
    // simulator running that nothing tracks, and even a failure is no longer news.
    if (prepared === undefined || this.destroyed || request !== this.runRequest) return;
    this.startPrepared(engine, prepared);
  }

  /** A finished compile: its failure, or the run it prepared. */
  private startPrepared(engine: SimEngine, prepared: PrepareResult): void {
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

  /**
   * The board of the run starting now. The last inputs are replayed into the next run
   * (`startRun`); on a board where they mean something else they would press buttons or
   * set switches nobody touched, so they are dropped.
   */
  private setRunBoard(board: BoardIo): void {
    if (!sameStimMeaning(this.runBoard, board)) this.lastStimBits = null;
    this.runBoard = board;
  }

  /**
   * The board the run is for, or undefined after refusing the run: a client that sent a
   * broken board never gets a simulation with names it did not ask for. One error for one
   * problem: the BOARD frame itself is not answered, so its reason comes here.
   */
  private boardForRun(): BoardIo | undefined {
    const decoded = this.decodedBoard;
    if (!decoded.ok) {
      this.failRun('protocol', `${RUN_REFUSED_FOR_BOARD}\n${decoded.reason}`);
      return undefined;
    }
    this.setRunBoard(decoded.board);
    return decoded.board;
  }

  /**
   * One compile at a time in the session folder: a compile cannot be stopped half-way,
   * and two would write over each other's files there. A RUN waits for the compile
   * before it; one superseded meanwhile (a newer RUN, Stop, a closed tab) never starts.
   */
  private async prepareInTurn(engine: SimEngine, request: number, prepare: PrepareRequest): Promise<PrepareResult | undefined> {
    await this.compiling;
    if (this.destroyed || request !== this.runRequest) return undefined;
    const preparing = engine.prepare(prepare);
    this.compiling = preparing.then(
      () => undefined,
      () => undefined,
    );
    return preparing;
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
    this.removeStaleOutput();
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
    if (/\S/.test(line) && !this.isHiddenWaveNotice(line)) this.sendLogLines(this.limiter?.accept(line) ?? []);
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
    return bits.length === stateLength(this.runBoard) ? { bits, ack: parseInt(ackText, 10) } : undefined;
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
    const wave = this.beginWave(plan);
    const onOutput = (line: string) => this.forwardOutputLine(line);
    const handle = engine.startBatchRun(plan, { onOutput, timeoutMs: BATCH_TIMEOUT_MS, waveFile: wave?.fileName });
    this.batchRun = handle;
    this.state = 'running';
    this.send({ verb: 'READY' });
    if (wave !== null) this.startWaveWatchdog(wave, handle);

    handle.done.then((result) => {
      if (this.destroyed || this.batchRun !== handle) return; // superseded by Stop/Reset/a new RUN
      this.batchRun = null;
      const wasRunning = this.state === 'running';
      this.state = 'stopped';
      this.endOutput();
      if (wasRunning) this.reportBatchEnd(result); // otherwise already reported via handleStop's own DONE
    });
  }

  /** How a batch run that ended on its own – or was ended by the size guard – is reported. */
  private reportBatchEnd({ code, timedOut, stderr }: BatchResult): void {
    // A run that ended by itself – passing or failing – closed its waveform normally.
    this.announceWave(this.waveLimitHit ? 'size-limit' : timedOut ? 'timeout' : 'complete');
    if (this.waveLimitHit) {
      this.send({ verb: 'LOG', text: sizeLimitMessage(this.maxWaveBytes) });
      this.send({ verb: 'DONE', reason: 'stopped' });
    } else if (timedOut) {
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
  }

  /**
   * Queues a `STIM`'s steps: one input state, or a bouncing button's timed steps,
   * which the testbench applies exactly `holdNs` apart in simulated time.
   */
  handleStim(steps: readonly StimStep[]): void {
    if (this.state !== 'running' || this.plan?.mode !== 'board') return;
    const wrong = steps.find((step) => step.bits.length !== stimLength(this.runBoard));
    if (wrong !== undefined) {
      this.send({ verb: 'ERROR', stage: 'protocol', text: stimLengthMessage(this.runBoard, wrong.bits.length) });
      return;
    }
    if (isUnchanged(steps, this.lastStimBits)) return;
    this.lastStimBits = steps[steps.length - 1].bits;
    // Queued, not overwritten (§ 5.13): a press and its release can reach
    // this process in the same event-loop turn on a loaded machine, and a
    // snapshot file would let the release replace the press before GHDL
    // ever sampled it — a lost click.
    for (const step of steps) this.stimQueue.push({ seq: ++this.stimSeq, ...step });
    if (this.stimQueue.length > MAX_STIM_QUEUE) this.stimQueue.splice(0, this.stimQueue.length - MAX_STIM_QUEUE);
    this.writeStimQueue();
  }

  private writeStimQueue(): void {
    // Write-then-rename: input.txt is read concurrently by the running
    // GHDL process, and a rename within the same directory is atomic on
    // POSIX, so the reader never observes a partially-written queue.
    const tmp = `${this.inputPath()}.tmp`;
    writeFileSync(tmp, this.stimQueue.map(queueLine).join(''));
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

  /**
   * The last run's `output.txt`. On Windows the simulator just killed may still hold it
   * open for a moment (EBUSY, EPERM); after a few tries it is left, which costs one stale
   * board state, corrected by the new run's first one — never the session.
   */
  private removeStaleOutput(): void {
    try {
      rmSync(this.outputPath(), { force: true, maxRetries: MAX_RENAME_RETRIES, retryDelay: 1 });
    } catch {
      // Still held: see above.
    }
  }

  handleReset(): void {
    if (this.state !== 'running' || !this.engine || !this.plan) return;
    this.stopActive(null);
    this.clearWave();
    if (this.plan.mode === 'board') this.startRun(this.engine, this.plan);
    else this.startBatchRun(this.engine, this.plan);
  }

  handleStop(): void {
    if (this.state === 'compiling') this.abandonCompile();
    else this.stopActive('stopped');
  }

  /**
   * Stop while a run compiles: the compile is left to finish, but its result is dropped
   * (the request number moves on, as for a newer RUN), so nothing starts after Stop.
   */
  private abandonCompile(): void {
    this.runRequest++;
    this.state = 'stopped';
    this.send({ verb: 'DONE', reason: 'stopped' });
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
      // What the stopped run recorded is kept and offered (§ 7.4: status `stopped`).
      this.announceWave('stopped');
      this.send({ verb: 'DONE', reason });
    }
  }

  destroy(): void {
    this.destroyed = true;
    this.stopWaveWatchdog();
    this.stopOutputPolling();
    this.stopPacing();
    this.stopLimiterTimer();
    if (this.run) this.run.kill();
    if (this.batchRun) this.batchRun.kill();
    // Retried: on Windows the simulator just killed still holds the folder for a moment.
    void fs.rm(this.dir, { recursive: true, force: true, maxRetries: TEARDOWN_RETRIES, retryDelay: TEARDOWN_RETRY_MS }).catch(() => {});
  }
}
