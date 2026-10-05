// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import { cx } from '../board';
import { PlayIcon, StopIcon } from './icons';
import './SimToggle.css';

export interface SimToggleProps {
  /** Shows Stop while true, Play otherwise. */
  running: boolean;
  /** Greyed out and inert — while a run is still compiling, as the Start button is. */
  disabled?: boolean;
  /** The file Play runs as top (or Stop stops), for the tooltip and screen readers. */
  fileName: string;
  /**
   * Why Play cannot start now (another simulation runs): greyed out, but still
   * focusable so the reason is read (docs/cleanup_file_tabs.md D8).
   */
  blockedReason?: string;
  /** Start when showing Play, stop when showing Stop. */
  onClick: () => void;
  className?: string;
}

/** The one-click play/stop icon in an editor pane's header. */
export function SimToggle({ running, disabled = false, fileName, blockedReason, onClick, className }: SimToggleProps) {
  const action = running ? `Stop simulation of ${fileName}` : `Start simulation with ${fileName} as top`;
  return (
    <button
      type="button"
      className={cx('wb-simtoggle', blockedReason && 'is-blocked', className)}
      aria-label={blockedReason ? `${action}. ${blockedReason}.` : action}
      aria-disabled={blockedReason ? true : undefined}
      title={blockedReason ?? action}
      disabled={disabled}
      onClick={() => {
        if (!blockedReason) onClick();
      }}
    >
      {running ? <StopIcon aria-hidden="true" /> : <PlayIcon aria-hidden="true" />}
    </button>
  );
}

export default SimToggle;
