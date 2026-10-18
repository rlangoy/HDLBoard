// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * The cursor's controls (docs/waveform_viewer_spec.md § 8.6): a checkbox that shows or
 * hides the cursor – shown again, it starts in the middle of the view – and its time as
 * a field. The field follows the cursor, and typing a time and pressing Enter – or
 * leaving the field – moves the cursor there. Esc puts the field back as it was. The
 * unit beside it is a flat dropdown (s, ms, µs, ns, ps); until one is picked it follows
 * the time. `useCursorField` keeps the picked unit, so the toolbar's field and report
 * mode's field read alike.
 */

import { useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { FlatSelect } from './FlatSelect';
import type { WaveformData } from './model';
import { CURSOR_UNITS, cursorUnitFor, formatCursorIn, parseTimeIn, pixelResolutionFs, viewOf, type TimeUnit } from './timeAxis';
import type { WaveView } from './useWaveView';
import { loadCursorShown, saveCursorShown } from './wavePrefs';

export interface CursorTimeFieldProps {
  /** The cursor's time. */
  readonly fs: number;
  /** How finely the cursor can be placed, for the decimals shown. */
  readonly resolutionFs: number;
  /** The unit picked from the dropdown; null follows the time. */
  readonly unit: string | null;
  readonly onUnit: (symbol: string) => void;
  readonly onChange: (fs: number) => void;
}

const UNIT_SYMBOLS = CURSOR_UNITS.map(([symbol]) => symbol);
/** The field is never narrower than this many characters, and grows with its text. */
const MIN_FIELD_CHARS = 6;

const unitNamed = (symbol: string): TimeUnit => CURSOR_UNITS.find(([name]) => name === symbol) ?? cursorUnitFor(0);

/** The text being typed, while the field has it; null shows the cursor's time. */
function useDraft(shown: string, commit: (text: string) => void) {
  const [draft, setDraft] = useState<string | null>(null);
  // Esc blurs the field, and the blur must not commit what Esc threw away.
  const cancelled = useRef(false);
  const finish = () => {
    if (draft !== null && !cancelled.current) commit(draft);
    cancelled.current = false;
    setDraft(null);
  };
  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') finish();
    if (event.key !== 'Escape') return;
    // The pane must not close the waveform as well.
    event.stopPropagation();
    cancelled.current = true;
    event.currentTarget.blur();
  };
  return { value: draft ?? shown, setDraft, finish, onKeyDown };
}

export function CursorTimeField({ fs, resolutionFs, unit: picked, onUnit, onChange }: CursorTimeFieldProps) {
  const unit = picked === null ? cursorUnitFor(fs) : unitNamed(picked);
  const commit = (text: string) => {
    const typed = parseTimeIn(text, unit);
    if (typed !== undefined) onChange(typed);
  };
  const draft = useDraft(formatCursorIn(fs, unit, resolutionFs), commit);
  return (
    <span className="wv-cursor-field" title="The time at the cursor. Type a time and press Enter to move the cursor there.">
      <input
        className="wv-cursor-field__input"
        style={{ width: `${Math.max(MIN_FIELD_CHARS, draft.value.length + 1)}ch` }}
        type="text"
        inputMode="decimal"
        aria-label="Cursor time"
        value={draft.value}
        onChange={(event) => draft.setDraft(event.target.value)}
        onBlur={draft.finish}
        onKeyDown={draft.onKeyDown}
      />
      <FlatSelect value={unit[0]} options={UNIT_SYMBOLS} label="Cursor time unit" onChange={onUnit} />
    </span>
  );
}

export interface CursorFieldInput {
  readonly view: WaveView;
  readonly data: WaveformData | null;
  /** The traces' width on screen, for how finely the cursor can be placed. */
  readonly tracesWidth: number;
}

/**
 * The cursor's time field for the view, or null while there is no waveform: with the
 * decimals one pixel of the traces can point at. A typed time moves the cursor there,
 * into view, never past the run's end. The picked unit is kept here, so wherever the
 * field is shown – toolbar or report mode – it reads alike.
 */
export function useCursorField({ view, data, tracesWidth }: CursorFieldInput): ReactNode {
  const [unit, setUnit] = useState<string | null>(null);
  if (view.setup === null || data === null || tracesWidth <= 0) return null;
  const { window: shown, cursor, runEnd } = view.setup;
  const resolution = pixelResolutionFs(viewOf(shown.start, shown.end, tracesWidth), data.tickFs, window.devicePixelRatio);
  const moveTo = (fs: number) => view.actions.showCursor(Math.min(runEnd, Math.round(fs / data.tickFs)));
  return <CursorTimeField fs={cursor * data.tickFs} resolutionFs={resolution} unit={unit} onUnit={setUnit} onChange={moveTo} />;
}

export interface CursorShown {
  readonly shown: boolean;
  show(shown: boolean): void;
  /** The cursor while it is shown, else undefined: what everything that draws or moves it is handed. */
  readonly shownCursor: number | undefined;
}

/**
 * Whether the view shows its cursor, remembered in this browser. Shown again, the cursor
 * starts in the middle of the time on screen, where it is easy to find.
 */
export function useCursorShown({ setup, actions }: WaveView): CursorShown {
  const [shown, setShown] = useState(loadCursorShown);
  const show = (next: boolean) => {
    setShown(next);
    saveCursorShown(next);
    if (next && setup !== null) actions.setCursor(Math.round((setup.window.start + setup.window.end) / 2));
  };
  return { shown, show, shownCursor: shown ? setup?.cursor : undefined };
}

export interface CursorControlsProps {
  /** The checkbox's words: `Cursor` in the toolbar, `Show the cursor` in report mode. */
  readonly label: string;
  readonly shown: boolean;
  readonly onShown: (shown: boolean) => void;
  /** The time field, shown with the cursor. */
  readonly field: ReactNode;
}

export function CursorControls({ label, shown, onShown, field }: CursorControlsProps) {
  return (
    <span className="wv-cursor-controls">
      <label className="wv-cursor-controls__toggle" title={shown ? 'Hide the cursor' : 'Show the cursor in the middle of the view'}>
        <input type="checkbox" checked={shown} onChange={(event) => onShown(event.target.checked)} />
        {label}
      </label>
      {shown && field}
    </span>
  );
}
