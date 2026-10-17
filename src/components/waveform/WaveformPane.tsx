// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * The waveform view, shown in the editor area in place of the testbench/RTL split view
 * (docs/waveform_viewer_spec.md § 8.6, W8). Few controls on screen (S3): the time at the
 * cursor, Zoom out, Zoom in, Fit, ⋯ and Close; everything else is in a right-click menu.
 * The way back to the code is always one click: Close, or Go to declaration.
 */

import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent, type MutableRefObject } from 'react';
import { firstError, lastReportFs } from './consoleTimes';
import { firstShown, firstWindow, runEnd, type RunMoments } from './initialView';
import type { RunWaveStatus, Ticks, WaveformData } from './model';
import { defaultShowAs, hasShowAs, SHOW_AS_LABELS, type ShowAs } from './radix';
import { listRows, signalsByPath, splitPath, testbenchScope, type SignalPath } from './signalRows';
import { SignalList } from './SignalList';
import { formatCursorFs, viewOf } from './timeAxis';
import { AXIS_HEIGHT, ROW_HEIGHT } from './waveDraw';
import { WaveCanvas } from './WaveCanvas';
import type { Waveform } from './useWaveform';
import './Waveform.css';

/** What the student set up in the view, kept across reruns and reopening (FR-17). */
export interface WaveViewMemory {
  readonly shown: readonly SignalPath[];
  readonly open: readonly string[];
  readonly showAll: boolean;
  readonly showAs: ReadonlyArray<readonly [SignalPath, ShowAs]>;
  readonly window: { readonly start: Ticks; readonly end: Ticks };
  readonly cursor: Ticks;
}

/** A console link asked for this time (FR-16); `id` makes the same time twice two requests. */
export interface WaveFocus {
  readonly fs: number;
  readonly id: number;
}

export interface WaveformPaneProps {
  readonly waveform: Waveform;
  /** The testbench the waveform is of, for the title. */
  readonly title: string;
  /** The run's console lines: where its first error and last report are (FR-26). */
  readonly consoleLines: readonly string[];
  readonly memory: MutableRefObject<WaveViewMemory | null>;
  readonly focus: WaveFocus | null;
  onGoToDeclaration(scopes: readonly string[], name: string): void;
}

const NAMES_WIDTH = 260;
const ZOOM_STEP = 2;
/** Never zoomed in further than this many pixels per tick of the file. */
const MAX_PX_PER_TICK = 50;
const DEFAULT_FITTING_ROWS = 14;
const LOADING_NOTE_DELAY_MS = 500;

const STATUS_NOTE: Readonly<Record<Exclude<RunWaveStatus, 'complete'>, string>> = {
  stopped: 'You stopped this run: the waveform shows it up to that point.',
  timeout: 'This run took too long and was stopped: the waveform shows it up to there.',
  'size-limit': 'The waveform got too large, so the simulation was stopped: it shows the run up to there. End the testbench when the test is done.',
};

interface ViewSetup {
  readonly shown: ReadonlySet<SignalPath>;
  readonly open: ReadonlySet<string>;
  readonly showAll: boolean;
  readonly showAs: ReadonlyMap<SignalPath, ShowAs>;
  readonly start: Ticks;
  readonly end: Ticks;
  readonly cursor: Ticks;
}

/** The first view of a waveform, or the student's own setup for every signal that still exists (FR-5, FR-17, FR-26). */
function setupFor(data: WaveformData, memory: WaveViewMemory | null, moments: RunMoments, fittingRows: number): ViewSetup {
  const first = firstWindow(data, moments);
  const known = signalsByPath(data);
  const kept = memory?.shown.filter((path) => known.has(path)) ?? [];
  if (memory === null || kept.length === 0) {
    return { shown: new Set(firstShown(data, fittingRows)), open: new Set(), showAll: false, showAs: new Map(), ...first };
  }
  // A run with an error still opens at it: start where the problem is (W11).
  const window = first.error !== undefined ? first : { ...memory.window, cursor: memory.cursor };
  return {
    shown: new Set(kept),
    open: new Set(memory.open),
    showAll: memory.showAll,
    showAs: new Map(memory.showAs.filter(([path, showAs]) => known.has(path) && SHOW_AS_LABELS.some(([value]) => value === showAs))),
    start: window.start,
    end: window.end,
    cursor: window.cursor,
  };
}

function useSize(element: HTMLElement | null): { width: number; height: number } {
  const [size, setSize] = useState({ width: 0, height: 0 });
  useEffect(() => {
    if (element === null) return;
    const observer = new ResizeObserver(([entry]) => setSize({ width: entry.contentRect.width, height: entry.contentRect.height }));
    observer.observe(element);
    return () => observer.disconnect();
  }, [element]);
  return size;
}

function useDelayed(on: boolean, delayMs: number): boolean {
  const [shown, setShown] = useState(false);
  useEffect(() => {
    if (!on) {
      setShown(false);
      return;
    }
    const timer = window.setTimeout(() => setShown(true), delayMs);
    return () => window.clearTimeout(timer);
  }, [on, delayMs]);
  return shown;
}

interface Menu {
  readonly kind: 'signal' | 'more';
  readonly path?: SignalPath;
  readonly x: number;
  readonly y: number;
}

export function WaveformPane({ waveform, title, consoleLines, memory, focus, onGoToDeclaration }: WaveformPaneProps) {
  const { state } = waveform;
  const data = state.data;
  const [body, setBody] = useState<HTMLDivElement | null>(null);
  const [traces, setTraces] = useState<HTMLDivElement | null>(null);
  const bodySize = useSize(body);
  const tracesSize = useSize(traces);
  const [scrollTop, setScrollTop] = useState(0);
  const [setup, setSetup] = useState<ViewSetup | null>(null);
  const [menu, setMenu] = useState<Menu | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [helpOpen, setHelpOpen] = useState(false);
  const paneRef = useRef<HTMLElement>(null);
  const showLoading = useDelayed(state.loading !== null && data === null, LOADING_NOTE_DELAY_MS);

  const moments = useMemo<RunMoments>(() => ({ firstError: firstError(consoleLines), lastReportFs: lastReportFs(consoleLines) }), [consoleLines]);
  const errorMarker = useMemo(() => (data === null ? undefined : firstWindow(data, moments).error), [data, moments]);
  const end = data === null ? 1 : runEnd(data, moments);

  // A new waveform: the first view, or what the student had (FR-17).
  const fittingRows = bodySize.height > 0 ? Math.max(1, Math.floor((bodySize.height - AXIS_HEIGHT) / ROW_HEIGHT) - 1) : DEFAULT_FITTING_ROWS;
  const fittingRowsRef = useRef(fittingRows);
  fittingRowsRef.current = fittingRows;
  useEffect(() => {
    if (data !== null) setSetup(setupFor(data, memory.current, moments, fittingRowsRef.current));
    // Only a new waveform starts a new setup; the console growing during a run does not.
  }, [data]);

  // Kept for the next run and the next opening.
  useEffect(() => {
    if (setup === null) return;
    memory.current = {
      shown: [...setup.shown],
      open: [...setup.open],
      showAll: setup.showAll,
      showAs: [...setup.showAs],
      window: { start: setup.start, end: setup.end },
      cursor: setup.cursor,
    };
  }, [setup, memory]);

  const update = useCallback((change: (s: ViewSetup) => ViewSetup) => setSetup((s) => (s === null ? s : change(s))), []);

  const minSpan = Math.max(tracesSize.width, 1) / MAX_PX_PER_TICK;
  const setWindow = useCallback(
    (start: Ticks, stop: Ticks) =>
      update((s) => {
        let span = Math.max(stop - start, minSpan);
        span = Math.min(span, end * 4);
        const from = Math.min(Math.max(start, -span * 0.25), end - span * 0.25);
        return { ...s, start: from, end: from + span };
      }),
    [update, minSpan, end],
  );

  const zoom = useCallback(
    (factor: number, at?: Ticks) =>
      update((s) => {
        const center = at ?? (s.cursor >= s.start && s.cursor <= s.end ? s.cursor : (s.start + s.end) / 2);
        const span = Math.min(Math.max((s.end - s.start) * factor, minSpan), end * 4);
        const ratio = s.end === s.start ? 0.5 : (center - s.start) / (s.end - s.start);
        const start = center - span * ratio;
        return { ...s, start, end: start + span };
      }),
    [update, minSpan, end],
  );

  const fit = useCallback(() => update((s) => ({ ...s, start: 0, end })), [update, end]);

  // A console time link: the cursor goes there, and the view follows when it is outside (FR-16).
  const appliedFocus = useRef<number | null>(null);
  useEffect(() => {
    // Each request once: a new waveform arriving later must not move the cursor back to it.
    if (focus === null || data === null || setup === null || appliedFocus.current === focus.id) return;
    appliedFocus.current = focus.id;
    const time = focus.fs / data.tickFs;
    update((s) => {
      const span = s.end - s.start;
      const inside = time >= s.start && time <= s.end;
      return inside ? { ...s, cursor: time } : { ...s, cursor: time, start: time - span / 2, end: time + span / 2 };
    });
  }, [focus, data, setup, update]);

  const rows = useMemo(() => (data === null || setup === null ? [] : listRows(data, setup)), [data, setup]);
  const showAsOf = useCallback(
    (path: SignalPath) => {
      const signal = data === null ? undefined : signalsByPath(data).get(path);
      return setup?.showAs.get(path) ?? (signal === undefined ? 'hex' : defaultShowAs(signal));
    },
    [data, setup],
  );

  const goTo = (path: SignalPath) => {
    if (data === null) return;
    // Record fields go to the record's own declaration.
    const { scopes, name } = splitPath(path);
    const known = signalsByPath(data);
    let scopeParts = scopes;
    let signalName = name;
    while (scopeParts.length > 1 && known.has(scopeParts.join('/'))) {
      signalName = scopeParts[scopeParts.length - 1];
      scopeParts = scopeParts.slice(0, -1);
    }
    onGoToDeclaration(scopeParts, signalName);
  };

  const toggle = (set: ReadonlySet<string>, item: string): Set<string> => {
    const next = new Set(set);
    if (!next.delete(item)) next.add(item);
    return next;
  };

  const onKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.target instanceof HTMLInputElement) return;
    if (event.key === 'Escape') {
      if (menu !== null) setMenu(null);
      else waveform.close();
    } else if (event.key === '+' || event.key === '=') zoom(1 / ZOOM_STEP);
    else if (event.key === '-' || event.key === '−') zoom(ZOOM_STEP);
    else if (event.key.toLowerCase() === 'f' && !event.ctrlKey && !event.metaKey) fit();
    else return;
    event.preventDefault();
  };

  useEffect(() => paneRef.current?.focus(), []);

  const view = setup === null ? viewOf(0, 1, 1) : viewOf(setup.start, setup.end, tracesSize.width);
  const source = data?.source;
  const notes = [
    state.stale && 'From the previous run – the new run’s waveform appears when it is ready.',
    state.noWaveNote,
    source && source.status !== 'complete' && STATUS_NOTE[source.status],
    source?.truncated && source.status === 'complete' && 'The waveform file ended early: it is shown up to there.',
  ].filter((note): note is string => typeof note === 'string');
  const listHeight = AXIS_HEIGHT + rows.length * ROW_HEIGHT;
  const menuSignal = menu?.path === undefined || data === null ? undefined : signalsByPath(data).get(menu.path);

  return (
    <section
      ref={paneRef}
      className="wv-pane"
      aria-label="Waveform"
      tabIndex={-1}
      onKeyDown={onKeyDown}
      onClick={() => menu !== null && setMenu(null)}
    >
      <header className="wv-toolbar">
        {/* Named after the waveform shown, which may be the previous run's (§ 8.7). */}
        <h2 className="wv-toolbar__title">Waveform – {(data && testbenchScope(data)?.name) ?? title}</h2>
        <span className="wv-toolbar__time" aria-live="polite">
          Time <strong>{setup === null || data === null ? '–' : formatCursorFs(setup.cursor * data.tickFs)}</strong>
        </span>
        <div className="wv-toolbar__buttons">
          <button type="button" className="wv-button" onClick={() => zoom(ZOOM_STEP)} disabled={setup === null} aria-label="Zoom out" title="Zoom out (−)">
            −
          </button>
          <button type="button" className="wv-button" onClick={() => zoom(1 / ZOOM_STEP)} disabled={setup === null} aria-label="Zoom in" title="Zoom in (+)">
            +
          </button>
          <button type="button" className="wv-button wv-button--text" onClick={fit} disabled={setup === null} title="Show the whole run (F)">
            Fit
          </button>
          <button
            type="button"
            className="wv-button"
            aria-label="More"
            aria-haspopup="menu"
            title="More"
            onClick={(e) => {
              e.stopPropagation();
              const box = e.currentTarget.getBoundingClientRect();
              setMenu({ kind: 'more', x: box.right - 200, y: box.bottom + 4 });
            }}
          >
            ⋯
          </button>
          <button type="button" className="wv-button" onClick={waveform.close} aria-label="Close the waveform" title="Close the waveform and show the code (Esc)">
            ✕
          </button>
        </div>
      </header>

      {notes.map((note) => (
        <p key={note} className="wv-note">
          {note}
        </p>
      ))}
      {helpOpen && (
        <div className="wv-help">
          <p>
            Click to place the cursor; the values at the cursor are listed beside the names. The mouse wheel scrolls in time, Ctrl + wheel zooms,
            a double-click on a bus zooms to that value. Right-click a signal for “Show as” and Go to declaration.
          </p>
          <p>The waveform shows each signal’s value at the end of every time step; delta cycles are not shown.</p>
          <button type="button" className="wv-button wv-button--text" onClick={() => setHelpOpen(false)}>
            Close help
          </button>
        </div>
      )}

      {data === null ? (
        <div className="wv-empty">
          {state.error ?? (showLoading ? 'Loading the waveform …' : state.loading !== null ? '' : 'Run a testbench to see its waveform.')}
        </div>
      ) : (
        <div className="wv-body" ref={setBody} onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}>
          <div className="wv-grid" style={{ height: listHeight }}>
            <div className="wv-names" style={{ width: NAMES_WIDTH }}>
              <div className="wv-names__header" style={{ height: AXIS_HEIGHT }}>
                <span>Signal</span>
                <span>Value</span>
              </div>
              {setup !== null && (
                <SignalList
                  rows={rows}
                  traces={data.traces}
                  cursor={setup.cursor}
                  showAsOf={showAsOf}
                  selected={selected ?? rows[0]?.path ?? null}
                  onSelect={setSelected}
                  onToggleShown={(path) => update((s) => ({ ...s, shown: toggle(s.shown, path) }))}
                  onToggleOpen={(path) => update((s) => ({ ...s, open: toggle(s.open, path) }))}
                  onShowAll={() => update((s) => ({ ...s, showAll: true }))}
                  onContextMenu={(path, x, y) => setMenu({ kind: 'signal', path, x, y })}
                  onGoToDeclaration={goTo}
                />
              )}
            </div>
            <div className="wv-traces" ref={setTraces}>
              {setup !== null && (
                <WaveCanvas
                  data={data}
                  rows={rows}
                  view={view}
                  width={tracesSize.width}
                  height={Math.max(0, Math.min(bodySize.height, listHeight + ROW_HEIGHT))}
                  scrollTop={scrollTop}
                  cursor={setup.cursor}
                  error={errorMarker}
                  stale={state.stale}
                  showAsOf={showAsOf}
                  onCursor={(cursor) => update((s) => ({ ...s, cursor }))}
                  onScroll={(ticks) => setWindow(setup.start + ticks, setup.end + ticks)}
                  onZoom={zoom}
                  onZoomTo={setWindow}
                />
              )}
            </div>
          </div>
        </div>
      )}

      {menu !== null && (
        <div className="wv-menu" role="menu" style={{ left: menu.x, top: menu.y }} onClick={(e) => e.stopPropagation()}>
          {menu.kind === 'more' ? (
            <>
              <button type="button" role="menuitem" disabled={state.ready === null} onClick={() => { waveform.download(); setMenu(null); }}>
                Download waveform (.{state.ready?.format ?? 'vcd'})
              </button>
              <button type="button" role="menuitem" onClick={() => { setHelpOpen(true); setMenu(null); }}>
                Help
              </button>
            </>
          ) : (
            <>
              <button type="button" role="menuitem" onClick={() => { if (menu.path) goTo(menu.path); setMenu(null); }}>
                Go to declaration
              </button>
              {menuSignal !== undefined && hasShowAs(menuSignal) && (
                <div role="group" aria-label="Show as" className="wv-menu__group">
                  <span className="wv-menu__label">Show as</span>
                  {SHOW_AS_LABELS.map(([showAs, label]) => (
                    <button
                      key={showAs}
                      type="button"
                      role="menuitemradio"
                      aria-checked={showAsOf(menu.path!) === showAs}
                      onClick={() => {
                        const path = menu.path!;
                        update((s) => ({ ...s, showAs: new Map(s.showAs).set(path, showAs) }));
                        setMenu(null);
                      }}
                    >
                      {showAsOf(menu.path!) === showAs ? '● ' : ''}
                      {label}
                    </button>
                  ))}
                </div>
              )}
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  const path = menu.path!;
                  update((s) => ({ ...s, shown: toggle(s.shown, path) }));
                  setMenu(null);
                }}
              >
                {setup?.shown.has(menu.path!) ? 'Remove' : 'Show'}
              </button>
            </>
          )}
        </div>
      )}
    </section>
  );
}
