// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import type { ReactNode } from 'react';
import { cx } from '../board';
import { PlayIcon, StopIcon } from './icons';
import type { SimStatus } from './SimulationCard';
import './ActivityBar.css';

export interface ActivityBarProps {
  /** The window edge the rail runs down; its active marker sits on that edge. */
  side: 'left' | 'right';
  /** What the rail is, for screen readers. */
  label: string;
  children: ReactNode;
}

/**
 * A narrow, full-height icon rail on one edge of the workbench, as in an
 * IDE: one button per side pane to show or hide it, and room for actions
 * that have to stay in reach while that pane is shut.
 */
export function ActivityBar({ side, label, children }: ActivityBarProps) {
  return (
    <nav className={cx('wb-activitybar', `wb-activitybar--${side}`)} aria-label={label}>
      {children}
    </nav>
  );
}

export interface ActivityBarToggleProps {
  /** The pane's name, e.g. "Explorer". */
  label: string;
  /** Whether the pane it controls is open — drawn as the active marker. */
  open: boolean;
  /** The pane's element id. */
  controls: string;
  /** The keyboard shortcut that does the same, for the tooltip. */
  shortcut?: string;
  onToggle: () => void;
  icon: ReactNode;
}

/** Shows or hides one side pane. */
export function ActivityBarToggle({ label, open, controls, shortcut, onToggle, icon }: ActivityBarToggleProps) {
  const action = `${open ? 'Hide' : 'Show'} ${label}`;
  return (
    <button
      type="button"
      className={cx('wb-activitybar__item', open && 'is-active')}
      aria-label={label}
      aria-expanded={open}
      aria-controls={controls}
      title={shortcut ? `${action} (${shortcut})` : action}
      onClick={onToggle}
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
