// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import { useEffect, useRef, type KeyboardEvent, type ReactNode } from 'react';
import { cx } from '../../board';
import './Page.css';

export interface PageProps {
  /** The page's own class, beside `wb-page`. */
  className: string;
  /** The id of the page's heading (PageHeader). */
  titleId: string;
  /** Esc, as Back to workspace and the close button do. */
  onClose: () => void;
  /** The PageSidebar. */
  sidebar: ReactNode;
  /** The header and the section shown. */
  children: ReactNode;
}

/**
 * A page in the editor's place (Settings, Projects): a sidebar beside a header and the
 * chosen section. It takes the keyboard focus as it opens, unless a field in it already
 * has it, so Escape closes it and Tab walks it.
 */
export function Page({ className, titleId, onClose, sidebar, children }: PageProps) {
  const root = useRef<HTMLElement>(null);
  useEffect(() => {
    const page = root.current;
    if (page && !page.contains(document.activeElement)) page.focus();
  }, []);
  const closeOnEscape = (event: KeyboardEvent) => {
    // Esc in an open dropdown only closes the dropdown.
    if (event.key !== 'Escape' || event.defaultPrevented || event.target instanceof HTMLSelectElement) return;
    event.preventDefault();
    onClose();
  };
  return (
    <section ref={root} className={cx('wb-page', className)} tabIndex={-1} aria-labelledby={titleId} onKeyDown={closeOnEscape}>
      <div className="wb-page__frame">
        {sidebar}
        <div className="wb-page__main">{children}</div>
      </div>
    </section>
  );
}
