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
  /** What the other pane links to the latest highlight, for the pane that did not make it. */
  readonly linked: Partial<ByPane<ReadonlyMap<number, readonly Occurrence[]>>>;
}

interface Source {
  readonly pane: PaneRole;
  readonly symbol: HdlSymbol;
}

const OTHER: ByPane<PaneRole> = { tb: 'rtl', rtl: 'tb' };

/**
 * Testbench and design side by side: the pane that highlighted a symbol last is
 * the source, and the other pane shows the names wired to it through the port and
 * generic maps (symbols/portLinks.ts). Each pane's own highlighting is unchanged;
 * it shows again as soon as the source's highlight ends.
 *
 * @param enabled Whether both panes are showing.
 */
export function useLinkedHighlight(enabled: boolean, files: ByPane<FileSymbols | undefined>): LinkedHighlight {
  const [source, setSource] = useState<Source | undefined>(undefined);

  const onHighlightChange = useMemo(() => {
    const reporter = (pane: PaneRole) => (symbol: HdlSymbol | undefined) =>
      setSource((previous) => {
        if (symbol) return previous?.pane === pane && previous.symbol === symbol ? previous : { pane, symbol };
        return previous?.pane === pane ? undefined : previous; // only the source can end the link
      });
    return { tb: reporter('tb'), rtl: reporter('rtl') };
  }, []);

  const { tb, rtl } = files;
  const linked = useMemo(() => {
    if (!enabled || !source) return {};
    const target = OTHER[source.pane];
    const panes = { tb, rtl };
    const from = panes[source.pane];
    const to = panes[target];
    if (!from || !to || from === to) return {};
    return { [target]: linkedOccurrences(from, source.symbol, to) };
  }, [enabled, source, tb, rtl]);

  return { onHighlightChange, linked };
}
