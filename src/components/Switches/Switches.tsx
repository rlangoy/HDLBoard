// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import { useCallback, useMemo, useState, type HTMLAttributes } from 'react';
import {
  BitRow,
  Panel,
  Readout,
  bitsToString,
  coerceBits,
  cx,
  scaleStyle,
  zeroBits,
  type BitVector,
} from '../board';
import { ToggleSwitch } from './ToggleSwitch';
import '../board/tokens.css';

type NativeProps = Omit<
  HTMLAttributes<HTMLElement>,
  'onChange' | 'defaultValue' | 'title'
>;

export interface SwitchesProps extends NativeProps {
  /** Number of switches. Default `10` (SW[9:0]). */
  count?: number;
  /** Controlled bit vector, LSB first (`value[0]` is SW0). */
  value?: BitVector;
  /** Initial bit vector when uncontrolled. Default: all zeroes. */
  defaultValue?: BitVector;
  /** Called with the whole new vector plus the index that changed. */
  onChange?: (next: BitVector, changedIndex: number) => void;
  /** Signal name used in the title and the readout. Default `"SW"`. */
  name?: string;
  /** Override the card title. Default: `` `Switches (SW[9:0])` ``. */
  title?: string;
  /** Render the card chrome. Default `true`. */
  framed?: boolean;
  /** Show the binary readout under the bank. Default `true`. */
  showReadout?: boolean;
  /** Show the index label above each switch. Default `true`. */
  showIndices?: boolean;
  /** Board scale unit = the switch housing width. Default `34`. */
  size?: number | string;
  /** Disable every switch. */
  disabled?: boolean;
}

/**
 * The SW[9:0] switch bank, drawn to match
 * `DesignResources/Switches.png`.
 *
 * Works controlled (`value` + `onChange`) or uncontrolled
 * (`defaultValue`, optionally observing `onChange`).
 */
export function Switches({
  count = 10,
  value,
  defaultValue,
  onChange,
  name = 'SW',
  title,
  framed = true,
  showReadout = true,
  showIndices = true,
  size,
  disabled = false,
  className,
  style,
  ...rest
}: SwitchesProps) {
  const [internal, setInternal] = useState<BitVector>(
    () => defaultValue ?? zeroBits(count),
  );

  const isControlled = value !== undefined;
  const bits = useMemo<BitVector>(
    () => coerceBits(isControlled ? value : internal, count),
    [count, internal, isControlled, value],
  );

  const handleToggle = useCallback(
    (index: number, checked: boolean) => {
      const next = [...bits];
      next[index] = checked ? 1 : 0;
      if (!isControlled) setInternal(next);
      onChange?.(next, index);
    },
    [bits, isControlled, onChange],
  );

  const heading = title ?? `Switches (${name}[${count - 1}:0])`;

  return (
    <Panel
      {...rest}
      heading={heading}
      accent="switches"
      framed={framed}
      className={cx('pb-switches', className)}
      style={scaleStyle(size, style)}
    >
      <BitRow
        count={count}
        showIndices={showIndices}
        ariaLabel={heading}
        renderBit={(i) => (
          <ToggleSwitch
            label={`${name}${i}`}
            checked={bits[i] === 1}
            disabled={disabled}
            onChange={(checked) => handleToggle(i, checked)}
          />
        )}
      />
      {showReadout && <Readout name={name} text={bitsToString(bits)} />}
    </Panel>
  );
}

export default Switches;
