// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import { useCallback, useEffect, useMemo, useRef, useState, type Dispatch, type ReactNode, type SetStateAction } from 'react';
import type { CodeEditorProps } from './CodeEditor';
import type { PaneRun } from './EditorPaneHeader';
import { paneOf, pairKey, resolveView, showsSuggestion, type EditorView, type PairEvent, type PaneRole } from './editorView';
import type { VhdlFile } from './files';
import { RoleIcon } from './RoleIcon';
import { pairOptions, unitOf, withPair, withRole, withoutFile } from './splitModel';
import type { SplitEditorProps, SplitPaneModel } from './SplitEditor';
import { effectiveFile, findPair } from './tbDetect';
import { EMPTY_OVERRIDES, type EditorPair, type PaneTarget, type ProjectAnalysis, type TestbenchOverrides, type UnitRole } from './tbDetect/types';
import { TestbenchSuggestion } from './TestbenchSuggestion';
import { TEXT, noTestbenchFor, notInProject } from './testbenchText';
import { useEditorSplit, type EditorSplit } from './useEditorSplit';
import { nextRevealId, type RevealRequest } from './useRevealLine';
import { useTestbenchAnalysis, type TestbenchAnalysis } from './useTestbenchAnalysis';
import { ViewSwitch } from './ViewSwitch';

/** What the editor column shows: one pair, how, and which pane has focus (§ 6.6). */
export interface EditorDisplay {
  readonly pair: EditorPair;
  readonly view: EditorView;
  readonly focusedPane: PaneRole;
  /** The TB pane's region, 0-based; session only (D18). */
  readonly regionIndex: number;
  readonly reveals: Readonly<Record<PaneRole, RevealRequest | null>>;
}

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
  readonly analysis: TestbenchAnalysis;
  readonly split: EditorSplit;
  readonly display: EditorDisplay | null;
  readonly overrides: TestbenchOverrides;
  readonly overridesRef: { readonly current: TestbenchOverrides };
  readonly restoreOverrides: (overrides: TestbenchOverrides) => void;
  readonly setOverrides: (overrides: TestbenchOverrides) => void;
  /** Pair a design with a testbench without re-pairing now: the file may not be in state yet. */
  readonly setPairOverride: (designId: string, tbId: string) => void;
  readonly recentFileIds: { readonly current: readonly string[] };
  /** The one place the layout is decided (D7). */
  readonly showFile: (fileId: string, event: PairEvent, options?: ShowOptions) => void;
  readonly focusPane: (pane: PaneRole) => void;
  readonly onTabClosing: (id: string) => void;
  readonly onFileDeleted: (id: string) => void;
  /** Props for CodeEditor: the split, partner tab, role icons, chip and view switch. */
  readonly editorProps: Pick<CodeEditorProps, 'split' | 'visibleTabId' | 'tabIcon' | 'stripEnd'>;
}

const shownFileIds = (d: EditorDisplay): string[] =>
  [d.view !== 'rtl' ? d.pair.tb?.fileId : undefined, d.view !== 'tb' ? d.pair.rtl?.fileId : undefined].filter((id): id is string => !!id);

/**
 * The testbench split's state and events (docs/impl_split_screen.md § 4.3, § 6.6):
 * analysis, pairing, view resolution, pins, overrides, the suggestion chip and the
 * region navigator. Workbench owns the files and the runs; this owns the layout.
 */
export function useTestbenchSplit(options: TestbenchSplitOptions): TestbenchSplit {
  const { files, activeTabId, setActiveTabId, setOpenTabs } = options;
  const analysis = useTestbenchAnalysis(files);
  const [overrides, setOverridesState] = useState<TestbenchOverrides>(EMPTY_OVERRIDES);
  const overridesRef = useRef(overrides);
  const [display, setDisplay] = useState<EditorDisplay | null>(null);
  const displayRef = useRef(display);
  displayRef.current = display;
  const pins = useRef(new Map<string, EditorView>());
  const dismissed = useRef(new Set<string>());
  const recentFileIds = useRef<string[]>([]);
  const [, rerender] = useState(0);
  const split = useEditorSplit({
    onCollapse: (pane, fromKeyboard) => {
      pinView(pane === 'tb' ? 'rtl' : 'tb');
      // The divider is gone: focus the view switch's checked radio, as usePaneLayout's handOffFocus does.
      if (fromKeyboard) window.setTimeout(() => document.querySelector<HTMLElement>('.wb-viewswitch [aria-checked="true"]')?.focus());
    },
  });
  const preferenceRef = useRef(split.prefs.preference);
  preferenceRef.current = split.prefs.preference;

  const setOverrides = (next: TestbenchOverrides) => {
    overridesRef.current = next;
    setOverridesState(next);
  };

  const showFile = useCallback(
    (fileId: string, event: PairEvent, opts: ShowOptions = {}) => {
      const project = analysis.flush();
      const pair = findPair(fileId, project, overridesRef.current, recentFileIds.current);
      const view = resolveView(pair, preferenceRef.current, pins.current.get(pairKey(pair)), event);
      recentFileIds.current = [fileId, ...recentFileIds.current.filter((id) => id !== fileId)];
      const focusedPane = opts.pane ?? (view === 'both' ? paneOf(pair, fileId, opts.unitName) : view);
      const next = { pair, view, focusedPane, regionIndex: 0, reveals: initialReveals(pair, view, focusedPane) };
      const shown = shownFileIds(next);
      setOpenTabs((prev) => [...prev, ...shown.filter((id) => !prev.includes(id))].filter((id, i, all) => all.indexOf(id) === i));
      setActiveTabId(paneFile(next, focusedPane) ?? fileId);
      setDisplay(next);
    },
    [analysis, setActiveTabId, setOpenTabs],
  );

  const showFileRef = useRef(showFile);
  showFileRef.current = showFile;

  // Every other way the active file changes (a tab closed, a file created, a diagnostic
  // revealed, the workspace restored) is a pair-change event too.
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
  }, [activeTabId, files]);

  function pinView(view: EditorView) {
    const d = displayRef.current;
    if (!d) return;
    pins.current.set(pairKey(d.pair), view);
    const focusedPane = view === 'both' ? d.focusedPane : view;
    const next = { ...d, view, focusedPane, reveals: view === 'both' ? initialReveals(d.pair, view, focusedPane, false) : d.reveals };
    setOpenTabs((prev) => [...prev, ...shownFileIds(next).filter((id) => !prev.includes(id))]);
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

  const onTabClosing = (id: string) => {
    const d = displayRef.current;
    if (!d || d.view !== 'both' || id === activeTabId) return;
    const pane = paneShowing(d, id);
    if (paneFile(d, pane) === id && paneFile(d, otherPane(pane)) !== id) pinView(otherPane(pane)); // D14 b
  };

  const changeOverrides = (next: TestbenchOverrides) => {
    setOverrides(next);
    const anchor = displayRef.current?.pair.anchorId ?? activeTabId;
    if (anchor) showFileRef.current(anchor, 'open');
  };

  const stepRegion = (step: 1 | -1) => {
    const d = displayRef.current;
    const regions = d?.pair.tb ? tbRegions(analysis.current, overridesRef.current, d.pair.tb) : [];
    if (!d?.pair.tb || regions.length === 0) return;
    const index = (d.regionIndex + step + regions.length) % regions.length;
    const reveal = { fileId: d.pair.tb.fileId, line: regions[index].span.start, id: nextRevealId() };
    setDisplay({ ...d, regionIndex: index, focusedPane: 'tb', reveals: { ...d.reveals, tb: reveal } });
  };
  useRegionKeys(display, stepRegion);

  const revealIn = (pane: PaneRole, line: number) => {
    const d = displayRef.current;
    const fileId = d && paneFile(d, pane);
    if (!d || !fileId) return;
    setDisplay({ ...d, focusedPane: pane, reveals: { ...d.reveals, [pane]: { fileId, line, id: nextRevealId() } } });
  };

  const ctx: ModelContext = {
    project: analysis.current,
    overrides,
    files,
    display,
    reveal: options.reveal,
    paneRun: options.paneRun,
    onSetRole: (fileId, role) => changeOverrides(withRole(overridesRef.current, fileId, role)),
    onPair: (designId, tbId) => changeOverrides(withPair(overridesRef.current, designId, tbId)),
    onStep: stepRegion,
    onReveal: revealIn,
    onPin: pinView,
    onCreateTestbench: options.onCreateTestbench,
  };

  const livePair = useMemo(
    () => (display ? findPair(display.pair.anchorId, analysis.current, overrides, recentFileIds.current) : null),
    [display, analysis.current, overrides],
  );
  const chipKey = display ? pairKey(display.pair) : '';
  const chip =
    display &&
    livePair &&
    livePair.tb &&
    showsSuggestion(livePair, split.prefs.preference, pins.current.get(chipKey), display.view, dismissed.current.has(chipKey)) ? (
      <TestbenchSuggestion
        fileName={files.find((f) => f.id === livePair.tb?.fileId)?.name ?? ''}
        onOpen={() => {
          pins.current.set(pairKey(livePair), 'both');
          showFile(livePair.anchorId, 'open');
        }}
        onDismiss={() => {
          dismissed.current.add(chipKey);
          rerender((n) => n + 1);
        }}
      />
    ) : null;

  const editorProps = buildEditorProps(ctx, split, chip, focusPane);

  return {
    analysis,
    split,
    display,
    overrides,
    overridesRef,
    restoreOverrides: setOverrides,
    setOverrides: changeOverrides,
    setPairOverride: (designId, tbId) => setOverrides(withPair(overridesRef.current, designId, tbId)),
    recentFileIds,
    showFile,
    focusPane,
    onTabClosing,
    onFileDeleted: (id) => setOverrides(withoutFile(overridesRef.current, id)),
    editorProps,
  };
}

const otherPane = (pane: PaneRole): PaneRole => (pane === 'tb' ? 'rtl' : 'tb');
const paneFile = (d: EditorDisplay, pane: PaneRole): string | undefined => d.pair[pane]?.fileId;

/** The shown pane that shows `fileId`, the focused one first. */
function paneShowing(d: EditorDisplay, fileId: string): PaneRole {
  if (paneFile(d, d.focusedPane) === fileId) return d.focusedPane;
  return otherPane(d.focusedPane);
}

/** Where each pane opens (§ 5.6): the TB pane at its first region, the RTL pane at its unit. */
function initialReveals(pair: EditorPair, view: EditorView, focused: PaneRole, focus = true): EditorDisplay['reveals'] {
  const make = (pane: PaneRole): RevealRequest | null => {
    const target = pair[pane];
    const shown = view === 'both' || view === pane;
    // A single design pane keeps today's behaviour: the caret stays where the student left it.
    if (!target || !shown || (view === 'rtl' && !pair.tb)) return null;
    return { fileId: target.fileId, line: target.line, id: nextRevealId(), focus: focus && pane === focused };
  };
  return { tb: make('tb'), rtl: make('rtl') };
}

function tbRegions(project: ProjectAnalysis, overrides: TestbenchOverrides, tb: PaneTarget) {
  const file = effectiveFile(project, overrides, tb.fileId);
  return file?.regions ?? [];
}

/** Alt+PageDown / Alt+PageUp: next / previous testbench region, from either pane (§ 4.11). */
function useRegionKeys(display: EditorDisplay | null, step: (s: 1 | -1) => void) {
  const stepRef = useRef(step);
  stepRef.current = step;
  const active = display !== null && display.pair.tb !== null && display.view !== 'rtl';
  useEffect(() => {
    if (!active) return undefined;
    const onKeyDown = (e: KeyboardEvent) => {
      if (!e.altKey || e.ctrlKey || e.metaKey || (e.code !== 'PageDown' && e.code !== 'PageUp')) return;
      e.preventDefault();
      stepRef.current(e.code === 'PageDown' ? 1 : -1);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [active]);
}

interface ModelContext {
  readonly project: ProjectAnalysis;
  readonly overrides: TestbenchOverrides;
  readonly files: readonly VhdlFile[];
  readonly display: EditorDisplay | null;
  readonly reveal: RevealRequest | null;
  readonly paneRun: (pane: PaneRole, target: PaneTarget) => PaneRun | null;
  readonly onSetRole: (fileId: string, role: UnitRole | undefined) => void;
  readonly onPair: (designId: string, tbId: string) => void;
  readonly onStep: (step: 1 | -1) => void;
  readonly onReveal: (pane: PaneRole, line: number) => void;
  readonly onPin: (view: EditorView) => void;
  readonly onCreateTestbench: (designFileId: string) => void;
}

function buildEditorProps(
  ctx: ModelContext,
  split: EditorSplit,
  chip: ReactNode,
  onFocusPane: (pane: PaneRole) => void,
): TestbenchSplit['editorProps'] {
  const d = ctx.display;
  const tabIcon = (id: string) => <RoleIcon role={effectiveFile(ctx.project, ctx.overrides, id)?.role} />;
  if (!d) return { tabIcon };
  const shown = d.view === 'both' && !split.canSplit ? d.focusedPane : d.view;
  const stripEnd = (
    <>
      {chip}
      <ViewSwitch view={shown} bothDisabled={!split.canSplit} onChange={ctx.onPin} />
    </>
  );
  const plainDesign = d.view === 'rtl' && !d.pair.tb && d.pair.rtl !== null;
  const visibleTabId = d.view === 'both' ? paneFile(d, otherPane(d.focusedPane)) ?? null : null;
  if (plainDesign) return { tabIcon, stripEnd, visibleTabId };
  const splitProps: SplitEditorProps = {
    view: d.view,
    focusedPane: d.focusedPane,
    onFocusPane,
    tb: paneModel(ctx, d, 'tb'),
    rtl: paneModel(ctx, d, 'rtl'),
    split,
  };
  return { tabIcon, stripEnd, visibleTabId, split: splitProps };
}

/** One pane's content: its file with header and reveal, or its empty state (§ 4.6). */
function paneModel(ctx: ModelContext, d: EditorDisplay, pane: PaneRole): SplitPaneModel {
  const target = d.pair[pane];
  const file = target && ctx.files.find((f) => f.id === target.fileId);
  if (!target || !file) return { kind: 'empty', empty: emptyModel(ctx, d, pane) };
  const unit = unitOf(ctx.project, ctx.overrides, target);
  const regions = pane === 'tb' ? effectiveFile(ctx.project, ctx.overrides, file.id)?.regions ?? [] : [];
  const regionIndex = Math.min(d.regionIndex, Math.max(0, regions.length - 1));
  const otherFile = paneFile(d, otherPane(pane));
  return {
    kind: 'file',
    file: { id: file.id, name: file.name, content: file.content },
    reveal: latestReveal(d.reveals[pane], ctx.reveal, file.id, pane === d.focusedPane || otherFile !== file.id),
    note: noTestbenchLeft(ctx, d, pane, file.id),
    header: {
      unit,
      roleOverride: ctx.overrides.roles[file.id],
      run: ctx.paneRun(pane, target),
      regions: regions.length > 0 ? { index: regionIndex, count: regions.length, label: regions[regionIndex].label, onStep: ctx.onStep } : null,
      onSetRole: (role) => ctx.onSetRole(file.id, role),
      pairOptions: pairOptions(ctx.project, ctx.overrides, file.id, pane),
      onPairWith: (other) => (pane === 'tb' ? ctx.onPair(other, file.id) : ctx.onPair(file.id, other)),
      onRevealLine: (line) => ctx.onReveal(pane, line),
    },
  };
}

/** The newer of the pane's own reveal and a diagnostic reveal of its file. */
function latestReveal(own: RevealRequest | null, diag: RevealRequest | null, fileId: string, takesDiag: boolean): RevealRequest | null {
  const candidate = diag && takesDiag && diag.fileId === fileId ? diag : null;
  if (!own) return candidate;
  return candidate && candidate.id > own.id ? candidate : own;
}

/** § 4.6: a single-file pair whose testbench code was deleted; no automatic collapse (D7). */
function noTestbenchLeft(ctx: ModelContext, d: EditorDisplay, pane: PaneRole, fileId: string): ReactNode {
  if (pane !== 'tb' || d.view !== 'both') return null;
  const file = effectiveFile(ctx.project, ctx.overrides, fileId);
  if (!file || file.units.some((u) => u.role === 'tb') || ctx.overrides.pairs[d.pair.rtl?.fileId ?? ''] === fileId) return null;
  return (
    <p className="wb-split__note" role="note">
      {TEXT.noTestbenchCodeLeft}
      <button type="button" onClick={() => ctx.onPin('rtl')}>
        {TEXT.closeSplit}
      </button>
    </p>
  );
}

function emptyModel(ctx: ModelContext, d: EditorDisplay, pane: PaneRole): Extract<SplitPaneModel, { kind: 'empty' }>['empty'] {
  const other = d.pair[otherPane(pane)];
  const otherFile = other ? ctx.files.find((f) => f.id === other.fileId) : undefined;
  const options = otherFile ? pairOptions(ctx.project, ctx.overrides, otherFile.id, otherPane(pane)) : [];
  const onShowOther = () => ctx.onPin(otherPane(pane));
  if (pane === 'tb') {
    return {
      message: noTestbenchFor(otherFile?.name ?? ''),
      onCreate: otherFile ? () => ctx.onCreateTestbench(otherFile.id) : undefined,
      pairOptions: options,
      onPairWith: (tbId) => otherFile && ctx.onPair(otherFile.id, tbId),
      onShowOther,
    };
  }
  return {
    message: d.pair.missingDut ? notInProject(d.pair.missingDut) : TEXT.noInstance,
    pairOptions: options,
    onPairWith: (designId) => otherFile && ctx.onPair(designId, otherFile.id),
    onShowOther,
  };
}


