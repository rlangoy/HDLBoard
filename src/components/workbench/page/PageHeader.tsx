// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import type { ReactNode } from 'react';
import { CloseButton } from '../CloseButton';

export interface PageHeaderProps {
  /** The heading's id, so the page can be labelled by it. */
  titleId: string;
  icon: ReactNode;
  title: string;
  subtitle: string;
  /** What Close says for screen readers, e.g. "Close settings". */
  closeLabel: string;
  onClose: () => void;
  /** Shown at the right, before the close button. */
  children?: ReactNode;
}

/** A page's badge, title and subtitle, what the page adds at the right, and the way out (Esc). */
export function PageHeader({ titleId, icon, title, subtitle, closeLabel, onClose, children }: PageHeaderProps) {
  return (
    <header className="wb-page__header">
      <span className="wb-page__badge" aria-hidden="true">{icon}</span>
      <div className="wb-page__heading">
        <h2 id={titleId}>{title}</h2>
        <p>{subtitle}</p>
      </div>
      <div className="wb-page__header-end">
        {children}
        <CloseButton label={closeLabel} hint="Back to the workspace (Esc)" onClick={onClose} />
      </div>
    </header>
  );
}
