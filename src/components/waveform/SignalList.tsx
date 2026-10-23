// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * The signal list with its value column (docs/waveform_viewer_spec.md § 8.6, S8): the
 * shown signals first, together, then folders with the ones not shown. Names on the
 * left, the value at the cursor beside each, as text in the DOM (NFR-10). A real tree
 * (`role="tree"`). Each row is drawn by `SignalRow`. Memoised: scrolling re-renders the
 * view's body for the canvas, and a long list need not be drawn again for that.
 */

import { memo } from 'react';
import type { ListModel } from './signalRows';
import { ROW_HEIGHT } from './waveDraw';
import { SignalRow, type RowContext } from './SignalRow';

export interface SignalListProps {
  readonly list: ListModel;
  readonly context: RowContext;
}

export const SignalList = memo(function SignalList({ list, context }: SignalListProps) {
  const { rows, tops } = list;
  // The first row takes the keyboard until the student selects another.
  const selected = context.selected ?? rows[0]?.path ?? null;
  return (
    <div className="wv-list" role="tree" aria-label="Signals">
      {rows.map((row, index) => (
        // The gap above a section, as on the canvas.
        <SignalRow key={row.path} row={row} context={{ ...context, selected }} gapAbove={index === 0 ? 0 : tops[index] - tops[index - 1] - ROW_HEIGHT} />
      ))}
    </div>
  );
});
