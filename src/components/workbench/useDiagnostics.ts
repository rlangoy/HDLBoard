// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import { useCallback, useRef, useState } from 'react';
import { adviseDiagnostics, adviseLogDiagnostics, type AdvisedDiagnostic } from './diagnosticAdvice';
import { parseDiagnostics } from './diagnostics';
import { locateDiagnostics, type LocatedDiagnostic, type RunSnapshot } from './diagnosticLocation';
import { addToFiles, NO_DIAGNOSTICS, withoutFile, type DiagnosticsByFile } from './diagnosticStore';

export interface DiagnosticsApi {
  readonly byFile: DiagnosticsByFile;
  /** Clears everything and remembers what this run compiles. */
  startRun(snapshot: RunSnapshot): void;
  /**
   * Parses simulator text (a LOG line), keeps what locates, and returns it. Only
   * Icarus's implicit-wire warning gets advice here: the other LOG lines are the
   * simulation's own output.
   */
  record(text: string, currentFiles: RunSnapshot['files']): readonly AdvisedDiagnostic[];
  /**
   * The same for the body of an ERROR frame — compiler output — plus the advice of
   * docs/editor_diagnostics_improvement_plan.md. Runtime LOG lines get none (§ 4.12).
   */
  recordError(text: string, currentFiles: RunSnapshot['files']): readonly AdvisedDiagnostic[];
  dismissFile(fileId: string): void;
  /** The place a console line names, if it is a marked one (console links). */
  locateText(line: string, currentFiles: RunSnapshot['files']): LocatedDiagnostic | undefined;
}

const NO_RUN: RunSnapshot = { files: [] };

/**
 * The boundary between the pure code and the client handlers: a parser bug may
 * lose markers, but never the simulator's output or the run.
 */
function guarded<T>(work: () => readonly T[]): readonly T[] {
  try {
    return work();
  } catch (err) {
    console.error('Diagnostics:', err);
    return [];
  }
}

/**
 * The one stateful piece of the error markers
 * (docs/editor_diagnostics_implementation_plan.md § 4.10). Every method is
 * stable: they are called from the HdlClient handlers, which are created once.
 */
export function useDiagnostics(): DiagnosticsApi {
  const [byFile, setByFile] = useState<DiagnosticsByFile>(NO_DIAGNOSTICS);
  const snapshotRef = useRef<RunSnapshot>(NO_RUN);

  const startRun = useCallback((snapshot: RunSnapshot) => {
    snapshotRef.current = snapshot;
    setByFile(NO_DIAGNOSTICS);
  }, []);

  const keep = useCallback(<T extends AdvisedDiagnostic>(diagnostics: readonly T[]): readonly T[] => {
    if (diagnostics.length > 0) setByFile((prev) => addToFiles(prev, diagnostics));
    return diagnostics;
  }, []);

  const locate = useCallback(
    (text: string, currentFiles: RunSnapshot['files']) =>
      locateDiagnostics(parseDiagnostics(text), snapshotRef.current, currentFiles),
    [],
  );

  const record = useCallback(
    (text: string, currentFiles: RunSnapshot['files']) =>
      guarded(() => keep(adviseLogDiagnostics(locate(text, currentFiles), snapshotRef.current))),
    [keep, locate],
  );

  const recordError = useCallback(
    (text: string, currentFiles: RunSnapshot['files']) =>
      guarded(() => keep(adviseDiagnostics(locate(text, currentFiles), snapshotRef.current))),
    [keep, locate],
  );

  const dismissFile = useCallback((fileId: string) => {
    setByFile((prev) => withoutFile(prev, fileId));
  }, []);

  const locateText = useCallback(
    (line: string, currentFiles: RunSnapshot['files']) => {
      if (snapshotRef.current.files.length === 0) return undefined; // no run yet: nothing to link
      return locate(line, currentFiles)[0];
    },
    [locate],
  );

  return { byFile, startRun, record, recordError, dismissFile, locateText };
}
