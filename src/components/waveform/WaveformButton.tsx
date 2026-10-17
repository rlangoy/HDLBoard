// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * The Waveform button, directly to the left of Clear in the Simulator Output / Status
 * band (docs/waveform_viewer_spec.md § 8.6, FR-24): where the run's result is reported,
 * so it is always clear where to go (S2). Disabled with its reason when there is nothing
 * to show, highlighted when a new waveform is ready, pressed while the view is open.
 */

import { cx } from '../board';
import { BUTTON_TOOLTIP, type ButtonState } from './waveState';

export interface WaveformButtonProps {
  readonly state: ButtonState;
  onToggle(): void;
}

export function WaveformIcon() {
  return (
    <svg className="wv-launch__icon" viewBox="0 0 16 16" aria-hidden="true">
      <path d="M1 11h3V5h3v6h3V5h3v6h2" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  );
}

export function WaveformButton({ state, onToggle }: WaveformButtonProps) {
  return (
    <button
      type="button"
      className={cx('wv-launch', state === 'new' && 'is-new', state === 'pressed' && 'is-pressed')}
      aria-pressed={state === 'pressed'}
      disabled={state === 'disabled'}
      title={BUTTON_TOOLTIP[state]}
      onClick={onToggle}
    >
      <WaveformIcon />
      Waveform
      {state === 'new' && <span className="wv-launch__dot" aria-label="new" />}
    </button>
  );
}
