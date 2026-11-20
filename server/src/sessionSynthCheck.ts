// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * One session's synthesis checks (docs/impl_sim_only_warnings.md § 7, protocol 8): the
 * `SYNTH-CHECK` the next RUN asked for, the check still running, and the one `SYNTH-RESULT`
 * each request gets. The session tells it when a RUN starts, compiles or is refused; it
 * never touches the run itself. Only a newer RUN or the session's end stops a check: not
 * Stop, and not the run's own end, since a testbench may finish before its check does.
 */

import type { PrepareResult, SimEngine } from './engines/types.js';
import type { ServerFrame, SynthCheckRequest, SynthOutcome, VhdlFileInput } from './protocol.js';
import { runSynthCheck, type SynthSlots } from './synthCheck.js';

export interface SessionSynthCheckOptions {
  /** The session folder; each check works in a folder of its own inside it. */
  readonly dir: string;
  readonly send: (frame: ServerFrame) => void;
  readonly timeoutMs: number;
  readonly slots: SynthSlots;
}

/** A run that has compiled (or failed to), and the files its RUN sent: what its check starts from. */
export interface CompiledRun {
  readonly engine: SimEngine;
  readonly prepared: PrepareResult;
  readonly files: readonly VhdlFileInput[];
}

const SKIPPED: SynthOutcome = { kind: 'skipped' };

export class SessionSynthCheck {
  /** Asked for the next RUN (`SYNTH-CHECK`); it holds for that RUN only. */
  private asked: SynthCheckRequest | null = null;
  /** Kills the check still running. */
  private running: AbortController | null = null;
  private closed = false;

  constructor(private readonly options: SessionSynthCheckOptions) {}

  /** `SYNTH-CHECK`: check the next RUN's hardware top. */
  ask(request: SynthCheckRequest): void {
    this.asked = request;
  }

  /** A RUN starts: the check asked for is its own, and one still running for the last run is no longer news. */
  takeForRun(): SynthCheckRequest | null {
    const request = this.asked;
    this.asked = null;
    this.cancel();
    return request;
  }

  /** The RUN never started or never compiled: its check is answered `skipped`. */
  skip(request: SynthCheckRequest | null): void {
    this.answer(request, SKIPPED);
  }

  /** The RUN the check was asked for was refused before the session saw it: skipped, and none left for the next. */
  refuseAsked(): void {
    this.skip(this.takeForRun());
  }

  /** Launches the check of a run that has started, beside it, never awaited. */
  start(request: SynthCheckRequest | null, run: CompiledRun): void {
    if (request === null) return;
    const launch = this.launchOf(request, run);
    if ('kind' in launch) return this.answer(request, launch);
    const abort = new AbortController();
    this.running = abort;
    const { dir, timeoutMs, slots } = this.options;
    void runSynthCheck({ dir, id: request.id, command: launch.command, files: launch.files, timeoutMs, signal: abort.signal }, slots).then((report) => {
      if (this.running === abort) this.running = null;
      if (report !== undefined) this.answer(request, report.outcome, report.text);
    });
  }

  /** The session has ended: the running check is killed, and nothing more is sent. */
  close(): void {
    this.closed = true;
    this.cancel();
  }

  /** The command and files of a check, or why it cannot run: the run did not compile, a file it names was not sent, no check for this language. */
  private launchOf(request: SynthCheckRequest, { engine, prepared, files }: CompiledRun) {
    if (!prepared.ok) return SKIPPED;
    const sent = new Map(files.map((file) => [file.name, file]));
    const chosen = request.files.flatMap((name) => sent.get(name) ?? []);
    if (chosen.length !== request.files.length) return { kind: 'refused' } as const;
    const inputs = prepared.plan.synth;
    if (inputs === undefined || engine.synthCommand === undefined) return { kind: 'unavailable' } as const;
    return { command: engine.synthCommand(inputs, { top: request.top, files: request.files }), files: chosen };
  }

  private answer(request: SynthCheckRequest | null, outcome: SynthOutcome, text = ''): void {
    if (request === null || this.closed) return;
    this.options.send({ verb: 'SYNTH-RESULT', id: request.id, outcome, text });
  }

  private cancel(): void {
    this.running?.abort();
    this.running = null;
  }
}
