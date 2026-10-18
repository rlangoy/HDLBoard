// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * The cursor's time as a field (docs/waveform_viewer_spec.md § 8.6): it follows the
 * cursor, and typing a time and pressing Enter – or leaving the field – moves the cursor
 * there. Esc puts the field back as it was. The unit beside it is a flat dropdown (s, ms,
 * µs, ns, ps); until one is picked it follows the time. The pane keeps the picked unit,
 * so the toolbar's field and report mode's field read alike.
 */

import { useRef, useState, type KeyboardEvent } from 'react';
import { FlatSelect } from './FlatSelect';
import { CURSOR_UNITS, cursorUnitFor, formatCursorIn, parseTimeIn, type TimeUnit } from './timeAxis';

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
