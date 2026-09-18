// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import type { CSSProperties, HTMLAttributes, ReactNode } from 'react';
import './tokens.css';
import './panel.css';

export type Accent = 'switches' | 'leds' | 'hex' | 'keys';

export const toLength = (v: number | string): string =>
  typeof v === 'number' ? `${v}px` : v;

/** Build the inline style that overrides the board scale unit. */
export const scaleStyle = (
  size: number | string | undefined,
  style: CSSProperties | undefined,
): CSSProperties | undefined =>
  size === undefined
    ? style
    : ({ ...style, '--pb-unit': toLength(size) } as CSSProperties);

export const cx = (...parts: (string | false | undefined)[]): string =>
  parts.filter(Boolean).join(' ');

export interface PanelProps extends Omit<HTMLAttributes<HTMLElement>, 'title'> {
  heading: string;
  accent: Accent;
  /** Draw the card chrome. When false, only the contents are rendered. */
  framed?: boolean;
  children: ReactNode;
}

/**
 * The card every board group sits in: accent header band, title, body.
 * See Design_Description.md § Conventions.
 */
export function Panel({
  heading,
  accent,
  framed = true,
  children,
  className,
  ...rest
}: PanelProps) {
  const root = cx('pb-ui', `pb-accent-${accent}`, className);

  if (!framed) {
    return (
      <div {...rest} className={root}>
        {children}
      </div>
    );
  }

  return (
    <section {...rest} className={cx(root, 'pb-panel')}>
      <header className="pb-panel__header">
        <h2 className="pb-panel__title">{heading}</h2>
      </header>
      <div className="pb-panel__body">{children}</div>
    </section>
  );
}

export interface BitRowProps {
  count: number;
  /** Index label above each column. */
  showIndices?: boolean;
  /** Rendered per bit, MSB first. `index` is the VHDL index. */
  renderBit: (index: number) => ReactNode;
  /** Label above each column. Default: the bare index, e.g. `3`. */
  formatIndex?: (index: number) => ReactNode;
  ariaLabel: string;
}

/** The row of parts plus their index labels, MSB on the left. */
export function BitRow({
  count,
  showIndices = true,
  renderBit,
  formatIndex,
  ariaLabel,
}: BitRowProps) {
  const indices = Array.from({ length: count }, (_, i) => count - 1 - i);
  return (
    <div className="pb-bank" role="group" aria-label={ariaLabel}>
      {indices.map((i) => (
        <div className="pb-bank__cell" key={i}>
          {showIndices && (
            <span className="pb-bank__index">
              {formatIndex ? formatIndex(i) : i}
            </span>
          )}
          {renderBit(i)}
        </div>
      ))}
    </div>
  );
}

export interface ReadoutProps {
  name: string;
  text: string;
}

/** `NAME:  0101010101` under the row. */
export function Readout({ name, text }: ReadoutProps) {
  return (
    <div className="pb-readout">
      <span className="pb-readout__label">{name}:</span>
      <output
        className="pb-readout__value"
        aria-live="polite"
        aria-label={`${name} value`}
      >
        {text}
      </output>
    </div>
  );
}
