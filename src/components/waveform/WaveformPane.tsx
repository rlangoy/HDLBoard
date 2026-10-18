// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * The waveform view, shown in the editor area in place of the testbench/RTL split view
 * (docs/waveform_viewer_spec.md § 8.6, W8). Few controls on screen (S3); the way back to
 * the code is always one click: Close, or Go to declaration. This component only puts
 * the parts together – toolbar, notes, the signal list beside the canvas, the menus –
 * and the state lives in `useWaveView`.
 */

import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type MutableRefObject } from 'react';
import { firstError, lastReportFs } from './consoleTimes';
import { changeFrom, fineStep, type Direction } from './cursorSteps';
import { useDelayed, useElementSize } from './domHooks';
import { CLOCK_NAME, firstWindow, runEnd, type RunMoments } from './initialView';
import type { Ticks, Trace, WaveformData } from './model';
import { defaultShowAs, hasShowAs, type ShowAs } from './radix';
import { declarationOf, signalsByPath, testbenchScope, traceRows, type SignalPath } from './signalRows';
import { SignalList } from './SignalList';
import type { RowCallbacks, RowContext } from './SignalRow';
import { formatCursorFs, pixelResolutionFs, viewOf } from './timeAxis';
import type { Waveform } from './useWaveform';
import { useWaveView, type WaveFocus, type WaveView } from './useWaveView';
import type { ViewMemory } from './viewSetup';
import { WaveCanvas } from './WaveCanvas';
import { AXIS_HEIGHT, ROW_HEIGHT } from './waveDraw';
import { ColumnResizer, useNamesWidth } from './ColumnResizer';
import { ReportFigureDialog } from './figure/ReportFigureDialog';
import { useViewFigures, type ViewFigures } from './figure/useViewFigures';
import { MoreMenu, SignalMenu, type MenuPlace } from './WaveMenus';
import { notesFor, WaveHelp, WaveNotes } from './WaveNotes';
import { WaveToolbar } from './WaveToolbar';
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
  readonly fileOfScope?: (scopes: readonly string[]) => string | undefined;
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
  readonly close: () => void;
}

function moveCursor({ view, selected }: KeyTargets, direction: Direction, fine: boolean): void {
  const { setup } = view;
  if (setup === null) return;
  const span = setup.window.end - setup.window.start;
  const to = fine ? fineStep(setup.cursor, span, direction) : changeFrom(stepTraces(view, selected), setup.cursor, direction);
  if (to !== undefined) view.actions.showCursor(to);
}

/** The keys of the view (S9: never required): Esc, + / −, F, and the arrows for the cursor. */
function keyAction(event: KeyboardEvent<HTMLElement>, targets: KeyTargets): (() => void) | undefined {
  const { actions } = targets.view;
  const keys: Readonly<Record<string, () => void>> = {
    Escape: () => targets.closeMenu() || targets.close(),
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

function useSignals(props: WaveformPaneProps, view: WaveView, openMenu: (menu: Menu) => void): Signals {
  const [selected, setSelected] = useState<string | null>(null);
  const data = props.waveform.state.data;
  const known = useMemo(() => (data === null ? new Map() : signalsByPath(data)), [data]);
  const showAsOf = (path: SignalPath): ShowAs => {
    const signal = known.get(path);
    return view.setup?.showAs.get(path) ?? (signal === undefined ? 'hex' : defaultShowAs(signal));
  };
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
  };
  return { selected, showAsOf, goTo, on, fileOfScope: props.fileOfScope };
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
    />
  );
}

/** What the canvas's mouse gestures do to the view. */
function gestureHandlers({ actions }: WaveView, context: RowContext) {
  return {
    onCursor: actions.setCursor,
    onZoomTo: (start: Ticks, end: Ticks) => actions.setWindow({ start, end }),
    onScroll: actions.scroll,
    onZoom: actions.zoom,
    onSelectRow: context.on.onSelect,
  };
}

interface BodyProps {
  readonly data: WaveformData;
  readonly view: WaveView;
  readonly context: RowContext;
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
function Body({ data, view, context, error, stale, bodyHeight, namesWidth, onNamesWidth, onBodyElement, onTracesWidth }: BodyProps) {
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
    cursor: setup.cursor,
    stale,
    showAsOf: context.showAsOf,
    selectedPath: context.selected ?? undefined,
  };
  const handlers = gestureHandlers(view, context);
  return (
    <div className="wv-body" ref={onBodyElement} onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}>
      <div className="wv-grid" style={{ height: listHeight }}>
        <div className="wv-names" style={{ width: namesWidth }}>
          <ColumnResizer width={namesWidth} onWidth={onNamesWidth} />
          <div className="wv-names__header" style={{ height: AXIS_HEIGHT }}>
            <span>Signal</span>
            <span>Value</span>
          </div>
          <SignalList list={list} context={{ ...context, cursor: setup.cursor }} />
        </div>
        <div className="wv-traces" ref={setTraces}>
          <WaveCanvas scene={scene} error={error} handlers={handlers} />
        </div>
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

/** How the last copy went, and the report figure's dialog while it is open. */
function FigureParts({ figures, title }: { readonly figures: ViewFigures; readonly title: string }) {
  return (
    <>
      {figures.status !== '' && (
        <p className="wv-status" role="status">
          {figures.status}
        </p>
      )}
      {figures.report !== null && <ReportFigureDialog content={figures.report} baseName={`${title}_waveform`} onClose={figures.closeReport} />}
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
  const view = useWaveView({ data, moments, memory: props.memory, focus: props.focus, fittingRows, minSpan: MIN_WINDOW_TICKS, end });
  const signals = useSignals(props, view, setMenu);
  const error = useMemo(() => (data === null ? undefined : firstWindow(data, moments).error), [data, moments]);
  return { data, setBody, bodyHeight, menu, setMenu, view, signals, error };
}

/**
 * The time at the cursor as the toolbar reads it, or undefined while there is no waveform:
 * with the decimals one pixel of the traces, at the screen's pixel ratio, can point at.
 */
function cursorText(view: WaveView, data: WaveformData | null, tracesWidth: number): string | undefined {
  if (view.setup === null || data === null || tracesWidth <= 0) return undefined;
  const { window: shown, cursor } = view.setup;
  const resolution = pixelResolutionFs(viewOf(shown.start, shown.end, tracesWidth), data.tickFs, window.devicePixelRatio);
  return formatCursorFs(cursor * data.tickFs, resolution);
}

function rowContext(view: WaveView, data: WaveformData | null, signals: Signals): RowContext {
  const { showAsOf, selected, on, fileOfScope } = signals;
  return { cursor: view.setup?.cursor ?? 0, traces: data?.traces ?? new Map(), showAsOf, selected, on, fileOfScope };
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
  const { data, setBody, bodyHeight, menu, setMenu, view, signals, error } = usePane(props);
  const [helpOpen, setHelpOpen] = useState(false);
  const [tracesWidth, setTracesWidth] = useState(0);
  const [namesWidth, setNamesWidth] = useNamesWidth();
  const showLoading = useDelayed(waveform.state.loading !== null && data === null, LOADING_NOTE_DELAY_MS);
  const closeMenu = () => menu !== null && (setMenu(null), true);
  const onKeyDown = usePaneKeys({ view, selected: signals.selected, closeMenu, close: waveform.close });
  const title = data === null ? props.title : (testbenchScope(data)?.name ?? props.title);
  // The view takes the keyboard when it opens, so Esc and the arrows work at once.
  const paneRef = useRef<HTMLElement>(null);
  useEffect(() => paneRef.current?.focus(), []);
  const figures = useViewFigures({ view, showAsOf: signals.showAsOf, pane: paneRef, size: { namesWidth, tracesWidth } });
  return (
    <section ref={paneRef} className="wv-pane" aria-label="Waveform" tabIndex={-1} onKeyDown={onKeyDown} onClick={() => closeMenu()}>
      <WaveToolbar
        title={title}
        time={cursorText(view, data, tracesWidth)}
        onZoomOut={() => view.actions.zoom(ZOOM_STEP)}
        onZoomIn={() => view.actions.zoom(1 / ZOOM_STEP)}
        onFit={view.actions.fit}
        onMore={(anchor) => setMenu({ kind: 'more', place: { x: anchor.right - MENU_WIDTH, y: anchor.bottom + MENU_GAP } })}
        onClose={waveform.close}
      />
      <WaveNotes notes={notesFor(waveform.state, data)} />
      {helpOpen && <WaveHelp onClose={() => setHelpOpen(false)} />}
      {data === null ? (
        <div className="wv-empty">{emptyText(waveform, showLoading)}</div>
      ) : (
        <Body data={data} view={view} context={rowContext(view, data, signals)} error={error} stale={waveform.state.stale} bodyHeight={bodyHeight}
          namesWidth={namesWidth} onNamesWidth={setNamesWidth} onBodyElement={setBody} onTracesWidth={setTracesWidth} />
      )}
      <Menus menu={menu} waveform={waveform} view={view} signals={signals} setMenu={setMenu} openHelp={() => setHelpOpen(true)} figures={figures} />
      <FigureParts figures={figures} title={title} />
    </section>
  );
}
