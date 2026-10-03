// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import type { ReactNode } from 'react';
import { cx } from '../board';
import { PlayIcon, StopIcon } from './icons';
import type { SimStatus } from './SimulationCard';
import './ActivityBar.css';

export interface ActivityBarProps {
  /** The window edge the rail runs down. */
  side: 'left' | 'right';
  /** What the rail is, for screen readers. */
  label: string;
  /** True while the pane the rail stands in for is open: the rail slides away. */
  hidden: boolean;
  children: ReactNode;
}

/**
 * A narrow icon rail on one edge of the workbench, as in an IDE, standing in
 * for a shut side pane: the button that opens it again, and the actions that
 * have to stay in reach while it is shut. It shows only while that pane is
 * shut — open, the pane carries all of it — and stays mounted either way, so
 * it can slide in and out with the pane.
 */
export function ActivityBar({ side, label, hidden, children }: ActivityBarProps) {
  return (
    <nav
      className={cx('wb-activitybar', `wb-activitybar--${side}`, hidden && 'is-hidden')}
      aria-label={label}
      aria-hidden={hidden || undefined}
    >
      <div className="wb-activitybar__inner">{children}</div>
    </nav>
  );
}

export interface ActivityBarShowProps {
  /** The element id, which the pane's own Hide button hands focus back to. */
  id: string;
  /** The pane's name, e.g. "Explorer". */
  label: string;
  /** The pane's element id. */
  controls: string;
  /** The keyboard shortcut that does the same, for the tooltip. */
  shortcut?: string;
  onShow: () => void;
  icon: ReactNode;
}

/** Opens the shut side pane the rail stands in for. */
export function ActivityBarShow({ id, label, controls, shortcut, onShow, icon }: ActivityBarShowProps) {
  const action = `Show ${label}`;
  return (
    <button
      type="button"
      id={id}
      className="wb-activitybar__item"
      aria-label={action}
      aria-expanded={false}
      aria-controls={controls}
      title={shortcut ? `${action} (${shortcut})` : action}
      onClick={onShow}
    >
      {icon}
    </button>
  );
}

export interface ActivityBarRunProps {
  status: SimStatus;
  /** The top file a Start would run, for the tooltip. */
  topFile: string;
  onStart: () => void;
  onStop: () => void;
}

const RUN_TITLE: Record<SimStatus, (topFile: string) => string> = {
  stopped: (topFile) => `Start simulation (Top: ${topFile})`,
  compiling: () => 'Compiling…',
  running: () => 'Stop simulation',
};

/**
 * The Simulation card's Start/Stop, kept on the rail so a run can be started
 * or stopped with the Explorer shut. A dot on its corner carries the status:
 * amber while compiling, green while running.
 */
export function ActivityBarRun({ status, topFile, onStart, onStop }: ActivityBarRunProps) {
  const running = status === 'running';
  const title = RUN_TITLE[status](topFile);
  return (
    <button
      type="button"
      className={cx('wb-activitybar__item', 'wb-activitybar__run', `is-${status}`)}
      aria-label={title}
      title={title}
      disabled={status === 'compiling'}
      onClick={running ? onStop : onStart}
    >
      {running ? <StopIcon aria-hidden="true" /> : <PlayIcon aria-hidden="true" />}
      <span className="wb-activitybar__badge" aria-hidden="true" />
    </button>
  );
}

/** A short rule between groups of rail items. */
export function ActivityBarSeparator() {
  return <span className="wb-activitybar__separator" aria-hidden="true" />;
}

export default ActivityBar;
