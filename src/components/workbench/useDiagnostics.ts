// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import { useCallback, useRef, useState } from 'react';
import { parseDiagnostics } from './diagnostics';
import { locateDiagnostics, type LocatedDiagnostic, type RunSnapshot } from './diagnosticLocation';
import { addToFiles, NO_DIAGNOSTICS, withoutFile, type DiagnosticsByFile } from './diagnosticStore';

export interface DiagnosticsApi {
  readonly byFile: DiagnosticsByFile;
  /** Clears everything and remembers what this run compiles. */
  startRun(snapshot: RunSnapshot): void;
  /** Parses simulator text, keeps what locates, and returns it (for reveal). */
  record(text: string, currentFiles: RunSnapshot['files']): readonly LocatedDiagnostic[];
  dismissFile(fileId: string): void;
  /** The place a console line names, if it is a marked one (console links). */
  locateText(line: string, currentFiles: RunSnapshot['files']): LocatedDiagnostic | undefined;
}

const NO_RUN: RunSnapshot = { files: [] };

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

  const record = useCallback((text: string, currentFiles: RunSnapshot['files']): readonly LocatedDiagnostic[] => {
    // The boundary between the pure code and the client handlers: a parser
    // bug may lose markers, but never the simulator's output or the run.
    try {
      const located = locateDiagnostics(parseDiagnostics(text), snapshotRef.current, currentFiles);
      if (located.length > 0) setByFile((prev) => addToFiles(prev, located));
      return located;
    } catch (err) {
      console.error('Diagnostics:', err);
      return [];
    }
  }, []);

  const dismissFile = useCallback((fileId: string) => {
    setByFile((prev) => withoutFile(prev, fileId));
  }, []);

  const locateText = useCallback((line: string, currentFiles: RunSnapshot['files']) => {
    if (snapshotRef.current.files.length === 0) return undefined; // no run yet: nothing to link
    return locateDiagnostics(parseDiagnostics(line), snapshotRef.current, currentFiles)[0];
  }, []);

  return { byFile, startRun, record, dismissFile, locateText };
}
