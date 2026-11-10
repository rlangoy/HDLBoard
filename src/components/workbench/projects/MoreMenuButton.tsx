// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import { useCallback, useState } from 'react';
import { MoreIcon } from '../icons';
import { ProjectMenu, type MenuAction } from '../ProjectMenu';

export interface MoreMenuButtonProps {
  /** What the button offers, for screen readers, e.g. "More: new project, open another". */
  label: string;
  actions: readonly MenuAction[];
}

/** A boxed ⋮ button and the menu it opens below it. */
export function MoreMenuButton({ label, actions }: MoreMenuButtonProps) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const close = useCallback(() => setAnchor(null), []);
  return (
    <>
      <button type="button" className="wb-projects__icon-btn is-boxed" onClick={(event) => setAnchor(event.currentTarget)} aria-haspopup="menu" aria-label={label}>
        <MoreIcon aria-hidden="true" />
      </button>
      {anchor && <ProjectMenu anchor={anchor} actions={actions} onClose={close} />}
    </>
  );
}
