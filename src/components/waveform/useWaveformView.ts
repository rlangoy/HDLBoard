// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * Everything the Workbench needs from the waveform viewer, in one place
 * (docs/waveform_viewer_spec.md § 8.6, § 8.7): the frames from the client, the view
 * opened and closed in step with the editor's overlay, the Explorer folded away while
 * it is open, the console's links into it, Go to declaration, and a fresh start when
 * another project is opened.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { VhdlFile } from '../workbench/files';
import type { WaveClientHandlers } from '../workbench/hdlClient';
import { filesOfRun, findDeclaration, scopeFileName, type DeclarationTarget } from './declarations';
import { filesOf, newestOrigin, originOf, withOrigin, type RunOrigin, type RunOrigins } from './runOrigins';
import { useWaveform, type RunInfo, type Waveform } from './useWaveform';
import type { SavedViews } from './useSavedView';
import type { WaveFocus } from './useWaveView';
import type { ViewMemory } from './viewSetup';
import { buttonState, type ButtonState } from './waveState';

/** The overlay slot of the editor area that the view takes (W8). */
export interface OverlaySlot {
  readonly shown: boolean;
  show(): void;
  hide(): void;
}

export interface ExplorerPane {
  readonly collapsed: boolean;
  show(open: boolean): void;
}

export interface WaveformViewInput {
  readonly waveGet: (run: number) => void;
  readonly overlay: OverlaySlot;
  readonly explorer: ExplorerPane;
  /** The project's files, read when a declaration is looked up. */
  readonly files: () => readonly VhdlFile[];
  readonly reveal: (target: DeclarationTarget) => void;
  /** Writes a line to the console; `link` adds the "Open waveform" link (FR-25). */
  readonly log: (text: string, link?: boolean) => void;
  /** Changes when another project is opened. */
  readonly projectKey: string;
  /** The open project's saved waveform views (docs/imp_wave_rearange.md § 11). */
  readonly savedViews: SavedViews;
}

export interface WaveformView {
  readonly waveform: Waveform;
  /** The client's waveform handlers, which also note that this run offered one. */
  readonly clientHandlers: WaveClientHandlers;
  /** `source`: which testbench runs (its file and unit), to tell whose waveform is shown. */
  runStarted(info: RunInfo & { readonly title: string; readonly source: string }): void;
  /** The `source` of the run whose waveform the view has now, or null. */
  readonly source: string | null;
  /** A board state arrived: the run is a board run (W1). */
  boardStateSeen(): void;
  runEnded(): void;
  readonly pane: {
    readonly title: string;
    readonly memory: React.MutableRefObject<ViewMemory | null>;
    readonly saved: SavedViews;
    readonly focus: WaveFocus | null;
    readonly onGoToDeclaration: (scopes: readonly string[], name: string) => void;
    /** The file a scope's unit is in, for the section heads' tooltips. */
    readonly fileOfScope: (scopes: readonly string[]) => string | undefined;
  };
  readonly button: { readonly state: ButtonState; readonly onToggle: () => void };
  /**
   * Opens the view as soon as the run just started offers its waveform (the Waveform
   * button pressed with nothing to show yet, which ran the testbench); forgotten if
   * the run ends without one.
   */
  openWhenReady(): void;
  /** The console's links into the view; absent while there is nothing to show. */
  readonly links: { readonly onOpenTime?: (fs: number) => void; readonly onOpenWaveform?: () => void };
  readonly dialog: { readonly open: boolean; readonly afterBoardRun: boolean; readonly onClose: () => void };
}

const LINK_LINE = '✓ Testbench finished – ';

/**
 * Per run: whether it offered a waveform (WAVE-READY comes before DONE), and whether it
 * is a board run. `onOffered` runs right after a WAVE-READY has been handled, with its run.
 */
function useRunTracking(waveform: Waveform, log: WaveformViewInput['log'], onOffered: (run: number) => void) {
  const offered = useRef(false);
  const board = useRef(false);
  const latest = useRef(waveform);
  latest.current = waveform;
  const offeredRef = useRef(onOffered);
  offeredRef.current = onOffered;
  const clientHandlers = useMemo<WaveClientHandlers>(
    () => ({
      ...waveform.handlers,
      onReady: (ready) => {
        offered.current = true;
        waveform.handlers.onReady(ready);
        offeredRef.current(ready.run);
      },
    }),
    [waveform.handlers],
  );
  const boardStateSeen = useCallback(() => {
    if (board.current) return;
    board.current = true;
    latest.current.boardRunSeen();
  }, []);
  const runEnded = useCallback(() => {
    latest.current.runEnded();
    if (offered.current && !latest.current.openedOnce) log(LINK_LINE, true);
    offered.current = false;
  }, [log]);
  const reset = useCallback(() => {
    offered.current = false;
    board.current = false;
  }, []);
  return { clientHandlers, boardStateSeen, runEnded, reset };
}

/** The Explorer folds away while the view is open, and comes back after if it was open. */
function useExplorerFold(explorer: ExplorerPane, viewOpen: boolean) {
  const before = useRef<boolean | null>(null);
  const fold = () => {
    if (before.current !== null) return;
    before.current = !explorer.collapsed;
    explorer.show(false);
  };
  const { show } = explorer;
  // Only a view that was open and has closed brings the Explorer back: an effect left
  // over from a render before the view opened (a run's WAVE-READY opens it, not a click)
  // still sees it closed, and must not undo the fold.
  const wasOpen = useRef(false);
  useEffect(() => {
    if (viewOpen) {
      wasOpen.current = true;
      return;
    }
    if (!wasOpen.current) return;
    wasOpen.current = false;
    if (before.current) show(true);
    before.current = null;
  }, [viewOpen, show]);
  return fold;
}

/** The view's `open` and the editor's overlay move together, whichever side changes first. */
function useOverlaySync(waveform: Waveform, overlay: OverlaySlot) {
  const { open } = waveform.state;
  const { close } = waveform;
  const { shown, hide } = overlay;
  useEffect(() => {
    if (!shown && open) close();
  }, [shown, open, close]);
  useEffect(() => {
    if (!open) hide();
  }, [open, hide]);
}

/** Another project starts with no waveform and the first view (FR-17); only a change of project does this. */
function useProjectReset(projectKey: string, reset: () => void, memory: React.MutableRefObject<ViewMemory | null>) {
  const seen = useRef(projectKey);
  const latestReset = useRef(reset);
  latestReset.current = reset;
  useEffect(() => {
    if (seen.current === projectKey) return;
    seen.current = projectKey;
    memory.current = null;
    latestReset.current();
  }, [projectKey, memory]);
}

/** Go to declaration, searching only `files` – the shown waveform's run's files. */
function useDeclarations(input: WaveformViewInput, files: () => readonly VhdlFile[]) {
  const { reveal, log } = input;
  return useCallback(
    (scopes: readonly string[], name: string) => {
      const target = findDeclaration(files(), scopes, name);
      if (target === undefined) log(`The declaration of ${name} was not found in the testbench's design files.`);
      else reveal(target);
    },
    [files, reveal, log],
  );
}

/**
 * Showing the view (with the Explorer folded away), and the runs it follows. Also
 * openWhenReady: the run just started opens the view with its WAVE-READY (by then the
 * button is not 'empty' any more); a new run, or one ending without a waveform, forgets it.
 */
function useViewRuns(waveform: Waveform, input: WaveformViewInput) {
  const pending = useRef(false);
  // The run going on, and the origin of every recent run that offered a waveform.
  const running = useRef<RunOrigin | null>(null);
  const [origins, setOrigins] = useState<RunOrigins>([]);
  const fold = useExplorerFold(input.explorer, waveform.state.open);
  const showView = () => {
    fold();
    waveform.open();
    input.overlay.show();
  };
  const runs = useRunTracking(waveform, input.log, (run) => {
    const origin = running.current;
    if (origin !== null) setOrigins((kept) => withOrigin(kept, run, origin));
    if (pending.current) showView();
    pending.current = false;
  });
  const { runEnded: endRun, reset } = runs;
  const runEnded = useCallback(() => {
    pending.current = false;
    endRun();
  }, [endRun]);
  const runReset = useCallback(
    (run: RunOrigin) => {
      pending.current = false;
      running.current = run;
      reset();
    },
    [reset],
  );
  const openWhenReady = useCallback(() => {
    pending.current = true;
  }, []);
  return { ...runs, showView, runEnded, reset: runReset, openWhenReady, origins };
}

export function useWaveformView(input: WaveformViewInput): WaveformView {
  const waveform = useWaveform(input.waveGet);
  const runs = useViewRuns(waveform, input);
  const [title, setTitle] = useState('testbench');
  const [focus, setFocus] = useState<WaveFocus | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const memory = useRef<ViewMemory | null>(null);
  useOverlaySync(waveform, input.overlay);
  useProjectReset(input.projectKey, waveform.reset, memory);
  const state = buttonState(waveform.state);
  const { files } = input;
  // The files of the run whose waveform is on screen – not the newest run's, which may still be loading.
  const shownOrigin = originOf(runs.origins, waveform.state.dataRun);
  const runFiles = useCallback(() => filesOf(shownOrigin, files()), [shownOrigin, files]);
  const open = () => {
    if (state === 'empty') return setDialogOpen(true);
    runs.showView();
  };
  const openAt = (fs: number) => {
    setFocus((previous) => ({ fs, id: (previous?.id ?? 0) + 1 }));
    open();
  };
  const runStarted = (info: RunInfo & { readonly title: string; readonly source: string }) => {
    runs.reset({ source: info.source, fileIds: filesOfRun(input.files(), info.topFileName).map((file) => file.id) });
    setTitle(info.title);
    waveform.runStarted(info);
  };
  return {
    waveform,
    clientHandlers: runs.clientHandlers,
    runStarted,
    source: newestOrigin(runs.origins)?.source ?? null,
    boardStateSeen: runs.boardStateSeen,
    runEnded: runs.runEnded,
    openWhenReady: runs.openWhenReady,
    pane: { title, memory, saved: input.savedViews, focus, onGoToDeclaration: useDeclarations(input, runFiles), fileOfScope: (scopes) => scopeFileName(runFiles(), scopes) },
    button: { state, onToggle: () => (waveform.state.open ? waveform.close() : open()) },
    links: state === 'empty' ? {} : { onOpenTime: openAt, onOpenWaveform: open },
    dialog: { open: dialogOpen, afterBoardRun: waveform.state.boardRun, onClose: () => setDialogOpen(false) },
  };
}
