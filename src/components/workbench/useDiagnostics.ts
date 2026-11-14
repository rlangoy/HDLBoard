// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import { useCallback, useRef, useState } from 'react';
import { adviseDiagnostics, adviseLogDiagnostics, type AdvisedDiagnostic } from './diagnosticAdvice';
import { DiagnosticParser, parseDiagnostics, type Diagnostic } from './diagnostics';
import { locateDiagnostics, locateLink, type LocatedDiagnostic, type RunSnapshot } from './diagnosticLocation';
import { addToFiles, NO_DIAGNOSTICS, withoutFile, withStoredMessage, type DiagnosticsByFile } from './diagnosticStore';

export interface DiagnosticsApi {
  readonly byFile: DiagnosticsByFile;
  /** Clears everything and remembers what this run compiles. */
  startRun(snapshot: RunSnapshot): void;
  /**
   * Parses simulator text (a LOG line), keeps what locates, and returns it. Only
   * known Icarus compiler messages and GHDL's failed range checks get advice here.
   * Streamed Icarus notes enrich the preceding warning; a GHDL error whose place
   * comes on a later line is carried over to it.
   */
  record(text: string, currentFiles: RunSnapshot['files']): readonly AdvisedDiagnostic[];
  /**
   * The same for the body of an ERROR frame — compiler output — plus the advice of
   * docs/editor_diagnostics_improvement_plan.md, and of rangeAdvice.ts for a run that dies.
   */
  recordError(text: string, currentFiles: RunSnapshot['files']): readonly AdvisedDiagnostic[];
  dismissFile(fileId: string): void;
  /** Reveals a console message without removing the file's other diagnostics. */
  show(diagnostic: LocatedDiagnostic): void;
  /** The place a console line names, still after the file was edited (console links). */
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
/** Advice recorded during a run names spans in the text that ran; it fits only while that text is unchanged. */
function unchangedSinceRun(fileId: string, snapshot: RunSnapshot, currentFiles: RunSnapshot['files']): boolean {
  const ran = snapshot.files.find((file) => file.id === fileId);
  const current = currentFiles.find((file) => file.id === fileId);
  return ran !== undefined && ran.content === current?.content;
}

export function useDiagnostics(): DiagnosticsApi {
  const [byFile, setByFile] = useState<DiagnosticsByFile>(NO_DIAGNOSTICS);
  const snapshotRef = useRef<RunSnapshot>(NO_RUN);
  const logParserRef = useRef(new DiagnosticParser());
  const recordedRef = useRef<DiagnosticsByFile>(NO_DIAGNOSTICS);

  const startRun = useCallback((snapshot: RunSnapshot) => {
    snapshotRef.current = snapshot;
    logParserRef.current = new DiagnosticParser();
    recordedRef.current = NO_DIAGNOSTICS;
    setByFile(NO_DIAGNOSTICS);
  }, []);

  const keep = useCallback(<T extends AdvisedDiagnostic>(diagnostics: readonly T[]): readonly T[] => {
    recordedRef.current = addToFiles(recordedRef.current, diagnostics);
    if (diagnostics.length > 0) setByFile((prev) => addToFiles(prev, diagnostics));
    return diagnostics;
  }, []);

  const locate = useCallback(
    (parsed: readonly Diagnostic[], currentFiles: RunSnapshot['files']) =>
      locateDiagnostics(parsed, snapshotRef.current, currentFiles),
    [],
  );

  const record = useCallback(
    (text: string, currentFiles: RunSnapshot['files']) =>
      guarded(() => keep(adviseLogDiagnostics(locate(logParserRef.current.parse(text), currentFiles), snapshotRef.current))),
    [keep, locate],
  );

  const recordError = useCallback(
    (text: string, currentFiles: RunSnapshot['files']) =>
      guarded(() => keep(adviseDiagnostics(locate(parseDiagnostics(text), currentFiles), snapshotRef.current))),
    [keep, locate],
  );

  const dismissFile = useCallback((fileId: string) => {
    setByFile((prev) => withoutFile(prev, fileId));
  }, []);

  const show = useCallback((diagnostic: LocatedDiagnostic) => {
    setByFile((prev) => addToFiles(prev, [diagnostic]));
  }, []);

  const locateText = useCallback(
    (line: string, currentFiles: RunSnapshot['files']) => {
      const diagnostic = locateLink(parseDiagnostics(line), snapshotRef.current, currentFiles);
      if (!diagnostic) return undefined;
      const recordedAdviceFits = unchangedSinceRun(diagnostic.fileId, snapshotRef.current, currentFiles);
      return recordedAdviceFits ? withStoredMessage(recordedRef.current, diagnostic) : diagnostic;
    },
    [],
  );

  return { byFile, startRun, record, recordError, dismissFile, show, locateText };
}
