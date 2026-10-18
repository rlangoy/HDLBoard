// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * The cursor's time as a field (docs/waveform_viewer_spec.md § 8.6): it follows the
 * cursor, and typing a time and pressing Enter – or leaving the field – moves the cursor
 * there. The unit beside it is a flat dropdown (s, ms, µs, ns, ps); until one is picked
 * it follows the time, as the readout did. Esc puts the field back as it was.
 */

import { useState, type KeyboardEvent } from 'react';
import { FlatSelect } from './FlatSelect';
import { CURSOR_UNITS, cursorUnitFor, formatCursorIn, parseTimeIn, type TimeUnit } from './timeAxis';

export interface CursorTimeFieldProps {
  /** The cursor's time. */
  readonly fs: number;
  /** How finely the cursor can be placed, for the decimals shown. */
  readonly resolutionFs: number;
  readonly onChange: (fs: number) => void;
}

const UNIT_SYMBOLS = CURSOR_UNITS.map(([symbol]) => symbol);

const unitNamed = (symbol: string): TimeUnit => CURSOR_UNITS.find(([name]) => name === symbol) ?? cursorUnitFor(0);

/** The text being typed, while the field has it; null shows the cursor's time. */
function useDraft(shown: string, commit: (text: string) => void) {
  const [draft, setDraft] = useState<string | null>(null);
  const finish = () => {
    if (draft !== null) commit(draft);
    setDraft(null);
  };
  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') finish();
    if (event.key !== 'Escape') return;
    // Esc puts the field back; the pane must not close the waveform as well.
    event.stopPropagation();
    setDraft(null);
    event.currentTarget.blur();
  };
  return { value: draft ?? shown, setDraft, finish, onKeyDown };
}

export function CursorTimeField({ fs, resolutionFs, onChange }: CursorTimeFieldProps) {
  const [picked, setPicked] = useState<string | null>(null);
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
        type="text"
        inputMode="decimal"
        aria-label="Cursor time"
        value={draft.value}
        onChange={(event) => draft.setDraft(event.target.value)}
        onBlur={draft.finish}
        onKeyDown={draft.onKeyDown}
      />
      <FlatSelect value={unit[0]} options={UNIT_SYMBOLS} label="Cursor time unit" onChange={setPicked} />
    </span>
  );
}
