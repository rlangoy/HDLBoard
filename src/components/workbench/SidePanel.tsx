// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import type { ReactNode } from 'react';
import { cx } from '../board';
import { PanelCloseIcon } from './icons';
import './SidePanel.css';

export interface SidePanelProps {
  /**
   * The element id the activity-bar button and the divider point at
   * (aria-controls); the hide button is `${id}-hide`.
   */
  id: string;
  /** Which edge of the window the pane sits against — it slides shut towards it. */
  side: 'left' | 'right';
  /** The pane's name, shown in its header and read out for the region. */
  title: string;
  /** The width the pane is (or reopens) at, in rendered pixels. */
  width: number;
  collapsed: boolean;
  /** The header's hide button. */
  onCollapse: () => void;
  /** The keyboard shortcut that toggles the pane, for the hide button's tooltip. */
  shortcut?: string;
  className?: string;
  bodyClassName?: string;
  children: ReactNode;
}

/**
 * One of the workbench's two side panes: a titled, collapsible region. It
 * collapses to zero width rather than unmounting, so its contents keep their
 * state (scroll position, a rename in progress, folder folds), and its inner
 * column keeps the open width throughout, so the contents slide out of view
 * instead of reflowing on the way.
 */
export function SidePanel({
  id,
  side,
  title,
  width,
  collapsed,
  onCollapse,
  shortcut,
  className,
  bodyClassName,
  children,
}: SidePanelProps) {
  const hideLabel = `Hide ${title}`;
  const heading = <h2 className="wb-sidepanel__title">{title}</h2>;
  const hideButton = (
    <button
      type="button"
      id={`${id}-hide`}
      className="wb-sidepanel__hide"
      aria-label={hideLabel}
      title={shortcut ? `${hideLabel} (${shortcut})` : hideLabel}
      aria-controls={id}
      aria-expanded={!collapsed}
      onClick={onCollapse}
    >
      <PanelCloseIcon side={side} aria-hidden="true" />
    </button>
  );
  return (
    <aside
      id={id}
      className={cx('wb-sidepanel', `wb-sidepanel--${side}`, collapsed && 'is-collapsed', className)}
      style={{ width: collapsed ? 0 : width }}
      aria-label={title}
    >
      <div className="wb-sidepanel__inner" style={{ width }}>
        {/* The hide button sits on the pane's inner edge, beside the editor:
            after the title on a left pane, before it on a right one. */}
        <div className="wb-sidepanel__header">
          {side === 'left' ? (
            <>
              {heading}
              {hideButton}
            </>
          ) : (
            <>
              {hideButton}
              {heading}
            </>
          )}
        </div>
        <div className={cx('wb-sidepanel__body', bodyClassName)}>{children}</div>
      </div>
    </aside>
  );
}

export default SidePanel;
