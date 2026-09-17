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
import { runCmd, startPersistentRun, type RunHandle } from './ghdl.js';
import { findTopEntity } from './portDetect.js';
import { generateTestbench } from './tbTemplate.js';
import { STATE_LENGTH, type ServerFrame, type VhdlFileInput } from './protocol.js';

const TB_ENTITY = 'de1soc_sim_tb';
const POLL_CYCLES = 50;
/** How often the Node side re-reads output.txt for a change (§ 7.2). */
const OUTPUT_POLL_MS = 80;
/** Bound on ghdl -a / -e — these are expected to finish in seconds (§ 7.4). */
const BUILD_TIMEOUT_MS = 30_000;

type SessionState = 'new' | 'compiling' | 'running' | 'stopped';

export class Session {
  private readonly send: (frame: ServerFrame) => void;
  private readonly dir: string;
  private state: SessionState = 'new';
  private entityName: string | null = null;
  private run: RunHandle | null = null;
  private outputPollTimer: NodeJS.Timeout | null = null;
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

  async handleRun(files: VhdlFileInput[], topFile?: string): Promise<void> {
    this.stopRun('stopped');
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
    this.startRun();
  }

  private startRun(): void {
    this.lastSentState = null;
    this.run = startPersistentRun(
      this.dir,
      TB_ENTITY,
      this.inputPath(),
      this.outputPath(),
      POLL_CYCLES,
    );
    this.run.onExit((code, stderr) => {
      if (this.destroyed) return;
      const wasRunning = this.state === 'running';
      this.state = 'stopped';
      this.stopOutputPolling();
      if (wasRunning && code !== 0) {
        this.send({ verb: 'ERROR', stage: 'runtime', text: stderr || 'Simulation exited unexpectedly.' });
      }
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

  handleStim(bits: string): void {
    if (this.state !== 'running') return;
    // Write-then-rename: input.txt is read concurrently by the running
    // GHDL process, and a rename within the same directory is atomic on
    // POSIX, so the reader never observes a partially-written line.
    const tmp = `${this.inputPath()}.tmp`;
    writeFileSync(tmp, `${bits}\n`);
    renameSync(tmp, this.inputPath());
  }

  handleReset(): void {
    if (this.state !== 'running' || !this.entityName) return;
    this.stopRun(null);
    this.startRun();
  }

  handleStop(): void {
    this.stopRun('stopped');
  }

  private stopRun(reason: 'stopped' | null): void {
    this.stopOutputPolling();
    if (this.run) {
      this.run.kill();
      this.run = null;
    }
    if (reason && this.state === 'running') {
      this.state = 'stopped';
      this.send({ verb: 'DONE', reason });
    }
  }

  destroy(): void {
    this.destroyed = true;
    this.stopOutputPolling();
    if (this.run) this.run.kill();
    void fs.rm(this.dir, { recursive: true, force: true }).catch(() => {});
  }
}
