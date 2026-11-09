// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import { useCallback, useRef, useState } from 'react';
import type { Overlay } from '../useOverlay';
import { FIRST_SECTION, type SettingsSectionId } from './settingsSections';

/** What is shown in the editor's place, and how to change it (useOverlay.ts). */
interface SettingsPageInput {
  readonly overlay: Overlay;
  readonly setOverlay: (overlay: Overlay) => void;
}

export interface SettingsPageState {
  /** The section shown, or null while the page is not. */
  readonly section: SettingsSectionId | null;
  readonly open: (section?: SettingsSectionId) => void;
  readonly select: (section: SettingsSectionId) => void;
  /** The header's Settings button: opens the page, or closes it when it is open. */
  readonly toggle: () => void;
  /** Back to the workspace: the focus returns to where it was before Settings opened. */
  readonly close: () => void;
}

/**
 * The Settings page, shown in the editor's place like the other pages there, so another
 * page simply takes its place. It remembers which section to show; opening it asks the
 * board settings about unsaved edits first, as every page change there does. The Explorer
 * folds away while it is shown (usePageFold, explorerFolds.ts).
 */
export function useSettingsPage({ overlay, setOverlay }: SettingsPageInput): SettingsPageState {
  const [section, setSection] = useState<SettingsSectionId>(FIRST_SECTION);
  const focusBeforeOpen = useRef<HTMLElement | null>(null);
  const shown = overlay === 'settings';

  const open = useCallback((target: SettingsSectionId = FIRST_SECTION) => {
    if (!shown) focusBeforeOpen.current = activeElement();
    setSection(target);
    setOverlay('settings');
  }, [shown, setOverlay]);

  const close = useCallback(() => {
    const returnTo = focusBeforeOpen.current;
    focusBeforeOpen.current = null;
    setOverlay(null);
    if (returnTo?.isConnected) requestAnimationFrame(() => returnTo.focus());
  }, [setOverlay]);

  const toggle = shown ? close : () => open();

  return { section: shown ? section : null, open, select: setSection, toggle, close };
}

function activeElement(): HTMLElement | null {
  return document.activeElement instanceof HTMLElement ? document.activeElement : null;
}
