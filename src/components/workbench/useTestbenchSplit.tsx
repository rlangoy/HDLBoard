// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import { useCallback, useEffect, useMemo, useRef, useState, type Dispatch, type ReactNode, type SetStateAction } from 'react';
import type { PaneRun } from './EditorPaneHeader';
import { paneOf, pairKey, resolveView, showsSuggestion, type EditorView, type PairEvent, type PaneRole } from './editorView';
import type { VhdlFile } from './files';
import { testbenchesFor, withPair, withRole, withoutFile, type TestbenchChoice } from './splitModel';
import { editorPropsFor, otherPane, paneFile, type EditorDisplay, type EditorSplitProps } from './splitPaneModels';
import { effectiveFile, findPair } from './tbDetect';
import { EMPTY_OVERRIDES, type EditorPair, type FileAnalysis, type PaneTarget, type ProjectAnalysis, type TestbenchOverrides } from './tbDetect/types';
import { TestbenchSuggestion } from './TestbenchSuggestion';
import { useEditorSplit, type EditorSplit } from './useEditorSplit';
import { nextRevealId, type RevealRequest } from './useRevealLine';
import { useTestbenchAnalysis } from './useTestbenchAnalysis';

export interface TestbenchSplitOptions {
  files: readonly VhdlFile[];
  activeTabId: string | null;
  setActiveTabId: (id: string | null) => void;
  setOpenTabs: Dispatch<SetStateAction<string[]>>;
  /** A diagnostic or console reveal; shown in the pane that shows its file. */
  reveal: RevealRequest | null;
  /** The run control a pane header shows, or null for none. */
  paneRun: (pane: PaneRole, target: PaneTarget) => PaneRun | null;
  /** "Create testbench" in the TB pane's empty state, for this design file. */
  onCreateTestbench: (designFileId: string) => void;
}

export interface ShowOptions {
  /** The pane to focus; default: the pane showing the file. */
  readonly pane?: PaneRole;
  /** In a file shown in both panes, the unit that decides the pane. */
  readonly unitName?: string | null;
}

export interface TestbenchSplit {
  readonly split: EditorSplit;
  /** Role and pair overrides, for the desktop workspace. */
  readonly overrides: TestbenchOverrides;
  readonly restoreOverrides: (overrides: TestbenchOverrides) => void;
  /** Pair a design with a testbench without re-pairing now: the file may not be in state yet. */
  readonly setPairOverride: (designId: string, tbId: string) => void;
  /** A file's analysis, up to date and with its role override applied. */
  readonly fileAnalysis: (fileId: string) => FileAnalysis | undefined;
  /** The testbench units that could run this design unit instead of the board (§ 4.10). */
  readonly testbenchesFor: (fileId: string, unitName: string | null) => TestbenchChoice[];
  /** The one place the layout is decided (D7). */
  readonly showFile: (fileId: string, event: PairEvent, options?: ShowOptions) => void;
  readonly focusPane: (pane: PaneRole) => void;
  readonly onTabClosing: (id: string) => void;
  readonly onFileDeleted: (id: string) => void;
  /** Props for CodeEditor: the split, partner tab, role icons, chip and view switch. */
  readonly editorProps: EditorSplitProps;
}

/**
 * The testbench split's state and events (docs/impl_split_screen.md § 4.3, § 6.6):
 * pairing, view resolution, pins, overrides and the region navigator.
 * splitPaneModels.tsx turns the state into CodeEditor's props. Workbench owns the
 * files and the runs; this owns the layout.
 */
export function useTestbenchSplit(options: TestbenchSplitOptions): TestbenchSplit {
  const { files, activeTabId, setActiveTabId, setOpenTabs } = options;
  const analysis = useTestbenchAnalysis(files);
  const overrides = useOverrides();
  const [display, setDisplay] = useState<EditorDisplay | null>(null);
  const displayRef = useRef(display);
  displayRef.current = display;
  const pins = useRef(new Map<string, EditorView>());
  const recentFileIds = useRef<string[]>([]);
  const split = useEditorSplit({ onCollapse: (pane) => pinView(otherPane(pane)), onCollapseByKeyboard: focusViewSwitch });
  const preferenceRef = useRef(split.prefs.preference);
  preferenceRef.current = split.prefs.preference;

  const showFile = useCallback(
    (fileId: string, event: PairEvent, opts: ShowOptions = {}) => {
      const pair = findPair(fileId, analysis.flush(), overrides.ref.current, recentFileIds.current);
      const view = resolveView(pair, preferenceRef.current, pins.current.get(pairKey(pair)), event);
      recentFileIds.current = [fileId, ...recentFileIds.current.filter((id) => id !== fileId)];
      const focusedPane = opts.pane ?? (view === 'both' ? paneOf(pair, fileId, opts.unitName) : view);
      const next = { pair, view, focusedPane, regionIndex: 0, reveals: initialReveals(pair, view, focusedPane) };
      setOpenTabs(withShownTabs(next));
      setActiveTabId(paneFile(next, focusedPane) ?? fileId);
      setDisplay(next);
    },
    [analysis, overrides.ref, setActiveTabId, setOpenTabs],
  );
  useFollowActiveFile(activeTabId, files, displayRef, setDisplay, showFile);

  function pinView(view: EditorView) {
    const d = displayRef.current;
    if (!d) return;
    pins.current.set(pairKey(d.pair), view);
    const focusedPane = view === 'both' ? d.focusedPane : view;
    const reveals = view === 'both' ? initialReveals(d.pair, view, null) : d.reveals;
    const next = { ...d, view, focusedPane, reveals };
    setOpenTabs(withShownTabs(next));
    setDisplay(next);
    const file = paneFile(next, focusedPane);
    if (file) setActiveTabId(file);
  }

  const focusPane = (pane: PaneRole) => {
    const d = displayRef.current;
    if (!d) return;
    const file = paneFile(d, pane);
    if (d.focusedPane !== pane) setDisplay({ ...d, focusedPane: pane });
    if (file && file !== activeTabId) setActiveTabId(file);
  };

  /** D14 b: closing the partner's tab collapses the split to the other pane, for the session. */
  const onTabClosing = (id: string) => {
    const d = displayRef.current;
    if (!d || d.view !== 'both' || id === activeTabId) return;
    const pane = paneShowing(d, id);
    const isPartnerOnly = paneFile(d, pane) === id && paneFile(d, otherPane(pane)) !== id;
    if (isPartnerOnly) pinView(otherPane(pane));
  };

  const changeOverrides = (next: TestbenchOverrides) => {
    overrides.set(next);
    const anchor = displayRef.current?.pair.anchorId ?? activeTabId;
    if (anchor) showFile(anchor, 'open');
  };

  const stepRegion = (step: 1 | -1) => {
    const d = displayRef.current;
    const tb = d?.pair.tb;
    const regions = tb ? effectiveFile(analysis.current, overrides.ref.current, tb.fileId)?.regions ?? [] : [];
    if (!d || !tb || regions.length === 0) return;
    const index = (d.regionIndex + step + regions.length) % regions.length;
    const reveal = { fileId: tb.fileId, line: regions[index].span.start, id: nextRevealId() };
    setDisplay({ ...d, regionIndex: index, focusedPane: 'tb', reveals: { ...d.reveals, tb: reveal } });
  };
  useRegionKeys(display, stepRegion);

  const chip = useSuggestionChip(display, analysis.current, overrides.value, split, pins.current, recentFileIds.current, files, (pair) => {
    pins.current.set(pairKey(pair), 'both');
    showFile(pair.anchorId, 'open');
  });

  const editorProps = editorPropsFor(
    {
      project: analysis.current,
      overrides: overrides.value,
      files,
      display,
      reveal: options.reveal,
      paneRun: options.paneRun,
      onSetRole: (fileId, role) => changeOverrides(withRole(overrides.ref.current, fileId, role)),
      onPair: (designId, tbId) => changeOverrides(withPair(overrides.ref.current, designId, tbId)),
      onStepRegion: stepRegion,
      onPin: pinView,
      onFocusPane: focusPane,
      onCreateTestbench: options.onCreateTestbench,
    },
    split,
    chip,
  );

  return {
    split,
    overrides: overrides.value,
    restoreOverrides: overrides.set,
    setPairOverride: (designId, tbId) => overrides.set(withPair(overrides.ref.current, designId, tbId)),
    fileAnalysis: (fileId) => effectiveFile(analysis.flush(), overrides.ref.current, fileId),
    testbenchesFor: (fileId, unitName) =>
      testbenchesFor(analysis.flush(), overrides.ref.current, fileId, unitName, recentFileIds.current),
    showFile,
    focusPane,
    onTabClosing,
    onFileDeleted: (id) => overrides.set(withoutFile(overrides.ref.current, id)),
    editorProps,
  };
}

/** Overrides as state, mirrored in a ref so event handlers read the newest without waiting for a render. */
function useOverrides() {
  const [value, setValue] = useState<TestbenchOverrides>(EMPTY_OVERRIDES);
  const ref = useRef(value);
  const set = useCallback((next: TestbenchOverrides) => {
    ref.current = next;
    setValue(next);
  }, []);
  return { value, ref, set };
}

const shownFileIds = (d: EditorDisplay): string[] => {
  const tb = d.view === 'rtl' ? undefined : d.pair.tb?.fileId;
  const rtl = d.view === 'tb' ? undefined : d.pair.rtl?.fileId;
  return [tb, rtl].filter((id): id is string => id !== undefined);
};

/** The open tabs with the shown files added: a partner joins the tab strip (§ 4.3). */
const withShownTabs = (d: EditorDisplay) => (prev: string[]): string[] => [
  ...prev,
  ...[...new Set(shownFileIds(d))].filter((id) => !prev.includes(id)),
];

/** The shown pane that shows `fileId`, the focused one first. */
function paneShowing(d: EditorDisplay, fileId: string): PaneRole {
  if (paneFile(d, d.focusedPane) === fileId) return d.focusedPane;
  return otherPane(d.focusedPane);
}

/** The divider is gone: focus the view switch's checked radio, as usePaneLayout's handOffFocus does (§ 4.8). */
function focusViewSwitch() {
  window.setTimeout(() => document.querySelector<HTMLElement>('.wb-viewswitch [aria-checked="true"]')?.focus());
}

/**
 * Where each pane opens (§ 5.6): the TB pane at its first region, the RTL pane at
 * its unit. Only `focused` takes the caret; null scrolls both without moving it.
 */
function initialReveals(pair: EditorPair, view: EditorView, focused: PaneRole | null): EditorDisplay['reveals'] {
  const make = (pane: PaneRole): RevealRequest | null => {
    const target = pair[pane];
    const shown = view === 'both' || view === pane;
    // A single design pane keeps the behaviour of before the split: the caret stays where it was.
    const plainDesign = view === 'rtl' && !pair.tb;
    if (!target || !shown || plainDesign) return null;
    return { fileId: target.fileId, line: target.line, id: nextRevealId(), focus: pane === focused };
  };
  return { tb: make('tb'), rtl: make('rtl') };
}

/**
 * Every other way the active file changes (a tab closed, a file created, a
 * diagnostic revealed, the workspace restored) is a pair-change event too.
 */
function useFollowActiveFile(
  activeTabId: string | null,
  files: readonly VhdlFile[],
  displayRef: { readonly current: EditorDisplay | null },
  setDisplay: (d: EditorDisplay | null) => void,
  showFile: (fileId: string, event: PairEvent) => void,
) {
  const showFileRef = useRef(showFile);
  showFileRef.current = showFile;
  useEffect(() => {
    const d = displayRef.current;
    if (activeTabId === null) {
      if (d) setDisplay(null);
      return;
    }
    const exists = (id: string | undefined) => id === undefined || files.some((f) => f.id === id);
    const stale = !d || !exists(d.pair.tb?.fileId) || !exists(d.pair.rtl?.fileId);
    if (stale || !shownFileIds(d).includes(activeTabId)) showFileRef.current(activeTabId, 'open');
    else if (paneFile(d, d.focusedPane) !== activeTabId) setDisplay({ ...d, focusedPane: paneShowing(d, activeTabId) });
  }, [activeTabId, files, displayRef, setDisplay]);
}

/** Alt+PageDown / Alt+PageUp: next / previous testbench region, from either pane (§ 4.11). */
function useRegionKeys(display: EditorDisplay | null, step: (s: 1 | -1) => void) {
  const stepRef = useRef(step);
  stepRef.current = step;
  const active = display !== null && display.pair.tb !== null && display.view !== 'rtl';
  useEffect(() => {
    if (!active) return undefined;
    const onKeyDown = (e: KeyboardEvent) => {
      const isRegionKey = e.altKey && !e.ctrlKey && !e.metaKey && (e.code === 'PageDown' || e.code === 'PageUp');
      if (!isRegionKey) return;
      e.preventDefault();
      stepRef.current(e.code === 'PageDown' ? 1 : -1);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [active]);
}

/**
 * § 4.7's chip, from the current analysis: testbench code the layout did not
 * open for. Dismissed per pair for the session.
 */
function useSuggestionChip(
  display: EditorDisplay | null,
  project: ProjectAnalysis,
  overrides: TestbenchOverrides,
  split: EditorSplit,
  pins: ReadonlyMap<string, EditorView>,
  recentFileIds: readonly string[],
  files: readonly VhdlFile[],
  onOpen: (pair: EditorPair) => void,
): ReactNode {
  const [dismissed, setDismissed] = useState<ReadonlySet<string>>(new Set());
  const livePair = useMemo(
    () => (display ? findPair(display.pair.anchorId, project, overrides, recentFileIds) : null),
    [display, project, overrides, recentFileIds],
  );
  if (!display || !livePair?.tb) return null;
  const key = pairKey(display.pair);
  if (!showsSuggestion(livePair, split.prefs.preference, pins.get(key), display.view, dismissed.has(key))) return null;
  return (
    <TestbenchSuggestion
      fileName={files.find((f) => f.id === livePair.tb?.fileId)?.name ?? ''}
      onOpen={() => onOpen(livePair)}
      onDismiss={() => setDismissed(new Set([...dismissed, key]))}
    />
  );
}
