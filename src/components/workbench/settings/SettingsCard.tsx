// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import { useId, type ReactNode } from 'react';
import { cx } from '../../board';

export interface SettingsCardProps {
  title: string;
  /** Spans both columns of the section's grid. */
  wide?: boolean;
  children: ReactNode;
}

/** One group of related settings: a titled card in the style of the board's panels. */
export function SettingsCard({ title, wide, children }: SettingsCardProps) {
  const titleId = useId();
  return (
    <section className={cx('wb-settings-card', wide && 'wb-settings-card--wide')} aria-labelledby={titleId}>
      <h3 id={titleId} className="wb-settings-card__title">{title}</h3>
      <div className="wb-settings-card__body">{children}</div>
    </section>
  );
}
