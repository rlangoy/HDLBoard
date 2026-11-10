// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import { useId, useState, type ReactNode } from 'react';
import { cx } from '../../board';
import { ChevronDownIcon } from '../icons';

export interface PageCardProps {
  title: string;
  /** Drawn before the title, in the accent colour. */
  icon?: ReactNode;
  /** Spans every column of the section's grid. */
  wide?: boolean;
  /** What the head holds at its right, e.g. a status. */
  headEnd?: ReactNode;
  children: ReactNode;
}

/** One group of related things on a page: a titled card in the style of the board's panels. */
export function PageCard({ title, icon, wide, headEnd, children }: PageCardProps) {
  const titleId = useId();
  return (
    <section className={cx('wb-page-card', wide && 'wb-page-card--wide')} aria-labelledby={titleId}>
      <div className="wb-page-card__head">
        <h3 id={titleId} className="wb-page-card__title">
          {icon && <span className="wb-page-card__icon" aria-hidden="true">{icon}</span>}
          {title}
        </h3>
        {headEnd}
      </div>
      <div className="wb-page-card__body">{children}</div>
    </section>
  );
}

export interface FoldingPageCardProps extends Pick<PageCardProps, 'title' | 'icon' | 'children'> {
  /** Unfolds the card (and keeps it open), e.g. for a field in it that is to get the focus. */
  unfold?: boolean;
}

/** A card whose title folds its body away and back; it starts open. */
export function FoldingPageCard({ title, icon, unfold = false, children }: FoldingPageCardProps) {
  const titleId = useId();
  const bodyId = useId();
  const [open, setOpen] = useState(true);
  // Set while rendering, so the body is shown before its children's effects run (a focus, say).
  if (unfold && !open) setOpen(true);
  return (
    <section className={cx('wb-page-card', !open && 'is-folded')} aria-labelledby={titleId}>
      <div className="wb-page-card__head">
        <h3 className="wb-page-card__title">
          <button type="button" id={titleId} className="wb-page-card__toggle" aria-expanded={open} aria-controls={bodyId} onClick={() => setOpen(!open)}>
            {icon && <span className="wb-page-card__icon" aria-hidden="true">{icon}</span>}
            {title}
            <ChevronDownIcon className="wb-page-card__chevron" aria-hidden="true" />
          </button>
        </h3>
      </div>
      <div id={bodyId} className="wb-page-card__body" hidden={!open}>{children}</div>
    </section>
  );
}
