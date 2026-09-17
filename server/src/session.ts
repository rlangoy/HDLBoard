/**
 * One Session per WebSocket connection — ../../ghdl_implementation_plan.md
 * § 7.2. Owns a temp directory, the elaborated design, and (once running)
 * the persistent GHDL process for it. Nothing here touches the socket
 * directly; `send` is a callback so this class stays testable without a
 * real WebSocket.
 */

import { promises as fs, mkdtempSync, renameSync, writeFileSync } from 'node:fs';
import { readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runCmd, runBatch, startPersistentRun, type BatchHandle, type RunHandle } from './ghdl.js';
import { findTopEntity } from './portDetect.js';
import { generateTestbench } from './tbTemplate.js';
import { STATE_LENGTH, type ServerFrame, type VhdlFileInput } from './protocol.js';

const TB_ENTITY = 'de1soc_sim_tb';
/**
 * How often (simulated time) the generated testbench's `io` process
 * re-reads the input file / re-checks for output changes (§ 5.8) — a
 * plain time-based interval, decoupled from any clock the DUT itself
 * runs on. 1 ms, not 1 us: this process does a real file_open on every
 * wakeup regardless of whether anything changed, and unlike a clock
 * edge that cost is real wall-clock time, not simulated time — 1 us was
 * inherited unchanged from the old clk_sig-edge-counted cadence and
 * became the new bottleneck once clk_sig's own cost was removed for
 * designs that don't declare CLOCK_50 (§ 5.8). 1 ms is still far below
 * OUTPUT_POLL_MS (below) and any human-perceptible latency.
 */
const POLL_INTERVAL_NS = 1_000_000;
/** How often the Node side re-reads output.txt for a change (§ 7.2). */
const OUTPUT_POLL_MS = 80;
/**
 * Real-time pacing (§ 5.9). GHDL runs a session's own simulated time as
 * fast as it can — without this, a design not declaring CLOCK_50 finishes
 * in a handful of real seconds regardless of how much simulated time (a
 * literal 10 real-hardware minutes, say) it represents, which doesn't
 * predict the design's actual timing on the board. These throttle the
 * persistent process (SIGSTOP/SIGCONT) back toward 1:1 with real time
 * whenever the testbench's own heartbeat (`tbTemplate.ts`) reports it's
 * running ahead.
 */
const PACING_CHECK_MS = 5;
/** Below this much drift, don't bother pausing — not worth the syscalls. */
const PACING_SLACK_MS = 30;
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
  private runStartTime = 0;
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
    return join(this.dir, 'heartbeat.txt');
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
    this.startRun();
  }

  private startRun(): void {
    this.lastSentState = null;
    const handle = startPersistentRun(
      this.dir,
      TB_ENTITY,
      this.inputPath(),
      this.outputPath(),
      POLL_INTERVAL_NS,
      this.heartbeatPath(),
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
    const line = text.split('\n')[0]?.trim() ?? '';
    if (line.length !== STATE_LENGTH || line === this.lastSentState) return;
    this.lastSentState = line;
    this.send({ verb: 'STATE', bits: line });
  }

  /**
   * Real-time pacing (§ 5.9) — a self-rescheduling check, not `setInterval`,
   * so a pause-then-resume cycle's own timing doesn't fight a fixed tick.
   * Identity-checked against `handle` at every step, same pattern as
   * `startRun`'s `onExit`: `stopActive`/a new `RUN` can supersede this run
   * asynchronously, and a stale tick must not act on (or pause!) whatever
   * replaced it.
   */
  private startPacing(handle: RunHandle): void {
    this.runStartTime = Date.now();
    const tick = () => {
      if (this.run !== handle) return;
      let simMs: number | null = null;
      try {
        const n = parseInt(readFileSync(this.heartbeatPath(), 'utf8').trim(), 10);
        if (!Number.isNaN(n)) simMs = n;
      } catch {
        // No heartbeat yet — nothing to correct against this tick.
      }
      if (simMs !== null) {
        const drift = simMs - (Date.now() - this.runStartTime);
        if (drift > PACING_SLACK_MS) {
          // Full drift, not a capped partial correction: GHDL runs at
          // whatever multiple of real time the design's own event volume
          // happens to produce (§ 5.8) — a capped pause only ever closes
          // part of the gap each cycle, so drift re-accumulates faster
          // than it's paid down and convergence never reaches 1:1, just a
          // smaller, equally arbitrary compression ratio. Stop stays
          // responsive regardless of how long this pause runs: `kill()`
          // resumes the process before signalling it (§ 5.9, `ghdl.ts`).
          handle.pause();
          this.pacingTimer = setTimeout(() => {
            if (this.run !== handle) return;
            handle.resume();
            this.pacingTimer = setTimeout(tick, PACING_CHECK_MS);
          }, drift);
          return;
        }
      }
      this.pacingTimer = setTimeout(tick, PACING_CHECK_MS);
    };
    this.pacingTimer = setTimeout(tick, PACING_CHECK_MS);
  }

  private stopPacing(): void {
    if (this.pacingTimer) {
      clearTimeout(this.pacingTimer);
      this.pacingTimer = null;
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
    // Write-then-rename: input.txt is read concurrently by the running
    // GHDL process, and a rename within the same directory is atomic on
    // POSIX, so the reader never observes a partially-written line.
    const tmp = `${this.inputPath()}.tmp`;
    writeFileSync(tmp, `${bits}\n`);
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
