// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import { useCallback, useRef, useState } from 'react';
import type { Overlay } from '../useOverlay';

/** What is shown in the editor's place, and how to change it (useOverlay.ts). */
export interface OverlayControl {
  readonly overlay: Overlay;
  readonly setOverlay: (overlay: Overlay) => void;
}

export interface PageState<Id extends string> {
  /** The section shown, or null while the page is not. */
  readonly section: Id | null;
  readonly open: (section?: Id) => void;
  readonly select: (section: Id) => void;
  /**
   * Closes the page when it shows `section` (or, without one, whatever it shows);
   * opens it at `section` otherwise.
   */
  readonly toggle: (section?: Id) => void;
  /** Back to the workspace: the focus returns to where it was before the page opened. */
  readonly close: () => void;
}

/**
 * A page with sections in the editor's place (Settings, Projects), shown like the other
 * pages there, so another page simply takes its place. It remembers which section to show.
 */
export function usePageState<Id extends string>(page: NonNullable<Overlay>, firstSection: Id, { overlay, setOverlay }: OverlayControl): PageState<Id> {
  const [section, setSection] = useState<Id>(firstSection);
  const focusBeforeOpen = useRef<HTMLElement | null>(null);
  const shown = overlay === page;

  const open = useCallback((target: Id = firstSection) => {
    if (!shown) focusBeforeOpen.current = activeElement();
    setSection(target);
    setOverlay(page);
  }, [shown, page, firstSection, setOverlay]);

  const close = useCallback(() => {
    const returnTo = focusBeforeOpen.current;
    focusBeforeOpen.current = null;
    setOverlay(null);
    if (returnTo?.isConnected) requestAnimationFrame(() => returnTo.focus());
  }, [setOverlay]);

  const toggle = (target?: Id) => (shown && (target === undefined || target === section) ? close() : open(target));

  return { section: shown ? section : null, open, select: setSection, toggle, close };
}

function activeElement(): HTMLElement | null {
  return document.activeElement instanceof HTMLElement ? document.activeElement : null;
}
