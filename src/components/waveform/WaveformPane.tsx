// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * The waveform view, shown in the editor area in place of the testbench/RTL split view
 * (docs/waveform_viewer_spec.md § 8.6, W8). Few controls on screen (S3); the way back to
 * the code is always one click: Close, or Go to declaration. This component only puts
 * the parts together – toolbar, notes, the signal list beside the canvas, the menus –
 * and the state lives in `useWaveView`.
 */

import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent, type MutableRefObject, type ReactNode } from 'react';
import { firstError, lastReportFs } from './consoleTimes';
import { changeFrom, fineStep, type Direction } from './cursorSteps';
import { useDelayed, useElementSize } from './domHooks';
import { CLOCK_NAME, firstWindow, runEnd, type RunMoments } from './initialView';
import type { Ticks, Trace, WaveformData } from './model';
import { defaultShowAs, hasShowAs, type ShowAs } from './radix';
import { declarationOf, signalsByPath, testbenchScope, traceRows, type SignalPath } from './signalRows';
import { SignalList } from './SignalList';
import type { RowCallbacks, RowContext } from './SignalRow';
import { viewOf } from './timeAxis';
import type { Waveform } from './useWaveform';
import type { SavedViews } from './useSavedView';
import { useWaveView, type WaveFocus, type WaveView } from './useWaveView';
import type { ViewMemory } from './viewSetup';
import { WaveCanvas } from './WaveCanvas';
import { AXIS_HEIGHT, ROW_HEIGHT } from './waveDraw';
import { ColumnResizer, useNamesWidth } from './ColumnResizer';
import { CursorControls, useCursorField, useCursorShown } from './CursorTimeField';
import { ReportBand } from './figure/ReportBand';
import { CopyStatus, ReportStage } from './figure/ReportStage';
import { useViewFigures, type ReportMode, type ViewFigures } from './figure/useViewFigures';
import { timeHandlersOf } from './useTimeGestures';
import { MoreMenu, ReportMenu, SignalMenu, type MenuPlace, type MoveChoices } from './WaveMenus';
import { RowDragLayer } from './RowDragLayer';
import { useReorder, type Reorder } from './useReorder';
import { notesFor, WaveHelp, WaveNotes } from './WaveNotes';
import { WaveToolbar, type ToolbarMode } from './WaveToolbar';
import './Waveform.css';

export type { WaveFocus } from './useWaveView';
export type { ViewMemory as WaveViewMemory } from './viewSetup';

export interface WaveformPaneProps {
  readonly waveform: Waveform;
  /** The testbench the waveform is of, for the title until the waveform names it. */
  readonly title: string;
  /** The run's console lines: where its first error and last report are (FR-26). */
  readonly consoleLines: readonly string[];
  readonly memory: MutableRefObject<ViewMemory | null>;
  /** The views saved with the project (docs/imp_wave_rearange.md § 11). */
  readonly saved: SavedViews;
  readonly focus: WaveFocus | null;
  onGoToDeclaration(scopes: readonly string[], name: string): void;
  /** The file a scope's unit is in, for the section heads' tooltips. */
  fileOfScope?(scopes: readonly string[]): string | undefined;
}

const ZOOM_STEP = 2;
/** The narrowest window, in ticks of the file: 20 fs for GHDL, 20 ps for Icarus. */
const MIN_WINDOW_TICKS = 20;
const DEFAULT_FITTING_ROWS = 14;
const LOADING_NOTE_DELAY_MS = 500;
const MENU_WIDTH = 220;
const MENU_GAP = 4;

type SignalMenuState = { readonly kind: 'signal'; readonly place: MenuPlace; readonly path: SignalPath };
type Menu = { readonly kind: 'more'; readonly place: MenuPlace } | SignalMenuState;

/** What the signal list and the menus need to know and do. */
interface Signals {
  readonly selected: string | null;
  readonly showAsOf: (path: SignalPath) => ShowAs;
  readonly goTo: (path: SignalPath) => void;
  readonly on: RowCallbacks;
  readonly reorder: Reorder;
  readonly fileOfScope?: (scopes: readonly string[]) => string | undefined;
}

interface SignalsInput {
  readonly props: WaveformPaneProps;
  readonly view: WaveView;
  readonly openMenu: (menu: Menu) => void;
  /** The scrolling body, which a drag near its edge scrolls. */
  readonly body: HTMLDivElement | null;
}

function useMoments(consoleLines: readonly string[]): RunMoments {
  return useMemo(() => ({ firstError: firstError(consoleLines), lastReportFs: lastReportFs(consoleLines) }), [consoleLines]);
}

/**
 * The traces the arrow keys step through: the selected shown signal, or else every shown
 * signal but the clocks, whose edges would make each step tiny.
 */
function stepTraces(view: WaveView, selected: string | null): Trace[] {
  const shown = traceRows(view.list);
  const chosen = shown.filter((row) => row.path === selected);
  const others = shown.filter((row) => !CLOCK_NAME.test(row.signal.name));
  return (chosen.length > 0 ? chosen : others).map((row) => row.trace);
}

interface KeyTargets {
  readonly view: WaveView;
  readonly selected: string | null;
  readonly closeMenu: () => boolean;
  /** Leaves report mode; false when it was not on. */
  readonly closeReport: () => boolean;
  /** The cursor while it is shown; the arrow keys move it only then. */
  readonly shownCursor: Ticks | undefined;
  readonly close: () => void;
}

function moveCursor({ view, selected, shownCursor }: KeyTargets, direction: Direction, fine: boolean): void {
  const { setup } = view;
  if (setup === null || shownCursor === undefined) return;
  const span = setup.window.end - setup.window.start;
  const to = fine ? fineStep(shownCursor, span, direction) : changeFrom(stepTraces(view, selected), shownCursor, direction);
  if (to !== undefined) view.actions.showCursor(to);
}

/** The keys of the view (S9: never required): Esc, + / −, F, and the arrows for the cursor. */
function keyAction(event: KeyboardEvent<HTMLElement>, targets: KeyTargets): (() => void) | undefined {
  const { actions } = targets.view;
  const keys: Readonly<Record<string, () => void>> = {
    Escape: () => targets.closeMenu() || targets.closeReport() || targets.close(),
    '+': () => actions.zoom(1 / ZOOM_STEP),
    '=': () => actions.zoom(1 / ZOOM_STEP),
    '-': () => actions.zoom(ZOOM_STEP),
    f: () => actions.fit(),
    F: () => actions.fit(),
    ArrowLeft: () => moveCursor(targets, 'previous', event.shiftKey),
    ArrowRight: () => moveCursor(targets, 'next', event.shiftKey),
  };
  return event.ctrlKey || event.metaKey || event.altKey ? undefined : keys[event.key];
}

function useSignals({ props, view, openMenu, body }: SignalsInput): Signals {
  const [selected, setSelected] = useState<string | null>(null);
  const reorder = useReorder({ view, body, select: setSelected });
  const data = props.waveform.state.data;
  const known = useMemo(() => (data === null ? new Map() : signalsByPath(data)), [data]);
  const chosen = view.setup?.showAs;
  // Stable while the choices and the signals stay, so what is drawn from it can be cached.
  const showAsOf = useCallback(
    (path: SignalPath): ShowAs => {
      const signal = known.get(path);
      return chosen?.get(path) ?? (signal === undefined ? 'hex' : defaultShowAs(signal));
    },
    [known, chosen],
  );
  const goTo = (path: SignalPath) => {
    if (data === null) return;
    const { scopes, name } = declarationOf(data, path);
    props.onGoToDeclaration(scopes, name);
  };
  const on: RowCallbacks = {
    onSelect: setSelected,
    onToggleShown: view.actions.toggleShown,
    onToggleOpen: view.actions.toggleOpen,
    onToggleExpanded: view.actions.toggleExpanded,
    onContextMenu: (path, x, y) => openMenu({ kind: 'signal', place: { x, y }, path }),
    onGoToDeclaration: goTo,
    onMove: reorder.step,
    onPressMove: reorder.press,
  };
  return { selected, showAsOf, goTo, on, reorder, fileOfScope: props.fileOfScope };
}

interface SignalMenuForProps {
  readonly menu: SignalMenuState;
  readonly view: WaveView;
  readonly data: WaveformData;
  readonly signals: Signals;
  readonly closeMenu: () => void;
}

function SignalMenuFor({ menu, view, data, signals, closeMenu }: SignalMenuForProps) {
  const signal = signalsByPath(data).get(menu.path);
  const then = (action: () => void) => {
    action();
    closeMenu();
  };
  return (
    <SignalMenu
      place={menu.place}
      showAs={signal !== undefined && hasShowAs(signal) ? signals.showAsOf(menu.path) : undefined}
      shown={view.setup?.list.shown.includes(menu.path) ?? false}
      onGoToDeclaration={() => then(() => signals.goTo(menu.path))}
      onShowAs={(showAs) => then(() => view.actions.setShowAs(menu.path, showAs))}
      onToggleShown={() => then(() => view.actions.toggleShown(menu.path))}
      move={moveChoices(signals.reorder, menu.path, then)}
    />
  );
}

/** The Move items of a signal's menu, or none for a signal that cannot move. */
function moveChoices(reorder: Reorder, path: SignalPath, then: (action: () => void) => void): MoveChoices | undefined {
  if (!reorder.canMove(path)) return undefined;
  return { can: (step) => reorder.canStep(path, step), onMove: (step) => then(() => reorder.step(path, step)) };
}

/** What the canvas's mouse gestures do to the view: a hidden cursor stays where it is. */
function gestureHandlers(view: WaveView, context: RowContext) {
  const handlers = timeHandlersOf(view.actions);
  const onCursor = context.cursor === undefined ? () => undefined : handlers.onCursor;
  return { ...handlers, onCursor, onSelectRow: context.on.onSelect };
}

interface BodyProps {
  readonly data: WaveformData;
  readonly view: WaveView;
  readonly context: RowContext;
  readonly reorder: Reorder;
  readonly error: { readonly time: Ticks; readonly text: string } | undefined;
  readonly stale: boolean;
  readonly bodyHeight: number;
  readonly namesWidth: number;
  readonly onNamesWidth: (width: number) => void;
  readonly onBodyElement: (element: HTMLDivElement | null) => void;
  /** The canvas's width, for the toolbar's cursor time. */
  readonly onTracesWidth: (width: number) => void;
}

/** The scrolling part: names and values on the left, the canvas on the right, one row each. */
function Body({ data, view, context, reorder, error, stale, bodyHeight, namesWidth, onNamesWidth, onBodyElement, onTracesWidth }: BodyProps) {
  const [traces, setTraces] = useState<HTMLDivElement | null>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const width = useElementSize(traces).width;
  useEffect(() => onTracesWidth(width), [width, onTracesWidth]);
  const { setup, list } = view;
  if (setup === null) return null;
  const listHeight = AXIS_HEIGHT + list.height;
  const scene = {
    ...list,
    view: viewOf(setup.window.start, setup.window.end, width),
    size: { width, height: Math.max(0, Math.min(bodyHeight, listHeight + ROW_HEIGHT)) },
    scrollTop,
    endTime: data.endTime,
    tickFs: data.tickFs,
    cursor: context.cursor,
    stale,
    showAsOf: context.showAsOf,
    selectedPath: context.selected ?? undefined,
  };
  const handlers = gestureHandlers(view, context);
  return (
    <div className="wv-body" ref={onBodyElement} onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}>
      <div className="wv-grid" ref={reorder.onGridElement} style={{ height: listHeight }}>
        <div className="wv-names" style={{ width: namesWidth }}>
          <ColumnResizer width={namesWidth} onWidth={onNamesWidth} />
          <div className="wv-names__header" style={{ height: AXIS_HEIGHT }}>
            <span>Signal</span>
            <span>Value</span>
          </div>
          <SignalList list={list} context={context} />
        </div>
        <div className="wv-traces" ref={setTraces}>
          <WaveCanvas scene={scene} error={error} handlers={handlers} />
        </div>
        <RowDragLayer store={reorder.store} sections={reorder.sections} namesWidth={namesWidth} />
      </div>
    </div>
  );
}

function emptyText(waveform: Waveform, showLoading: boolean): string {
  const { error, loading } = waveform.state;
  if (error !== null) return error;
  if (showLoading) return 'Loading the waveform …';
  return loading !== null ? '' : 'Run a testbench to see its waveform.';
}

interface MenusProps {
  readonly menu: Menu | null;
  readonly waveform: Waveform;
  readonly view: WaveView;
  readonly signals: Signals;
  readonly setMenu: (menu: Menu | null) => void;
  readonly openHelp: () => void;
  readonly figures: ViewFigures;
}

function Menus({ menu, waveform, view, signals, setMenu, openHelp, figures }: MenusProps) {
  const data = waveform.state.data;
  if (menu?.kind === 'signal' && data !== null) return <SignalMenuFor menu={menu} view={view} data={data} signals={signals} closeMenu={() => setMenu(null)} />;
  if (menu?.kind !== 'more') return null;
  const close = (action: () => void) => () => {
    action();
    setMenu(null);
  };
  const { report } = figures;
  if (report !== null) {
    return <ReportMenu place={menu.place} onCopy={close(report.copy)} onSaveSvg={close(report.saveSvg)} onSavePng={close(report.savePng)} />;
  }
  return (
    <MoreMenu
      place={menu.place}
      hasTraces={figures.hasTraces}
      format={waveform.state.ready?.format}
      onCopyWaveform={close(figures.copyWaveform)}
      onReportFigure={close(figures.openReport)}
      onDownload={close(waveform.download)}
      onHelp={close(openHelp)}
    />
  );
}

interface PaneToolbarProps {
  readonly title: string;
  readonly mode: ToolbarMode;
  readonly hasWaveform: boolean;
  readonly cursorControls: ReactNode;
  readonly view: WaveView;
  readonly onMenu: (menu: Menu) => void;
  readonly onClose: () => void;
}

function PaneToolbar({ title, mode, hasWaveform, cursorControls, view, onMenu, onClose }: PaneToolbarProps) {
  return (
    <WaveToolbar
      title={title}
      mode={mode}
      hasWaveform={hasWaveform}
      cursorControls={cursorControls}
      onZoomOut={() => view.actions.zoom(ZOOM_STEP)}
      onZoomIn={() => view.actions.zoom(1 / ZOOM_STEP)}
      onFit={view.actions.fit}
      onMore={(anchor) => onMenu({ kind: 'more', place: { x: anchor.right - MENU_WIDTH, y: anchor.bottom + MENU_GAP } })}
      onClose={onClose}
    />
  );
}

interface PaneHeaderProps {
  readonly report: ReportMode | null;
  readonly toolbar: Omit<PaneToolbarProps, 'cursorControls' | 'mode'>;
  /** The cursor's controls, with the words their checkbox says. */
  readonly cursorControls: (label: string) => ReactNode;
}

/**
 * Report mode's band above the toolbar. In report mode the cursor's controls are in the
 * band, not in the toolbar, and the toolbar's Close leaves report mode, as the band's does.
 */
function PaneHeader({ report, toolbar, cursorControls }: PaneHeaderProps) {
  if (report === null) {
    return <PaneToolbar {...toolbar} mode="view" cursorControls={toolbar.hasWaveform ? cursorControls('Cursor') : null} />;
  }
  return (
    <>
      <ReportBand report={report} cursorControls={cursorControls('Show the cursor')} />
      <PaneToolbar {...toolbar} mode="report" cursorControls={null} onClose={report.close} />
    </>
  );
}

/** The pane's state: the view, the menus, the sizes that decide the first view. */
function usePane(props: WaveformPaneProps) {
  const data = props.waveform.state.data;
  const [body, setBody] = useState<HTMLDivElement | null>(null);
  const bodyHeight = useElementSize(body).height;
  const [menu, setMenu] = useState<Menu | null>(null);
  const moments = useMoments(props.consoleLines);
  const fittingRows = bodyHeight > 0 ? Math.max(1, Math.floor((bodyHeight - AXIS_HEIGHT) / ROW_HEIGHT) - 1) : DEFAULT_FITTING_ROWS;
  const end = data === null ? 1 : runEnd(data, moments);
  const view = useWaveView({ data, moments, memory: props.memory, saved: props.saved, focus: props.focus, fittingRows, minSpan: MIN_WINDOW_TICKS, end });
  const signals = useSignals({ props, view, openMenu: setMenu, body });
  const error = useMemo(() => (data === null ? undefined : firstWindow(data, moments).error), [data, moments]);
  /** Closes the open menu; false when none was open. */
  const closeMenu = () => {
    if (menu === null) return false;
    setMenu(null);
    return true;
  };
  return { data, setBody, bodyHeight, menu, setMenu, closeMenu, view, signals, error };
}

interface RowContextInput {
  readonly data: WaveformData | null;
  readonly signals: Signals;
  readonly shownCursor: Ticks | undefined;
}

function rowContext({ data, signals, shownCursor }: RowContextInput): RowContext {
  const { showAsOf, selected, on, fileOfScope, reorder } = signals;
  return { cursor: shownCursor, traces: data?.traces ?? new Map(), showAsOf, selected, movable: reorder.canMove, on, fileOfScope };
}

/** Whether a key is meant for something else: a field the student types in, or a dialog over the pane. */
const keyIsForOther = (target: EventTarget): boolean =>
  target instanceof HTMLInputElement || (target instanceof Element && target.closest('[role="dialog"]') !== null);

/** The pane's keys, unless they are meant for a field or a dialog. */
function usePaneKeys(targets: KeyTargets) {
  return (event: KeyboardEvent<HTMLElement>) => {
    const action = keyIsForOther(event.target) ? undefined : keyAction(event, targets);
    if (action === undefined) return;
    event.preventDefault();
    action();
  };
}

export function WaveformPane(props: WaveformPaneProps) {
  const { waveform } = props;
  const { data, setBody, bodyHeight, menu, setMenu, closeMenu, view, signals, error } = usePane(props);
  const [helpOpen, setHelpOpen] = useState(false);
  const [tracesWidth, setTracesWidth] = useState(0);
  const [namesWidth, setNamesWidth] = useNamesWidth();
  const { shown: cursorShown, show: showCursor, shownCursor } = useCursorShown(view);
  const showLoading = useDelayed(waveform.state.loading !== null && data === null, LOADING_NOTE_DELAY_MS);
  const title = data === null ? props.title : (testbenchScope(data)?.name ?? props.title);
  // The view takes the keyboard when it opens, so Esc and the arrows work at once.
  const paneRef = useRef<HTMLElement>(null);
  useEffect(() => paneRef.current?.focus(), []);
  const size = { namesWidth, tracesWidth };
  const figures = useViewFigures({ view, showAsOf: signals.showAsOf, shownCursor, pane: paneRef, size, baseName: `${title}_waveform` });
  const keyTargets = { view, selected: signals.selected, shownCursor, closeMenu, closeReport: figures.closeReport, close: waveform.close };
  const field = useCursorField({ view, data, tracesWidth });
  const cursorControls = (label: string) => <CursorControls label={label} shown={cursorShown} onShown={showCursor} field={field} />;
  const toolbar = { title, hasWaveform: field !== null, view, onMenu: setMenu, onClose: waveform.close };
  return (
    <section ref={paneRef} className="wv-pane" aria-label="Waveform" tabIndex={-1} onKeyDown={usePaneKeys(keyTargets)} onClick={() => closeMenu()}>
      <PaneHeader report={figures.report} toolbar={toolbar} cursorControls={cursorControls} />
      <WaveNotes notes={notesFor(waveform.state, data)} />
      {helpOpen && <WaveHelp onClose={() => setHelpOpen(false)} />}
      {data === null ? (
        <div className="wv-empty">{emptyText(waveform, showLoading)}</div>
      ) : (
        <ReportStage report={figures.report} handlers={timeHandlersOf(view.actions)}>
          <Body data={data} view={view} context={rowContext({ data, signals, shownCursor })} reorder={signals.reorder} error={error} stale={waveform.state.stale}
            bodyHeight={bodyHeight} namesWidth={namesWidth} onNamesWidth={setNamesWidth} onBodyElement={setBody} onTracesWidth={setTracesWidth} />
        </ReportStage>
      )}
      <Menus menu={menu} waveform={waveform} view={view} signals={signals} setMenu={setMenu} openHelp={() => setHelpOpen(true)} figures={figures} />
      <CopyStatus status={figures.status} />
      <div className="wb-sr-only" role="status" aria-live="polite">
        {signals.reorder.announcement}
      </div>
    </section>
  );
}
