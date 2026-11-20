// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * The synthesis check beside a run (docs/impl_sim_only_warnings.md § 7, protocol 8):
 * `ghdl --synth` or `iverilog -S -tnull` on the run's hardware top, at low priority and
 * under a time limit, while the simulation runs. It never delays or stops the run: the
 * session starts it after the run has started and forgets it if a newer run comes.
 *
 * Each check works in a folder of its own, holding a copy of the files it reads, so the
 * next run can write its files and clear its library meanwhile, and a Windows file lock
 * of a killed tool never stands in the way. The server reports only what happened to
 * the process (`SynthOutcome`); the page decides what the messages mean.
 */

import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import type { SynthCommand } from './engines/types.js';
import type { SynthOutcome, VhdlFileInput } from './protocol.js';
import { crashOf } from './runFailure.js';
import { runCommand, type CmdResult } from './runtime.js';
import { readIntSetting, SYNTH_MAX_CONCURRENT } from './settings.js';

/** Removing a check's folder is tried again for a while: on Windows a killed tool still holds it for a moment. */
const CLEANUP_RETRIES = 10;
const CLEANUP_RETRY_MS = 100;

/** What a tool says when it has no synthesis at all: a GHDL built without it, an Icarus without its `null` target. */
const NO_SYNTHESIS = /unknown command '--synth'|Unable to read config file/i;

/** A limit on how many checks run at once, shared by every session of the server. */
export class SynthSlots {
  private used = 0;

  constructor(private readonly max: number) {}

  /** A slot and the function that gives it back (once), or undefined when every slot is taken. */
  take(): (() => void) | undefined {
    if (this.used >= this.max) return undefined;
    this.used++;
    let released = false;
    return () => {
      if (released) return;
      released = true;
      this.used--;
    };
  }
}

/** The server's slots: HDL_SYNTH_MAX_CONCURRENT checks at once. */
export const SERVER_SYNTH_SLOTS = new SynthSlots(readIntSetting(SYNTH_MAX_CONCURRENT));

export interface SynthRun {
  /** The session folder; the check's own folder is made inside it. */
  readonly dir: string;
  /** The page's number for the check: it names the folder too. */
  readonly id: number;
  readonly command: SynthCommand;
  /** The student's files the check may read, with the run's content. */
  readonly files: readonly VhdlFileInput[];
  readonly timeoutMs: number;
  /** Aborted when a newer run replaces this one, or the session ends: the check is killed. */
  readonly signal: AbortSignal;
}

export interface SynthReport {
  readonly outcome: SynthOutcome;
  /** What the tool printed, stderr then stdout, bounded as every compile's output is. */
  readonly text: string;
}

/** How the check's process ended, as the page is told it. */
export function synthReportOf(result: CmdResult): SynthReport {
  const text = [result.err, result.out].map((part) => part.trimEnd()).filter((part) => part !== '').join('\n');
  if (result.timedOut) return { outcome: { kind: 'timeout' }, text };
  const signal = result.signal ?? null;
  // `runCommand` gives code -1 and no signal when the program could not be started at all.
  if ((result.code === -1 && signal === null) || NO_SYNTHESIS.test(text)) return { outcome: { kind: 'unavailable' }, text };
  if (crashOf({ code: result.code, stderr: text, signal }) !== undefined) return { outcome: { kind: 'crash' }, text };
  return { outcome: { kind: 'exit', code: result.code }, text };
}

/** Writes the check's folder: the student's files and the tool's generated ones. */
async function writeFolder(folder: string, files: readonly VhdlFileInput[]): Promise<void> {
  await fs.mkdir(folder, { recursive: true });
  for (const file of files) await fs.writeFile(join(folder, file.name), file.content);
}

/**
 * Runs one check to its end. Undefined when it was cancelled (a newer run, the session's
 * end): nobody waits for its answer any more.
 */
export async function runSynthCheck(run: SynthRun, slots: SynthSlots = SERVER_SYNTH_SLOTS): Promise<SynthReport | undefined> {
  if (run.signal.aborted) return undefined;
  const release = slots.take();
  if (release === undefined) return { outcome: { kind: 'busy' }, text: '' };
  const folder = join(run.dir, `synth-${run.id}`);
  try {
    await writeFolder(folder, [...run.files, ...run.command.extraFiles]);
    if (run.signal.aborted) return undefined;
    const { cmd, args } = run.command;
    const result = await runCommand({ cmd, args, cwd: folder, timeoutMs: run.timeoutMs, signal: run.signal, lowPriority: true });
    return run.signal.aborted ? undefined : synthReportOf(result);
  } catch (err) {
    // The folder could not be written (a full disk): the check could not run.
    return { outcome: { kind: 'unavailable' }, text: String(err) };
  } finally {
    release();
    void fs.rm(folder, { recursive: true, force: true, maxRetries: CLEANUP_RETRIES, retryDelay: CLEANUP_RETRY_MS }).catch(() => {});
  }
}
