// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import type { Bit } from '../board';
import { Pushbutton } from './Pushbutton';
import { levelWhen, releasedLevel } from './levels';
import './PushbuttonCross.css';

export interface ResetButtonProps {
  /** The pin level. */
  value: Bit;
  onChange: (next: Bit) => void;
  /** The port name, shown above the button: `CPU_RESETN`. */
  label: string;
  /** `true` (default): pressed reads `0`. */
  activeLow?: boolean;
}

/** A board's reset button: one `Pushbutton` in the reset colour, labelled with its port name. */
export function ResetButton({ value, onChange, label, activeLow = true }: ResetButtonProps) {
  return (
    <div className="pb-reset">
      <span className="pb-bank__index">{label}</span>
      <Pushbutton
        className="pb-key--reset"
        pressed={value !== releasedLevel(activeLow)}
        label={`${label} (reset)`}
        title={`${label} (reset)`}
        onPressedChange={(pressed) => onChange(levelWhen(pressed, activeLow))}
      />
    </div>
  );
}

export default ResetButton;
