// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * GHDL's synthesis answers, kept until the code or the check's settings change
 * (docs/impl_sim_only_warnings.md § 7): Start on unchanged code shows the last answer
 * without running GHDL again. Only answers about the code are kept; a timeout, a crash or
 * a busy server says nothing about it and is tried again at the next Start. A hit needs
 * the exact text of every file, not only its fingerprint. Pure, apart from the entries
 * the cache holds.
 */

import { fingerprintOf } from '../../../../project/fingerprint';
import type { CheckTarget } from './targets';
import type { CheckedFile, ToolCheckResult } from './toolFindings';

/** As many checks as a lesson switches between; each holds a copy of its files. */
export const CACHE_ENTRIES = 16;

export interface CacheKeyInput {
  readonly target: CheckTarget;
  readonly files: readonly CheckedFile[];
  /** The project's compiler options, as the run sends them. */
  readonly compilerOptions: unknown;
  /** The backend that answers: another one may have another GHDL. */
  readonly backend: string;
}

const KEY_SEPARATOR = '\u0001';
const NAME_SEPARATOR = '\u0000';

export function cacheKey({ target, files, compilerOptions, backend }: CacheKeyInput): string {
  const names = files.map((file) => file.name).join(NAME_SEPARATOR);
  return [target.top, target.topFileId, JSON.stringify(compilerOptions ?? {}), backend, names, fingerprintOf(files)].join(KEY_SEPARATOR);
}

/**
 * Whether the same code and settings would give the same answer again: GHDL's verdict, or
 * a message of its own. A timeout, a crash or a busy server says nothing about the code.
 */
export function isLasting(result: ToolCheckResult): boolean {
  return result.reason === undefined || result.reason === 'tool-error';
}

const sameFiles = (a: readonly CheckedFile[], b: readonly CheckedFile[]): boolean =>
  a.length === b.length && a.every((file, i) => file.id === b[i]?.id && file.name === b[i]?.name && file.content === b[i]?.content);

export class ToolCheckCache {
  private readonly entries = new Map<string, ToolCheckResult>();

  constructor(private readonly limit = CACHE_ENTRIES) {}

  /** The answer for `key` when it was given for exactly these files. */
  get(key: string, files: readonly CheckedFile[]): ToolCheckResult | undefined {
    const result = this.entries.get(key);
    if (result === undefined || !sameFiles(result.files, files)) return undefined;
    // Used again: the last to go.
    this.entries.delete(key);
    this.entries.set(key, result);
    return result;
  }

  /** Keeps a lasting answer; the one used longest ago goes when the cache is full. */
  set(key: string, result: ToolCheckResult): void {
    if (!isLasting(result)) return;
    this.entries.delete(key);
    this.entries.set(key, result);
    const oldest = this.entries.keys().next().value;
    if (this.entries.size > this.limit && oldest !== undefined) this.entries.delete(oldest);
  }
}
