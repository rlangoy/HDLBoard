// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * The close button of a full view – the waveform, the Projects page, Project settings
 * (docs/images/head_moc1.png): a dark ✕ on a stronger grey circle, a little larger than
 * the buttons beside it, so the way back to the code always looks the same and stands out.
 */

import { CloseIcon } from './icons';
import './CloseButton.css';

export interface CloseButtonProps {
  /** What the button closes, for screen readers: `Close the waveform`. */
  readonly label: string;
  /** The tooltip: what closing does, and its key. */
  readonly hint: string;
  readonly onClick: () => void;
}

export function CloseButton({ label, hint, onClick }: CloseButtonProps) {
  return (
    <button type="button" className="hdl-close-button" aria-label={label} title={hint} onClick={onClick}>
      <CloseIcon aria-hidden="true" />
    </button>
  );
}
