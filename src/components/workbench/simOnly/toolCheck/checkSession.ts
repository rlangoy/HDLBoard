// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * The page's side of GHDL's synthesis check (docs/impl_sim_only_warnings.md § 7), without
 * React: at Start, what the run asks for, or the last answer when the code is unchanged;
 * when an answer comes, whether it is the one asked for last, and what it means in the code.
 */

import type { SynthCheckRequest, SynthResult } from '../../hdlClient';
import type { TestbenchOverrides } from '../../tbDetect/types';
import type { DesignView } from '../types';
import { cacheKey, ToolCheckCache } from './cache';
import { classifyAnswer } from './classify';
import { checkTarget, type CheckTarget } from './targets';
import { analysedAsChecked, placeAnswer, type CheckedFile, type ToolCheckResult } from './toolFindings';
import type { SkipReason } from './toolCheckText';

export interface CheckRun {
  /** The files the run sends, as it sends them. */
  readonly runFiles: readonly CheckedFile[];
  readonly topFileId: string | null;
  /** The unit of the top file that runs, when the run names one. */
  readonly unitName: string | null;
  readonly compilerOptions: unknown;
  readonly backend: string;
}

/** The project as it is now. */
export interface ProjectNow {
  readonly view: DesignView;
  readonly overrides: TestbenchOverrides;
}

/** What Start does about the check: ask for one, show the last answer again, or none. */
export type StartOutcome =
  | { readonly kind: 'ask'; readonly request: SynthCheckRequest }
  | { readonly kind: 'known'; readonly result: ToolCheckResult }
  | { readonly kind: 'skip'; readonly reason: SkipReason };

interface Asked {
  readonly id: number;
  readonly key: string;
  readonly target: CheckTarget;
  readonly files: readonly CheckedFile[];
}

export class CheckSession {
  private asked: Asked | null = null;
  private lastId = 0;

  constructor(private readonly cache = new ToolCheckCache()) {}

  /** A Start: the check asked for before no longer counts. */
  start(run: CheckRun, { view, overrides }: ProjectNow): StartOutcome {
    this.asked = null;
    const choice = checkTarget({ view, overrides, runFiles: run.runFiles, topFileId: run.topFileId, unitName: run.unitName });
    if (choice.kind === 'skip') return choice;
    const { target } = choice;
    const files = run.runFiles.filter((file) => target.fileIds.includes(file.id));
    const key = cacheKey({ target, files, compilerOptions: run.compilerOptions, backend: run.backend });
    const known = this.cache.get(key, files);
    if (known !== undefined) return { kind: 'known', result: known };
    this.asked = { id: ++this.lastId, key, target, files };
    return { kind: 'ask', request: { id: this.lastId, top: target.top, files: files.map((file) => file.name) } };
  }

  /** The check was switched off: an answer to the one asked for no longer counts. */
  forget(): void {
    this.asked = null;
  }

  /**
   * An answer placed in the code, and kept when it says something lasting about it.
   * Undefined for an answer to an older check, and for a run that never started: its
   * compile errors already say more than a check could.
   */
  answer(answer: SynthResult, view: DesignView): ToolCheckResult | undefined {
    const asked = this.asked;
    if (asked === null || asked.id !== answer.id) return undefined;
    this.asked = null;
    if (answer.outcome.kind === 'skipped') return undefined;
    const placed = placeAnswer({ top: asked.target.top, answer: classifyAnswer(answer.outcome, answer.text), files: asked.files, view });
    // Code edited since Start cannot place its lines: that answer is shown for now (stale already), never kept.
    if (analysedAsChecked(view, asked.files)) this.cache.set(asked.key, placed);
    return placed;
  }
}
