// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const REMOVE_RETRIES = 20;
const REMOVE_RETRY_DELAY_MS = 50;

export interface TempDir {
  readonly path: string;
  /** Removes the directory and everything in it; safe to call twice. */
  cleanup(): void;
}

/** A fresh directory under the OS temp dir, for a test that writes files. */
export function makeTempDir(prefix: string): TempDir {
  const path = mkdtempSync(join(tmpdir(), prefix));
  // Retries because Windows refuses to delete a directory that a just-killed process
  // still has as its working directory, for a moment after the kill.
  const removeWithRetries = () => rmSync(path, { recursive: true, force: true, maxRetries: REMOVE_RETRIES, retryDelay: REMOVE_RETRY_DELAY_MS });
  return { path, cleanup: removeWithRetries };
}
