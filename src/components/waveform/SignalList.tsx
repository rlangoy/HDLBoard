// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * The signal list with its value column (docs/waveform_viewer_spec.md § 8.6, S8): the
 * shown signals first, together, then folders with the ones not shown. Names on the
 * left, the value at the cursor beside each, as text in the DOM (NFR-10). A real tree
 * (`role="tree"`). Each row is drawn by `SignalRow`.
 */

import type { Row } from './signalRows';
import { SignalRow, type RowContext } from './SignalRow';

export interface SignalListProps {
  readonly rows: readonly Row[];
  readonly context: RowContext;
}

export function SignalList({ rows, context }: SignalListProps) {
  // The first row takes the keyboard until the student selects another.
  const selected = context.selected ?? rows[0]?.path ?? null;
  return (
    <div className="wv-list" role="tree" aria-label="Signals">
      {rows.map((row) => (
        <SignalRow key={row.path} row={row} context={{ ...context, selected }} />
      ))}
    </div>
  );
}
