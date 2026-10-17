// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * The one-line notes above the waveform (FR-12, § 8.7) – how the run ended when it did
 * not complete, a waveform from the previous run – and the help text of the ⋯ menu.
 */

import type { RunWaveStatus, WaveformData } from './model';
import type { WaveState } from './waveState';

const STATUS_NOTE: Readonly<Record<Exclude<RunWaveStatus, 'complete'>, string>> = {
  stopped: 'You stopped this run: the waveform shows it up to that point.',
  timeout: 'This run took too long and was stopped: the waveform shows it up to there.',
  'size-limit': 'The waveform got too large, so the simulation was stopped: it shows the run up to there. End the testbench when the test is done.',
};

const STALE_NOTE = 'From the previous run – the new run’s waveform appears when it is ready.';
const TRUNCATED_NOTE = 'The waveform file ended early: it is shown up to there.';

export function notesFor(state: WaveState, data: WaveformData | null): string[] {
  const source = data?.source;
  const notes: Array<string | null | undefined> = [
    state.stale ? STALE_NOTE : undefined,
    state.noWaveNote,
    source !== undefined && source.status !== 'complete' ? STATUS_NOTE[source.status] : undefined,
    source?.truncated && source.status === 'complete' ? TRUNCATED_NOTE : undefined,
  ];
  return notes.filter((note): note is string => typeof note === 'string');
}

export function WaveNotes({ notes }: { readonly notes: readonly string[] }) {
  return (
    <>
      {notes.map((note) => (
        <p key={note} className="wv-note">
          {note}
        </p>
      ))}
    </>
  );
}

export function WaveHelp({ onClose }: { readonly onClose: () => void }) {
  return (
    <div className="wv-help">
      <p>
        Click in the waveform to place the cursor, or drag on the time ruler; the values at the cursor are listed beside the names. Drag
        across the waveform to zoom into that part. The mouse wheel scrolls in time, Ctrl + wheel zooms, a double-click on a bus zooms to
        that value. ← and → jump to the previous and next change of the selected signal; Shift + ← and → move the cursor a little.
      </p>
      <p>
        Tick a signal in the folders below to show its trace; untick it to hide it again. ▸ beside a vector shows its bits. Right-click a
        signal for “Show as” and Go to declaration.
      </p>
      <p>The waveform shows each signal’s value at the end of every time step; delta cycles are not shown.</p>
      <button type="button" className="wv-button wv-button--text" onClick={onClose}>
        Close help
      </button>
    </div>
  );
}
