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
import { findDeclaration, scopeFileName, type DeclarationTarget } from './declarations';
import { useWaveform, type RunInfo, type Waveform } from './useWaveform';
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
}

export interface WaveformView {
  readonly waveform: Waveform;
  /** The client's waveform handlers, which also note that this run offered one. */
  readonly clientHandlers: WaveClientHandlers;
  runStarted(info: RunInfo & { readonly title: string }): void;
  /** A board state arrived: the run is a board run (W1). */
  boardStateSeen(): void;
  runEnded(): void;
  readonly pane: {
    readonly title: string;
    readonly memory: React.MutableRefObject<ViewMemory | null>;
    readonly focus: WaveFocus | null;
    readonly onGoToDeclaration: (scopes: readonly string[], name: string) => void;
    /** The file a scope's unit is in, for the section heads' tooltips. */
    readonly fileOfScope: (scopes: readonly string[]) => string | undefined;
  };
  readonly button: { readonly state: ButtonState; readonly onToggle: () => void };
  /** The console's links into the view; absent while there is nothing to show. */
  readonly links: { readonly onOpenTime?: (fs: number) => void; readonly onOpenWaveform?: () => void };
  readonly dialog: { readonly open: boolean; readonly afterBoardRun: boolean; readonly onClose: () => void };
}

const LINK_LINE = '✓ Testbench finished – ';

/** Per run: whether it offered a waveform (WAVE-READY comes before DONE), and whether it is a board run. */
function useRunTracking(waveform: Waveform, log: WaveformViewInput['log']) {
  const offered = useRef(false);
  const board = useRef(false);
  const latest = useRef(waveform);
  latest.current = waveform;
  const clientHandlers = useMemo<WaveClientHandlers>(
    () => ({ ...waveform.handlers, onReady: (ready) => ((offered.current = true), waveform.handlers.onReady(ready)) }),
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
  useEffect(() => {
    if (viewOpen) return;
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

function useDeclarations(input: WaveformViewInput) {
  const { files, reveal, log } = input;
  return useCallback(
    (scopes: readonly string[], name: string) => {
      const target = findDeclaration(files(), scopes, name);
      if (target === undefined) log(`The declaration of ${name} was not found in the project's files.`);
      else reveal(target);
    },
    [files, reveal, log],
  );
}

export function useWaveformView(input: WaveformViewInput): WaveformView {
  const waveform = useWaveform(input.waveGet);
  const runs = useRunTracking(waveform, input.log);
  const [title, setTitle] = useState('testbench');
  const [focus, setFocus] = useState<WaveFocus | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const memory = useRef<ViewMemory | null>(null);
  const fold = useExplorerFold(input.explorer, waveform.state.open);
  useOverlaySync(waveform, input.overlay);
  useProjectReset(input.projectKey, waveform.reset, memory);
  const state = buttonState(waveform.state);
  const open = () => {
    if (state === 'empty') return setDialogOpen(true);
    fold();
    waveform.open();
    input.overlay.show();
  };
  const openAt = (fs: number) => {
    setFocus((previous) => ({ fs, id: (previous?.id ?? 0) + 1 }));
    open();
  };
  const runStarted = (info: RunInfo & { readonly title: string }) => {
    runs.reset();
    setTitle(info.title);
    waveform.runStarted(info);
  };
  return {
    waveform,
    clientHandlers: runs.clientHandlers,
    runStarted,
    boardStateSeen: runs.boardStateSeen,
    runEnded: runs.runEnded,
    pane: { title, memory, focus, onGoToDeclaration: useDeclarations(input), fileOfScope: (scopes) => scopeFileName(input.files(), scopes) },
    button: { state, onToggle: () => (waveform.state.open ? waveform.close() : open()) },
    links: state === 'empty' ? {} : { onOpenTime: openAt, onOpenWaveform: open },
    dialog: { open: dialogOpen, afterBoardRun: waveform.state.boardRun, onClose: () => setDialogOpen(false) },
  };
}
