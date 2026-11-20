// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import { useCallback, useMemo, useRef, useState } from 'react';
import type { SynthCheckRequest, SynthResult } from '../../hdlClient';
import type { TestbenchOverrides } from '../../tbDetect/types';
import type { DesignView, ToolFinding } from '../types';
import { cacheKey, ToolCheckCache } from './cache';
import { classifyAnswer } from './classify';
import { checkTarget, type CheckTarget } from './targets';
import { analysedAsChecked, fitsFiles, placeAnswer, shownFindings, type CheckedFile, type ToolCheckResult } from './toolFindings';
import {
  designMessageLine, findingLine, foundLine, passedLine, SKIP_TEXT, unchangedNote, unverifiedLine, type SkipReason,
} from './toolCheckText';

/** A console line of the check; `at`, the line its *Line n* link opens. */
export interface ToolConsoleLine {
  readonly text: string;
  readonly at?: { readonly fileId: string; readonly line: number };
}

/** The most findings and messages the console lists for one check; the code shows them all. */
const LISTED_FINDINGS = 5;
const LISTED_MESSAGES = 3;

const NO_FINDINGS: readonly ToolFinding[] = [];

/** Skips that are news: the student expected a check. Choosing *Simulation model* or *Treat as testbench* is not. */
const TOLD_SKIPS: ReadonlySet<SkipReason> = new Set(['noDut', 'ambiguous']);

export interface ToolCheckOptions {
  /** *Synthesis* with *Quick check + GHDL/Icarus check* chosen. */
  readonly enabled: boolean;
  /** The files as the editor has them now. */
  readonly files: readonly CheckedFile[];
  readonly log: (line: ToolConsoleLine) => void;
  /** The project as it is now, not 500 ms ago (`TestbenchSplit.designViewNow`). */
  readonly viewNow: () => { readonly view: DesignView; readonly overrides: TestbenchOverrides };
}

export interface ToolCheckRun {
  /** The files the run sends, as it sends them. */
  readonly runFiles: readonly CheckedFile[];
  readonly topFileId: string | null;
  /** The unit of the top file that runs, when the run names one. */
  readonly unitName: string | null;
  readonly compilerOptions: unknown;
  readonly backend: string;
}

export interface ToolCheckApi {
  /** At Start: the run's SYNTH-CHECK, or undefined (off, nothing to check, or the last answer applies). */
  start(run: ToolCheckRun): SynthCheckRequest | undefined;
  /** A `SYNTH-RESULT`, or the page's own answer when none can come; an answer to an older check is dropped. Stable. */
  receive(result: SynthResult): void;
  /** The answer that fits the code as it is now; null after an edit to a file it read, or a newer Start. */
  readonly applied: ToolCheckResult | null;
  /** Its findings, for the design check. */
  readonly findings: readonly ToolFinding[];
}

interface Pending {
  readonly id: number;
  readonly key: string;
  readonly target: CheckTarget;
  readonly files: readonly CheckedFile[];
}

/** The console lines of an answer: what it says for the design, then its lines, each linked. */
function consoleLines(result: ToolCheckResult, shown: readonly ToolFinding[], fileName: (id: string) => string): ToolConsoleLine[] {
  const { tool, top } = result;
  const headline =
    result.status === 'passed' ? passedLine(tool, top)
    : result.status === 'found' ? foundLine(tool, top, new Set(shown.map((f) => `${f.fileId}:${f.line}`)).size)
    : unverifiedLine(tool, top, result.reason ?? 'tool-error');
  // One line per place and meaning: Icarus says a refused register twice, as a warning and a "sorry".
  const said = (f: ToolFinding) => `${f.fileId}:${f.line}:${f.text.headline}`;
  const distinct = shown.filter((f, i) => shown.findIndex((g) => said(g) === said(f)) === i);
  const lines = distinct.slice(0, LISTED_FINDINGS).map((f) => ({ text: findingLine(fileName(f.fileId), f.text.headline), at: { fileId: f.fileId, line: f.line } }));
  const messages = result.designMessages.slice(0, LISTED_MESSAGES).map((message) => ({ text: designMessageLine(tool, message) }));
  return [{ text: headline }, ...lines, ...messages];
}

/** What the check keeps between a Start and its answer. */
interface CheckState {
  readonly pending: { current: Pending | null };
  readonly nextId: { current: number };
  readonly cache: ToolCheckCache;
  readonly setResult: (result: ToolCheckResult | null) => void;
  /** Logs an answer's console lines, with the findings shown for the project as it is now. */
  readonly report: (answer: ToolCheckResult) => void;
}

interface StartContext extends CheckState {
  readonly enabled: boolean;
  readonly log: ToolCheckOptions['log'];
  readonly viewNow: ToolCheckOptions['viewNow'];
}

/** At Start: the check the run asks for, the last answer again when the code is unchanged, or nothing. */
function startCheck(context: StartContext, run: ToolCheckRun): SynthCheckRequest | undefined {
  context.pending.current = null;
  context.setResult(null);
  if (!context.enabled) return undefined;
  const { view, overrides } = context.viewNow();
  const choice = checkTarget({ view, overrides, runFiles: run.runFiles, topFileId: run.topFileId, unitName: run.unitName });
  if (choice.kind === 'skip') {
    if (TOLD_SKIPS.has(choice.reason)) context.log({ text: SKIP_TEXT[choice.reason as keyof typeof SKIP_TEXT] });
    return undefined;
  }
  const { target } = choice;
  const checked = run.runFiles.filter((file) => target.fileIds.includes(file.id));
  const key = cacheKey({ target, files: checked, compilerOptions: run.compilerOptions, backend: run.backend });
  const known = context.cache.get(key, checked);
  if (known !== undefined) {
    context.setResult(known);
    context.log({ text: unchangedNote(target.tool) });
    context.report(known);
    return undefined;
  }
  const id = ++context.nextId.current;
  context.pending.current = { id, key, target, files: checked };
  return { id, top: target.top, files: checked.map((file) => file.name) };
}

/** An answer to the check asked for last: placed in the code, kept when it says something about it, logged. */
function receiveAnswer(state: CheckState, viewNow: ToolCheckOptions['viewNow'], answer: SynthResult): void {
  const asked = state.pending.current;
  if (asked === null || asked.id !== answer.id) return;
  state.pending.current = null;
  // The run did not start: its compile errors already say more than a check could.
  if (answer.outcome.kind === 'skipped') return;
  const { target, files: checked } = asked;
  const classified = classifyAnswer(target.tool, answer.outcome, answer.text);
  const { view } = viewNow();
  const placed = placeAnswer({ tool: target.tool, top: target.top, topFileId: target.topFileId, answer: classified, files: checked, view });
  // Code edited since Start cannot place its lines: that answer is shown for now (stale already), never kept.
  if (analysedAsChecked(view, checked)) state.cache.set(asked.key, placed);
  state.setResult(placed);
  state.report(placed);
}

/** The check's state, and its console report, which reads the newest `log` and `viewNow`. */
function useCheckState(latest: { readonly current: Pick<ToolCheckOptions, 'log' | 'viewNow'> }) {
  const [result, setResult] = useState<ToolCheckResult | null>(null);
  const pending = useRef<Pending | null>(null);
  const nextId = useRef(0);
  const [cache] = useState(() => new ToolCheckCache());
  const report = useCallback(
    (answer: ToolCheckResult) => {
      const { view, overrides } = latest.current.viewNow();
      const names = new Map(answer.files.map((file) => [file.id, file.name]));
      const shown = shownFindings(answer.findings, view, overrides);
      for (const line of consoleLines(answer, shown, (id) => names.get(id) ?? id)) latest.current.log(line);
    },
    [latest],
  );
  const state: CheckState = { pending, nextId, cache, setResult, report };
  return { result, state };
}

/**
 * The synthesis check at Start (docs/impl_sim_only_warnings.md § 7), for the Workbench:
 * which check a run asks for, its answer once it comes, and the findings while they fit
 * the code. The run never waits for it.
 */
export function useToolCheck({ enabled, files, log, viewNow }: ToolCheckOptions): ToolCheckApi {
  const latest = useRef({ log, viewNow });
  latest.current = { log, viewNow };
  const { result, state } = useCheckState(latest);
  const stateRef = useRef(state);
  stateRef.current = state;
  const receive = useCallback((answer: SynthResult) => receiveAnswer(stateRef.current, latest.current.viewNow, answer), []);
  // Off (or *Simulation only*), the last answer goes at once; after an edit to a file it read, too.
  const applied = useMemo(() => (enabled && result !== null && fitsFiles(result, files) ? result : null), [enabled, result, files]);
  const findings = useMemo(() => applied?.findings ?? NO_FINDINGS, [applied]);
  return { start: (run) => startCheck({ ...state, enabled, log, viewNow }, run), receive, applied, findings };
}
