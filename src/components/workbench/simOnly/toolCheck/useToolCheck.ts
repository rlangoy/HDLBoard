// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import { useCallback, useMemo, useRef, useState } from 'react';
import type { SynthCheckRequest, SynthResult } from '../../hdlClient';
import type { ToolFinding } from '../types';
import { CheckSession, type CheckRun, type ProjectNow, type StartOutcome } from './checkSession';
import { fitsFiles, shownFindings, type CheckedFile, type ToolCheckResult } from './toolFindings';
import {
  designMessageLine, findingLine, foundLine, isToldSkip, passedLine, TOLD_SKIP_TEXT, UNCHANGED_NOTE, unverifiedLine,
} from './toolCheckText';

/** A console line of the check; `at`, the line its *Line n* link opens. */
export interface ToolConsoleLine {
  readonly text: string;
  readonly at?: { readonly fileId: string; readonly line: number };
}

export interface ToolCheckOptions {
  /** *Synthesis* with *Quick check + GHDL check (VHDL)* chosen. */
  readonly enabled: boolean;
  /** The files as the editor has them now. */
  readonly files: readonly CheckedFile[];
  readonly log: (line: ToolConsoleLine) => void;
  /** The project as it is now, not 500 ms ago (`TestbenchSplit.designViewNow`). */
  readonly viewNow: () => ProjectNow;
}

export interface ToolCheckApi {
  /** At Start: the run's SYNTH-CHECK, or undefined (off, nothing to check, or the last answer applies). */
  start(run: CheckRun): SynthCheckRequest | undefined;
  /** A `SYNTH-RESULT`, or the page's own answer when none can come. Stable. */
  receive(result: SynthResult): void;
  /** The answer that fits the code as it is now; null after an edit to a file it read, or a newer Start. */
  readonly applied: ToolCheckResult | null;
  /** Its findings, for the design check. */
  readonly findings: readonly ToolFinding[];
}

/** The most findings and messages the console lists for one check; the code shows them all. */
const LISTED_FINDINGS = 5;
const LISTED_MESSAGES = 3;

const NO_FINDINGS: readonly ToolFinding[] = [];

/** The headline of an answer: passed, how many lines, or why it could not verify. */
function answerLine(result: ToolCheckResult, shown: readonly ToolFinding[]): string {
  if (result.status === 'passed') return passedLine(result.top);
  if (result.status === 'found') return foundLine(result.top, new Set(shown.map((f) => `${f.fileId}:${f.line}`)).size);
  return unverifiedLine(result.top, result.reason ?? 'tool-error');
}

/** The console lines of an answer: what it says for the design, then its lines, each linked, once per line and meaning. */
export function consoleLines(result: ToolCheckResult, project: ProjectNow): ToolConsoleLine[] {
  const shown = shownFindings(result.findings, project.view, project.overrides);
  const names = new Map(result.files.map((file) => [file.id, file.name]));
  const said = (f: ToolFinding) => `${f.fileId}:${f.line}:${f.text.headline}`;
  const distinct = shown.filter((f, i) => shown.findIndex((g) => said(g) === said(f)) === i);
  const lines = distinct.slice(0, LISTED_FINDINGS).map((f) => ({ text: findingLine(names.get(f.fileId) ?? f.fileId, f.text.headline), at: { fileId: f.fileId, line: f.line } }));
  const messages = result.designMessages.slice(0, LISTED_MESSAGES).map((message) => ({ text: designMessageLine(message) }));
  return [{ text: answerLine(result, shown) }, ...lines, ...messages];
}

/**
 * GHDL's synthesis check at Start (docs/impl_sim_only_warnings.md § 7), for the Workbench:
 * which check a run asks for, its answer once it comes, and the findings while they fit
 * the code. The run never waits for it.
 */
export function useToolCheck({ enabled, files, log, viewNow }: ToolCheckOptions): ToolCheckApi {
  const [session] = useState(() => new CheckSession());
  const [result, setResult] = useState<ToolCheckResult | null>(null);
  // The client's handlers are made once: an answer reads the newest console and project.
  const latest = useRef({ log, viewNow });
  latest.current = { log, viewNow };
  const show = useCallback((answer: ToolCheckResult) => {
    setResult(answer);
    for (const line of consoleLines(answer, latest.current.viewNow())) latest.current.log(line);
  }, []);
  const receive = useCallback((answer: SynthResult) => {
    const placed = session.answer(answer, latest.current.viewNow().view);
    if (placed !== undefined) show(placed);
  }, [session, show]);
  const start = (run: CheckRun): SynthCheckRequest | undefined => {
    setResult(null);
    if (!enabled) {
      session.forget();
      return undefined;
    }
    return requestOf(session.start(run, viewNow()), { log, show });
  };
  // Off (or *Simulation only*), the last answer goes at once; after an edit to a file it read, too.
  const applied = useMemo(() => (enabled && result !== null && fitsFiles(result, files) ? result : null), [enabled, result, files]);
  const findings = useMemo(() => applied?.findings ?? NO_FINDINGS, [applied]);
  return { start, receive, applied, findings };
}

/** What Start sends for the check, after saying what is news: a skip the student expected a check for, or the last answer again. */
function requestOf(outcome: StartOutcome, { log, show }: { log: ToolCheckOptions['log']; show: (answer: ToolCheckResult) => void }): SynthCheckRequest | undefined {
  if (outcome.kind === 'ask') return outcome.request;
  if (outcome.kind === 'known') {
    log({ text: UNCHANGED_NOTE });
    show(outcome.result);
  } else if (isToldSkip(outcome.reason)) {
    log({ text: TOLD_SKIP_TEXT[outcome.reason] });
  }
  return undefined;
}
