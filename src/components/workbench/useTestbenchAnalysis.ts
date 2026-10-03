// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import { useCallback, useEffect, useRef, useState } from 'react';
import { analyzeProject, type SourceFile } from './tbDetect/analyzeProject';
import type { ProjectAnalysis } from './tbDetect/types';

/** How long typing has to pause before the detector looks again (docs/impl_split_screen.md § 5.9). */
export const ANALYSIS_DELAY_MS = 500;

export interface TestbenchAnalysis {
  /** The latest analysis; up to ANALYSIS_DELAY_MS behind the text while typing. */
  readonly current: ProjectAnalysis;
  /** Analyses the changed files now, so a pair-change decision never uses stale results. */
  readonly flush: () => ProjectAnalysis;
}

/**
 * The project's testbench analysis, re-run ANALYSIS_DELAY_MS after the last edit
 * (never per keystroke, AC-18). `flush` is for pair-change events (D7).
 */
export function useTestbenchAnalysis(files: readonly SourceFile[]): TestbenchAnalysis {
  const [current, setCurrent] = useState(() => analyzeProject(files));
  const latest = useRef(current);
  const filesRef = useRef(files);
  filesRef.current = files;

  const flush = useCallback(() => {
    const next = analyzeProject(filesRef.current, latest.current);
    if (!sameAnalysis(next, latest.current)) {
      latest.current = next;
      setCurrent(next);
    }
    return latest.current;
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(flush, ANALYSIS_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [files, flush]);

  return { current, flush };
}

/** Every file's result reused, and no file added or removed. */
function sameAnalysis(a: ProjectAnalysis, b: ProjectAnalysis): boolean {
  if (a.byFile.size !== b.byFile.size) return false;
  for (const [id, file] of a.byFile) if (b.byFile.get(id) !== file) return false;
  return true;
}
