// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import { useEffect, useState } from 'react';
import { usePageState, type OverlayControl, type PageState } from '../page/usePageState';
import { FIRST_SECTION, type ProjectsSectionId } from './projectsSections';

/** The active project's name field, asked for: by Rename…, or by a save stopped for want of a name. */
export interface NameAsk {
  /** A save was stopped for want of a name: the field shows it as missing. */
  readonly missing: boolean;
  /** The focus is to move to the name field; onFocused says it has. */
  readonly focusPending: boolean;
  readonly onFocused: () => void;
  /** Shows the name field in Active project; `missing` when a save was stopped for want of a name. */
  readonly ask: (missing: boolean) => void;
}

export interface ProjectsPageState extends PageState<ProjectsSectionId> {
  readonly nameAsk: NameAsk;
}

/**
 * The Projects page, in the editor's place like Settings; the project in Explorer opens it
 * at the active project. The Explorer and Board I/O fold away while it is shown
 * (usePageFold, paneFolds.ts). `needsName`: the open project has no name of its own yet.
 */
export function useProjectsPage(control: OverlayControl, needsName: boolean): ProjectsPageState {
  const page = usePageState('projects', FIRST_SECTION, control);
  const [missing, setMissing] = useState(false);
  const [focusPending, setFocusPending] = useState(false);
  useEffect(() => {
    if (!needsName) setMissing(false);
  }, [needsName]);
  const ask = (markMissing: boolean) => {
    page.open('active');
    setFocusPending(true);
    if (markMissing) setMissing(true);
  };
  return { ...page, nameAsk: { missing: needsName && missing, focusPending, onFocused: () => setFocusPending(false), ask } };
}
