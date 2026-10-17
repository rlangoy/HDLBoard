// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * The Waveform button, directly to the left of Clear in the Simulator Output / Status
 * band (docs/waveform_viewer_spec.md § 8.6, FR-24): where the run's result is reported,
 * so it is always clear where to go (S2). Highlighted when a new waveform is ready,
 * pressed while the view is open. With nothing to show it still answers: with a
 * testbench on screen the click runs it and opens its waveform (`runsTestbench`),
 * otherwise it explains what to run first.
 */

import { cx } from '../board';
import { BUTTON_TOOLTIP, type ButtonState } from './waveState';

export interface WaveformButtonProps {
  readonly state: ButtonState;
  /** With nothing to show, a click runs the testbench on screen and then opens its waveform. */
  readonly runsTestbench?: boolean;
  onToggle(): void;
}

export function WaveformIcon() {
  return (
    <svg className="wv-launch__icon" viewBox="0 0 16 16" aria-hidden="true">
      <path d="M1 11h3V5h3v6h3V5h3v6h2" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  );
}

const RUNS_TESTBENCH_TOOLTIP = 'Run the testbench and show its waveform';

/** The look and the tooltip: with a testbench to run, an empty button reads as ready, not greyed out. */
function lookOf(state: ButtonState, runsTestbench: boolean) {
  const runs = state === 'empty' && runsTestbench;
  return {
    className: cx('wv-launch', state === 'empty' && !runs && 'is-empty', state === 'new' && 'is-new', state === 'pressed' && 'is-pressed'),
    title: runs ? RUNS_TESTBENCH_TOOLTIP : BUTTON_TOOLTIP[state],
  };
}

export function WaveformButton({ state, runsTestbench = false, onToggle }: WaveformButtonProps) {
  const { className, title } = lookOf(state, runsTestbench);
  return (
    <button
      type="button"
      className={className}
      aria-pressed={state === 'pressed'}
      title={title}
      onClick={onToggle}
    >
      <WaveformIcon />
      Waveform
      {state === 'new' && <span className="wv-launch__dot" aria-label="new" />}
    </button>
  );
}
