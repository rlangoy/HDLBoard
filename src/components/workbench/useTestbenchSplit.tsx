// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { PaneRun } from './EditorPaneHeader';
import { narrowView, paneOf, pairKey, resolveView, showsSuggestion, type EditorView, type PairEvent, type PaneRole } from './editorView';
import type { VhdlFile } from './files';
import { roleConflict, testbenchesFor, withPair, withRole, withoutContradictedPairs, withoutFile, type TestbenchChoice } from './splitModel';
import { RoleConflictDialog } from './RoleConflictDialog';
import type { FileMenuProps } from './FileMenu';
import type { SplitEditorProps } from './SplitEditor';
import { editorPropsFor, otherPane, paneFile, type EditorDisplay } from './splitPaneModels';
import { effectiveFile, findPair } from './tbDetect';
import { EMPTY_OVERRIDES, type EditorPair, type FileAnalysis, type FileRole, type PaneTarget, type ProjectAnalysis, type TestbenchOverrides, type UnitRole } from './tbDetect/types';
import { TestbenchSuggestion } from './TestbenchSuggestion';
import { useEditorSplit, type EditorSplit } from './useEditorSplit';
import { nextRevealId, type RevealRequest } from './useRevealLine';
import { useTestbenchAnalysis } from './useTestbenchAnalysis';

export interface TestbenchSplitOptions {
  files: readonly VhdlFile[];
  /** The file in the focused pane. */
  activeFileId: string | null;
  setActiveFileId: (id: string | null) => void;
  /** A diagnostic or console reveal; shown in the pane that shows its file. */
  reveal: RevealRequest | null;
  /** The run control a pane header shows, or null for none. */
  paneRun: (pane: PaneRole, target: PaneTarget) => PaneRun | null;
  /** "Create testbench" in the TB pane's empty state, for this design file. */
  onCreateTestbench: (designFileId: string) => void;
  /** The layout was decided: a file shown, or a view picked from a role badge. */
  onViewChosen?: (view: EditorView) => void;
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
  /** The files in the editor's panes now, as the panes show them. */
  readonly shownFileIds: readonly string[];
  /** A file's role from the current analysis, with its override applied; for the file lists. */
  readonly roleOf: (fileId: string) => FileRole | undefined;
  /** A file's analysis, up to date and with its role override applied. */
  readonly fileAnalysis: (fileId: string) => FileAnalysis | undefined;
  /** The testbench units that could run this design unit instead of the board (§ 4.10). */
  readonly testbenchesFor: (fileId: string, unitName: string | null) => TestbenchChoice[];
  /** The one place the layout is decided (D7). */
  readonly showFile: (fileId: string, event: PairEvent, options?: ShowOptions) => void;
  readonly focusPane: (pane: PaneRole) => void;
  readonly onFileDeleted: (id: string) => void;
  /** CodeEditor's panes, with their headers and the chip; none while nothing is shown. */
  readonly editorSplit: (fileMenu: FileMenuProps) => SplitEditorProps | undefined;
  /** The question asked when a role change would put two designs or two testbenches side by side; null otherwise. */
  readonly roleConflictDialog: ReactNode;
}

/** A role change waiting on RoleConflictDialog. */
interface PendingRoleChange {
  readonly fileId: string;
  readonly otherFileId: string;
  readonly role: UnitRole;
  readonly next: TestbenchOverrides;
}

/**
 * The testbench split's state and events (docs/impl_split_screen.md § 4.3, § 6.6):
 * pairing, view resolution, pins, overrides and the region navigator.
 * splitPaneModels.tsx turns the state into CodeEditor's props. Workbench owns the
 * files and the runs; this owns the layout.
 */
export function useTestbenchSplit(options: TestbenchSplitOptions): TestbenchSplit {
  const { files, activeFileId, setActiveFileId } = options;
  const onViewChosen = useRef(options.onViewChosen);
  onViewChosen.current = options.onViewChosen;
  const analysis = useTestbenchAnalysis(files);
  const overrides = useOverrides();
  usePruneContradictedPairs(analysis.current, overrides);
  const [display, setDisplay] = useState<EditorDisplay | null>(null);
  const [pendingRole, setPendingRole] = useState<PendingRoleChange | null>(null);
  const displayRef = useRef(display);
  displayRef.current = display;
  const pins = useRef(new Map<string, EditorView>());
  const recentFileIds = useRef<string[]>([]);
  const split = useEditorSplit({ onCollapse: (pane) => pinView(otherPane(pane)), onCollapseByKeyboard: focusRoleBadge });
  const preferenceRef = useRef(split.prefs.preference);
  preferenceRef.current = split.prefs.preference;

  const showFile = useCallback(
    (fileId: string, event: PairEvent, opts: ShowOptions = {}) => {
      const pair = findPair(fileId, analysis.flush(), overrides.ref.current, recentFileIds.current);
      const view = resolveView(pair, preferenceRef.current, pins.current.get(pairKey(pair)), event);
      recentFileIds.current = [fileId, ...recentFileIds.current.filter((id) => id !== fileId)];
      const focusedPane = opts.pane ?? (view === 'both' ? paneOf(pair, fileId, opts.unitName) : view);
      const next = { pair, view, focusedPane, regionIndex: 0, reveals: initialReveals(pair, view, focusedPane) };
      setActiveFileId(paneFile(next, focusedPane) ?? fileId);
      setDisplay(next);
      onViewChosen.current?.(view);
    },
    [analysis, overrides.ref, setActiveFileId],
  );
  useFollowActiveFile(activeFileId, files, displayRef, setDisplay, showFile);

  function pinView(view: EditorView) {
    const d = displayRef.current;
    if (!d) return;
    pins.current.set(pairKey(d.pair), view);
    const focusedPane = view === 'both' ? d.focusedPane : view;
    const reveals = view === 'both' ? initialReveals(d.pair, view, null) : d.reveals;
    const next = { ...d, view, focusedPane, reveals };
    setDisplay(next);
    const file = paneFile(next, focusedPane);
    if (file) setActiveFileId(file);
    onViewChosen.current?.(view);
  }

  /** The badge's *Use the setting*: forget the pair's pin and lay it out again (docs/impl_search.md D19). */
  function followSetting() {
    const d = displayRef.current;
    if (!d) return;
    pins.current.delete(pairKey(d.pair));
    showFile(d.pair.anchorId, 'open', { pane: d.focusedPane });
  }

  const focusPane = (pane: PaneRole) => {
    const d = displayRef.current;
    if (!d) return;
    const file = paneFile(d, pane);
    if (d.focusedPane !== pane) setDisplay({ ...d, focusedPane: pane });
    if (file && file !== activeFileId) setActiveFileId(file);
  };

  /** New overrides, laid out again around `anchorId` (default: the shown pair's anchor). */
  const changeOverrides = (next: TestbenchOverrides, anchorId?: string) => {
    overrides.set(next);
    const anchor = anchorId ?? displayRef.current?.pair.anchorId ?? activeFileId;
    if (anchor) showFile(anchor, 'open');
  };

  /**
   * A badge menu's role change. Two designs or two testbenches never sit side by
   * side: if the change would do that, ask which file stays (RoleConflictDialog).
   * Otherwise the layout follows the reclassified file, in the pane of its new role.
   */
  const setRole = (fileId: string, role: UnitRole | undefined) => {
    const next = withRole(overrides.ref.current, fileId, role);
    const d = displayRef.current;
    const conflict = d && roleConflict(analysis.flush(), next, d.pair, narrowView(d.view, d.focusedPane, split.canSplit), fileId);
    if (conflict) setPendingRole({ fileId, ...conflict, next });
    else changeOverrides(next, fileId);
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
  useSplitToggleKey(display, split.canSplit, pinView);

  const chip = useSuggestionChip(display, analysis.current, overrides.value, split, pins.current, recentFileIds.current, files, (pair) => {
    pins.current.set(pairKey(pair), 'both');
    showFile(pair.anchorId, 'open');
  });

  const editorSplit = (fileMenu: FileMenuProps) => editorPropsFor(
    {
      project: analysis.current,
      overrides: overrides.value,
      files,
      display,
      reveal: options.reveal,
      paneRun: options.paneRun,
      onSetRole: setRole,
      onPair: (designId, tbId) => changeOverrides(withPair(overrides.ref.current, designId, tbId)),
      onStepRegion: stepRegion,
      onPin: pinView,
      pinned: display ? pins.current.get(pairKey(display.pair)) : undefined,
      onUseSetting: followSetting,
      onFocusPane: focusPane,
      onCreateTestbench: options.onCreateTestbench,
      fileMenu,
    },
    split,
    chip,
  );

  return {
    split,
    overrides: overrides.value,
    restoreOverrides: overrides.set,
    shownFileIds: display ? shownFileIds(display, narrowView(display.view, display.focusedPane, split.canSplit)) : [],
    roleOf: (fileId) => effectiveFile(analysis.current, overrides.value, fileId)?.role,
    setPairOverride: (designId, tbId) => overrides.set(withPair(overrides.ref.current, designId, tbId)),
    fileAnalysis: (fileId) => effectiveFile(analysis.flush(), overrides.ref.current, fileId),
    testbenchesFor: (fileId, unitName) =>
      testbenchesFor(analysis.flush(), overrides.ref.current, fileId, unitName, recentFileIds.current),
    showFile,
    focusPane,
    onFileDeleted: (id) => overrides.set(withoutFile(overrides.ref.current, id)),
    editorSplit,
    roleConflictDialog: pendingRole && (
      <RoleConflictDialog
        fileName={files.find((f) => f.id === pendingRole.fileId)?.name ?? ''}
        otherName={files.find((f) => f.id === pendingRole.otherFileId)?.name ?? ''}
        role={pendingRole.role}
        onKeep={(which) => {
          setPendingRole(null);
          changeOverrides(pendingRole.next, which === 'file' ? pendingRole.fileId : pendingRole.otherFileId);
        }}
        onCancel={() => setPendingRole(null)}
      />
    ),
  };
}

/**
 * Drops stored pairings the code rules out whenever the analysis or the overrides
 * change: at startup (a workspace restored from an older session) and after edits.
 */
function usePruneContradictedPairs(project: ProjectAnalysis, overrides: ReturnType<typeof useOverrides>) {
  const { value, set } = overrides;
  useEffect(() => {
    const pruned = withoutContradictedPairs(project, value);
    if (pruned !== value) set(pruned);
  }, [project, value, set]);
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

const shownFileIds = (d: EditorDisplay, view: EditorView = d.view): string[] => {
  const tb = view === 'rtl' ? undefined : d.pair.tb?.fileId;
  const rtl = view === 'tb' ? undefined : d.pair.rtl?.fileId;
  return [tb, rtl].filter((id): id is string => id !== undefined);
};

/** The shown pane that shows `fileId`, the focused one first. */
function paneShowing(d: EditorDisplay, fileId: string): PaneRole {
  if (paneFile(d, d.focusedPane) === fileId) return d.focusedPane;
  return otherPane(d.focusedPane);
}

/** The divider is gone: focus the remaining pane's role badge, as usePaneLayout's handOffFocus does (docs/impl_search.md D21). */
function focusRoleBadge() {
  window.setTimeout(() => document.querySelector<HTMLElement>('.wb-split__pane:not(.is-drag-hidden) .wb-rolebadge')?.focus());
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
 * Every other way the active file changes (a file created or deleted, a
 * diagnostic revealed, the workspace restored) is a pair-change event too.
 */
function useFollowActiveFile(
  activeFileId: string | null,
  files: readonly VhdlFile[],
  displayRef: { readonly current: EditorDisplay | null },
  setDisplay: (d: EditorDisplay | null) => void,
  showFile: (fileId: string, event: PairEvent) => void,
) {
  const showFileRef = useRef(showFile);
  showFileRef.current = showFile;
  useEffect(() => {
    const d = displayRef.current;
    if (activeFileId === null) {
      if (d) setDisplay(null);
      return;
    }
    const exists = (id: string | undefined) => id === undefined || files.some((f) => f.id === id);
    const stale = !d || !exists(d.pair.tb?.fileId) || !exists(d.pair.rtl?.fileId);
    if (stale || !shownFileIds(d).includes(activeFileId)) showFileRef.current(activeFileId, 'open');
    else if (paneFile(d, d.focusedPane) !== activeFileId) setDisplay({ ...d, focusedPane: paneShowing(d, activeFileId) });
  }, [activeFileId, files, displayRef, setDisplay]);
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
 * Alt+Shift+B (docs/impl_search.md D21): the pane with the text cursor alone, or
 * the other side beside it. Takes the view switch's keyboard access.
 */
function useSplitToggleKey(display: EditorDisplay | null, canSplit: boolean, pin: (view: EditorView) => void) {
  const latest = useRef({ display, canSplit, pin });
  latest.current = { display, canSplit, pin };
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (!e.altKey || !e.shiftKey || e.ctrlKey || e.metaKey || e.code !== 'KeyB') return;
      const { display: d, canSplit: splittable, pin: pinTo } = latest.current;
      if (!d) return;
      e.preventDefault();
      const shown = narrowView(d.view, d.focusedPane, splittable);
      if (shown === 'both') pinTo(d.focusedPane);
      else if (splittable) pinTo('both');
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);
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
