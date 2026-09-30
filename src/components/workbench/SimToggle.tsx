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
  /** Start when showing Play, stop when showing Stop. */
  onClick: () => void;
  className?: string;
}

/** The one-click play/stop icon on the editor's active tab. */
export function SimToggle({ running, disabled = false, fileName, onClick, className }: SimToggleProps) {
  const label = running ? `Stop simulation of ${fileName}` : `Start simulation with ${fileName} as top`;
  return (
    <button
      type="button"
      className={cx('wb-simtoggle', className)}
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={(e) => {
        // Inside an editor tab: pressing the icon must not also count as a click on the tab.
        e.stopPropagation();
        onClick();
      }}
    >
      {running ? <StopIcon aria-hidden="true" /> : <PlayIcon aria-hidden="true" />}
    </button>
  );
}

export default SimToggle;
