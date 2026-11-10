// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import type { ReactNode } from 'react';
import { ArrowLeftIcon } from '../icons';

export interface PageNavEntry<Id extends string> {
  readonly id: Id;
  readonly label: string;
  readonly icon: ReactNode;
  /** A dot on the icon, and this said to screen readers, e.g. "Unsaved changes". */
  readonly marker?: string;
}

export interface PageSidebarProps<Id extends string> {
  /** What the navigation is called for screen readers, e.g. "Settings sections". */
  label: string;
  /** The entries, in groups ruled off from each other. */
  groups: readonly (readonly PageNavEntry<Id>[])[];
  current: Id;
  onSelect: (id: Id) => void;
  onBack: () => void;
}

/** The way back to the workspace, then one entry per section; the current one is marked. */
export function PageSidebar<Id extends string>({ label, groups, current, onSelect, onBack }: PageSidebarProps<Id>) {
  return (
    <aside className="wb-page__sidebar">
      <button type="button" className="wb-page__back" onClick={onBack}>
        <ArrowLeftIcon aria-hidden="true" />
        Back to workspace
      </button>
      <nav className="wb-page-nav" aria-label={label}>
        {groups.map((entries) => (
          <ul key={entries[0]?.id}>
            {entries.map((entry) => (
              <li key={entry.id}>
                <button
                  type="button"
                  className="wb-page-nav__item"
                  aria-current={entry.id === current ? 'page' : undefined}
                  onClick={() => onSelect(entry.id)}
                >
                  <span className="wb-page-nav__icon">
                    {entry.icon}
                    {entry.marker && <span className="wb-page-nav__dot" title={entry.marker} />}
                  </span>
                  {entry.label}
                  {entry.marker && <span className="wb-page__sr">, {entry.marker}</span>}
                </button>
              </li>
            ))}
          </ul>
        ))}
      </nav>
    </aside>
  );
}
