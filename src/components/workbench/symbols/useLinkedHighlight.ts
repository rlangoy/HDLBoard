// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import { useMemo, useState } from 'react';
import type { PaneRole } from '../editorView';
import type { FileSymbols } from './fileSymbols';
import { linkedOccurrences } from './portLinks';
import type { HdlSymbol, Occurrence } from './types';

type ByPane<T> = Readonly<Record<PaneRole, T>>;

export interface LinkedHighlight {
  /** Give each pane its own: it reports the symbol it highlights, or undefined. */
  readonly onHighlightChange: ByPane<(symbol: HdlSymbol | undefined) => void>;
  /** What the other pane links to the source's highlight, for the pane that is not the source. */
  readonly linked: Partial<ByPane<ReadonlyMap<number, readonly Occurrence[]>>>;
}

interface Highlights {
  /** What each pane highlights now. */
  readonly symbols: Partial<ByPane<HdlSymbol>>;
  /** The pane that highlighted something last. */
  readonly latest: PaneRole | undefined;
}

const OTHER: ByPane<PaneRole> = { tb: 'rtl', rtl: 'tb' };
const NONE: Highlights = { symbols: {}, latest: undefined };

/**
 * Testbench and design side by side: the source is the pane that highlighted a
 * symbol last, or, once its highlight ends, the other pane if that still
 * highlights one. The other pane shows the names wired to the source's symbol
 * through the port and generic maps (symbols/portLinks.ts). Each pane's own
 * highlighting is unchanged; it shows again as soon as the link is empty.
 *
 * @param enabled Whether both panes are showing.
 */
export function useLinkedHighlight(enabled: boolean, files: ByPane<FileSymbols | undefined>): LinkedHighlight {
  const [highlights, setHighlights] = useState<Highlights>(NONE);

  const onHighlightChange = useMemo(() => {
    const reporter = (pane: PaneRole) => (symbol: HdlSymbol | undefined) =>
      setHighlights((previous) => {
        const unchanged = previous.symbols[pane] === symbol && (!symbol || previous.latest === pane);
        if (unchanged) return previous;
        return { symbols: { ...previous.symbols, [pane]: symbol }, latest: symbol ? pane : previous.latest };
      });
    return { tb: reporter('tb'), rtl: reporter('rtl') };
  }, []);

  const { tb, rtl } = files;
  const linked = useMemo(() => {
    const source = enabled ? sourceOf(highlights) : undefined;
    if (!source) return {};
    const target = OTHER[source.pane];
    const panes = { tb, rtl };
    const from = panes[source.pane];
    const to = panes[target];
    if (!from || !to || from === to) return {};
    return { [target]: linkedOccurrences(from, source.symbol, to) };
  }, [enabled, highlights, tb, rtl]);

  return { onHighlightChange, linked };
}

/** The latest pane that still highlights a symbol, else the other one if it does. */
function sourceOf({ symbols, latest }: Highlights): { pane: PaneRole; symbol: HdlSymbol } | undefined {
  if (!latest) return undefined;
  for (const pane of [latest, OTHER[latest]]) {
    const symbol = symbols[pane];
    if (symbol) return { pane, symbol };
  }
  return undefined;
}
