// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import { useEffect, useMemo, useState } from 'react';
import type { RevealRequest } from '../useRevealLine';
import type { HdlSymbol, SymbolIndex } from './types';

/**
 * The symbol a reveal asked to highlight (the waveform's Go to declaration), shown as a
 * hover would show it until the student clicks anywhere or hovers another name.
 *
 * @param fileId The file shown; a reveal for another file pins nothing here.
 * @param index The current symbol index; the pinned symbol is looked up in it by id.
 * @param reveal The editor's latest reveal request.
 * @param hovered The symbol under the pointer: hovering one ends the pin.
 */
export function usePinnedSymbol(
  fileId: string,
  index: SymbolIndex,
  reveal: RevealRequest | null | undefined,
  hovered: HdlSymbol | undefined,
): HdlSymbol | undefined {
  const [pinned, setPinned] = useState<{ readonly fileId: string; readonly symbolId: string } | null>(null);

  useEffect(() => {
    if (reveal?.highlight === undefined || reveal.fileId !== fileId) return;
    setPinned({ fileId, symbolId: reveal.highlight });
    // Only a new request pins; the same one seen again after an edit does not.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reveal?.id]);

  const active = pinned !== null && pinned.fileId === fileId;
  useEffect(() => {
    if (!active) return undefined;
    const unpin = () => setPinned(null);
    window.addEventListener('pointerdown', unpin, true);
    return () => window.removeEventListener('pointerdown', unpin, true);
  }, [active]);

  useEffect(() => {
    if (hovered !== undefined) setPinned(null);
  }, [hovered]);

  return useMemo(
    () => (active ? index.symbols.find((symbol) => symbol.id === pinned.symbolId) : undefined),
    [active, index, pinned],
  );
}
