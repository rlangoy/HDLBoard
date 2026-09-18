// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * One Session per WebSocket connection — ../../ghdl_implementation_plan.md
 * § 7.2. Owns a temp directory, the elaborated design, and (once running)
 * the persistent GHDL process for it. Nothing here touches the socket
 * directly; `send` is a callback so this class stays testable without a
 * real WebSocket.
 */

import { promises as fs, closeSync, constants as fsConstants, mkdtempSync, openSync, renameSync, rmSync, writeFileSync, writeSync } from 'node:fs';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runCmd, runBatch, startPersistentRun, type BatchHandle, type RunHandle } from './ghdl.js';
import { findTopEntity } from './portDetect.js';
import { generateTestbench } from './tbTemplate.js';
import { STATE_LENGTH, type ServerFrame, type VhdlFileInput } from './protocol.js';

const TB_ENTITY = 'de1soc_sim_tb';
/**
 * How often (simulated time) the generated testbench's `io` process
 * re-reads the input file and re-checks for output changes (§ 5.8). The
 * interval is in *simulated* time but what a student feels is *real*
 * time, and the exchange rate between the two differs by three orders of
 * magnitude depending on one thing: whether `clkgen` exists (§ 5.12).
 *
 * With `CLOCK_50` declared, a 20 ns-period clock dominates everything and
 * simulated time crawls — measured at ~0.0015x real — so a 1 ms interval
 * samples input only about every 685 ms of real time, which is both the
 * "reacts slowly" latency and, worse, slow enough to miss a button press
 * entirely. A finer interval is close to free there, because the clock,
 * not this process, is what costs: 1 ms/100 us/10 us/1 us all measured the
 * same simulated-time throughput.
 *
 * Without `CLOCK_50` the exchange rate inverts — simulated time runs at or
 * above real time (§ 5.9 paces it back down) — and the same 1 us interval
 * measured 0.15x real time, i.e. this process becomes the bottleneck all
 * over again (§ 5.8). Hence two values, chosen so that *real*-time
 * responsiveness lands in the same few-milliseconds range either way.
 */
const POLL_INTERVAL_NS_WITH_CLOCK50 = 10_000;
const POLL_INTERVAL_NS_DEFAULT = 1_000_000;
/**
 * Minimum simulated time each queued input transition is held before the
 * next is applied (§ 5.13). Only matters when transitions arrive faster
 * than one per poll — i.e. a press and release that reached this process
 * together — since a real human press lasts far longer than either value.
 * With CLOCK_50 one poll (10 us) is already 500 clock edges. Without it,
 * 4 ms spans two rising edges of CLOCK_500Hz, so a design that samples
 * KEY_N on that clock still sees every queued press.
 */
const MIN_DWELL_NS_WITH_CLOCK50 = POLL_INTERVAL_NS_WITH_CLOCK50;
const MIN_DWELL_NS_DEFAULT = 4_000_000;
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
/** Bound on ghdl -a / -e — these are expected to finish in seconds (§ 7.4). */
const BUILD_TIMEOUT_MS = 30_000;
/**
 * Bound on a batch (portless-entity) run. Generous relative to
 * `BUILD_TIMEOUT_MS`: an actual simulation, not just analysis, and unlike
 * the persistent board mode there is no polling loop to keep a runaway
 * design alive on purpose — this is what stops a design bug (a loop with
 * no `wait`) from hanging the server instead.
 */
const BATCH_TIMEOUT_MS = 60_000;

type SessionState = 'new' | 'compiling' | 'running' | 'stopped';
/**
 * 'board': the usual persistent, polled simulation (§ 5) — a real design
 * with at least one board port, kept alive by the generated wrapper.
 * 'batch': a portless entity (zero ports at all) run directly with no
 * wrapper — it supplies its own stimuli, so wrapping it would be
 * redundant, and it is expected to reach quiescence and exit on its own.
 */
type SessionMode = 'board' | 'batch' | null;

export class Session {
  private readonly send: (frame: ServerFrame) => void;
  private readonly dir: string;
  private state: SessionState = 'new';
  private entityName: string | null = null;
  private mode: SessionMode = null;
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
  /** Set per `RUN` from the detected port set — see § 5.12. */
  private pollIntervalNs = POLL_INTERVAL_NS_DEFAULT;
  private minDwellNs = MIN_DWELL_NS_DEFAULT;
  /**
   * `STIM`s the running testbench has not yet acknowledged, oldest first
   * (§ 5.13). `stimSeq` is per session, never per run, so an ack from a
   * just-killed process can't be mistaken for one from its replacement.
   */
  private stimQueue: Array<{ seq: number; bits: string }> = [];
  private stimSeq = 0;
  private lastStimBits: string | null = null;
  private lastSentState: string | null = null;
  private destroyed = false;

  constructor(send: (frame: ServerFrame) => void) {
    this.send = send;
    this.dir = mkdtempSync(join(tmpdir(), 'de1soc-sim-'));
  }

  private inputPath(): string {
    return join(this.dir, 'input.txt');
  }

  private outputPath(): string {
    return join(this.dir, 'output.txt');
  }

  private heartbeatPath(): string {
    return join(this.dir, `heartbeat-${this.runSeq}.txt`);
  }

  private pacingPath(): string {
    return join(this.dir, `pacing-${this.runSeq}.fifo`);
  }

  async handleRun(files: VhdlFileInput[], topFile?: string): Promise<void> {
    this.stopActive('stopped');
    this.state = 'compiling';

    for (const file of files) {
      writeFileSync(join(this.dir, file.name), file.content);
    }

    // Analyze every file before doing our own port scan, so a genuine
    // syntax error gets GHDL's real diagnosis under `analyze` rather than
    // being intercepted early by findTopEntity()'s own regex heuristic —
    // that heuristic runs on source we don't yet know is even valid VHDL.
    //
    // Files are analyzed to a fixed point rather than strictly in the
    // order submitted: RUN's files are not guaranteed top-entity-last
    // (§ 6.3), so a project whose top entity instantiates a component
    // declared in a file that happens to arrive first would otherwise
    // fail with a spurious "unit not found in library work". Each pass
    // analyzes whatever is still pending; a pass that analyzes nothing
    // new means the remaining failures are real, not just waiting on an
    // unanalyzed dependency.
    const pending = new Map(files.map((f) => [f.name, f]));
    const lastErrors = new Map<string, string>();
    while (pending.size > 0) {
      let progressed = false;
      for (const name of [...pending.keys()]) {
        const r = await runCmd('ghdl', ['-a', '--std=08', name], this.dir, BUILD_TIMEOUT_MS);
        if (r.code === 0) {
          pending.delete(name);
          progressed = true;
        } else {
          lastErrors.set(
            name,
            r.timedOut ? `Analysis of ${name} timed out.\n${r.err}` : r.err || `ghdl -a failed on ${name} with no output.`,
          );
        }
      }
      if (!progressed) {
        const text = [...pending.keys()].map((name) => lastErrors.get(name)).join('\n');
        this.send({ verb: 'ERROR', stage: 'analyze', text });
        this.state = 'stopped';
        return;
      }
    }

    const top = findTopEntity(files, topFile);
    if ('message' in top) {
      this.send({ verb: 'ERROR', stage: 'elaborate', text: top.message });
      this.state = 'stopped';
      return;
    }
    this.entityName = top.name;

    // A genuinely portless entity — a self-contained testbench, not a
    // board design missing a port by accident — skips the wrapper and
    // the persistent board mode entirely; see runBatch()'s own doc
    // comment for why wrapping one would be wrong, not just unnecessary.
    if (top.ports.size === 0) {
      await this.runElaborateAndBatch(top.name);
      return;
    }

    const tbSource = generateTestbench(top.name, top.ports);
    writeFileSync(join(this.dir, `${TB_ENTITY}.vhdl`), tbSource);

    let r = await runCmd('ghdl', ['-a', '--std=08', `${TB_ENTITY}.vhdl`], this.dir, BUILD_TIMEOUT_MS);
    if (r.code !== 0) {
      this.send({ verb: 'ERROR', stage: 'internal', text: `Internal testbench build error:\n${r.err}` });
      this.state = 'stopped';
      return;
    }

    r = await runCmd('ghdl', ['-e', '--std=08', TB_ENTITY], this.dir, BUILD_TIMEOUT_MS);
    if (r.code !== 0) {
      this.send({
        verb: 'ERROR',
        stage: 'elaborate',
        text:
          `GHDL elaboration error (check that your entity's port names match the board's — ` +
          `CLOCK_50, SW, KEY, LEDR, HEX0..HEX5):\n${r.err}`,
      });
      this.state = 'stopped';
      return;
    }

    this.send({ verb: 'LOG', text: 'GHDL 5.0.1 (mcode)' });
    this.mode = 'board';
    // Same condition `tbTemplate.ts` uses to decide whether `clkgen` exists
    // at all (§ 5.8) — which is what decides how fast simulated time runs,
    // and so which interval keeps real-time responsiveness sane (§ 5.12).
    const hasClock50 = top.ports.has('clock_50');
    this.pollIntervalNs = hasClock50 ? POLL_INTERVAL_NS_WITH_CLOCK50 : POLL_INTERVAL_NS_DEFAULT;
    this.minDwellNs = hasClock50 ? MIN_DWELL_NS_WITH_CLOCK50 : MIN_DWELL_NS_DEFAULT;
    this.startRun();
  }

  private startRun(): void {
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
    // Opened read-write and non-blocking before GHDL starts: read-write so
    // this open doesn't wait for a reader and GHDL's own read-mode open
    // doesn't wait for a writer; non-blocking so a full FIFO could never
    // stall this event loop (PACING_MAX_OUTSTANDING keeps it from filling).
    execFileSync('mkfifo', [this.pacingPath()]);
    this.pacingFd = openSync(this.pacingPath(), fsConstants.O_RDWR | fsConstants.O_NONBLOCK);
    const handle = startPersistentRun(
      this.dir,
      TB_ENTITY,
      this.inputPath(),
      this.outputPath(),
      this.pollIntervalNs,
      this.minDwellNs,
      this.heartbeatPath(),
      this.pacingPath(),
    );
    this.run = handle;
    this.startPacing(handle);
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
      if (wasRunning && code !== 0) {
        this.send({ verb: 'ERROR', stage: 'runtime', text: stderr || 'Simulation exited unexpectedly.' });
      }
    });
    // The design's own report/assert output — GHDL writes this to
    // stdout, not the result file, so it needs its own forwarding path
    // (the generated testbench itself never writes to stdout, so
    // everything that arrives here is the student's own `report`/
    // `assert`, never internal plumbing).
    handle.onOutput((line) => {
      if (line.trim().length > 0) this.send({ verb: 'LOG', text: line });
    });
    this.state = 'running';
    this.send({ verb: 'READY' });
    this.startOutputPolling();
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

  private pollOutput(): void {
    let text: string;
    try {
      text = readFileSync(this.outputPath(), 'utf8');
    } catch {
      return; // Nothing written yet.
    }
    const [bits = '', ackText = ''] = (text.split('\n')[0] ?? '').trim().split(/\s+/);
    if (bits.length !== STATE_LENGTH) return;
    const ack = parseInt(ackText, 10);
    if (!Number.isNaN(ack) && this.stimQueue.length > 0 && this.stimQueue[0].seq <= ack) {
      this.stimQueue = this.stimQueue.filter((s) => s.seq > ack);
      this.writeStimQueue();
    }
    if (bits === this.lastSentState) return;
    this.lastSentState = bits;
    this.send({ verb: 'STATE', bits });
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

  /**
   * Elaborates a portless entity directly (no wrapper — see `runBatch()`'s
   * doc comment in `ghdl.ts`) and starts it. Split from `handleRun` only
   * because `handleRun`'s board-mode path already has its own `-e` step
   * in between the same two points; the analysis loop above is shared.
   */
  private async runElaborateAndBatch(entityName: string): Promise<void> {
    const r = await runCmd('ghdl', ['-e', '--std=08', entityName], this.dir, BUILD_TIMEOUT_MS);
    if (r.code !== 0) {
      this.send({ verb: 'ERROR', stage: 'elaborate', text: r.err });
      this.state = 'stopped';
      return;
    }
    this.mode = 'batch';
    this.startBatchRun(entityName);
  }

  private startBatchRun(entityName: string): void {
    const handle = runBatch(this.dir, entityName, (line) => {
      if (line.trim().length > 0) this.send({ verb: 'LOG', text: line });
    }, BATCH_TIMEOUT_MS);
    this.batchRun = handle;
    this.state = 'running';
    this.send({ verb: 'READY' });

    handle.done.then(({ code, timedOut, stderr }) => {
      if (this.destroyed || this.batchRun !== handle) return; // superseded by Stop/Reset/a new RUN
      this.batchRun = null;
      const wasRunning = this.state === 'running';
      this.state = 'stopped';
      if (!wasRunning) return; // already reported via handleStop's own DONE
      if (timedOut) {
        this.send({
          verb: 'ERROR',
          stage: 'runtime',
          text: `Simulation exceeded ${BATCH_TIMEOUT_MS / 1000}s and was stopped. Check for a process with no wait statement, or a wait condition that never becomes true.`,
        });
      } else if (code !== 0) {
        this.send({ verb: 'ERROR', stage: 'runtime', text: stderr || 'Simulation exited unexpectedly.' });
      } else {
        this.send({ verb: 'DONE', reason: 'completed' });
      }
    });
  }

  handleStim(bits: string): void {
    if (this.state !== 'running' || this.mode !== 'board') return;
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
    renameSync(tmp, this.inputPath());
  }

  handleReset(): void {
    if (this.state !== 'running' || !this.entityName) return;
    if (this.mode === 'board') {
      this.stopActive(null);
      this.startRun();
    } else if (this.mode === 'batch') {
      this.stopActive(null);
      this.startBatchRun(this.entityName);
    }
  }

  handleStop(): void {
    this.stopActive('stopped');
  }

  /** Tears down whichever of the two run kinds is currently active. */
  private stopActive(reason: 'stopped' | null): void {
    this.stopOutputPolling();
    this.stopPacing();
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
    if (this.run) this.run.kill();
    if (this.batchRun) this.batchRun.kill();
    void fs.rm(this.dir, { recursive: true, force: true }).catch(() => {});
  }
}
