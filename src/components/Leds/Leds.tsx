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
import { Led, type LedColor } from './Led';
import '../board/tokens.css';

type NativeProps = Omit<
  HTMLAttributes<HTMLElement>,
  'onChange' | 'defaultValue' | 'title' | 'color'
>;

export interface LedsProps extends NativeProps {
  /** Number of LEDs. Default `10` (LEDR[9:0]). */
  count?: number;
  /** Lit pattern, LSB first (`value[0]` is LEDR0). */
  value?: BitVector;
  /** Initial pattern when uncontrolled. Default: all off. */
  defaultValue?: BitVector;
  /**
   * Only fires when `interactive` is set — LEDs are outputs, so by
   * default nothing here changes on its own.
   */
  onChange?: (next: BitVector, changedIndex: number) => void;
  /** Signal name used in the title, labels and readout. Default `"LEDR"`. */
  name?: string;
  /** Override the card title. Default: `` `LEDs (LEDR[9:0])` ``. */
  title?: string;
  /** Die colour for the whole bank. Default `"red"`. */
  color?: LedColor;
  /** Draw the card chrome. Default `true`. */
  framed?: boolean;
  /** Show the binary readout under the bank. Default `true`. */
  showReadout?: boolean;
  /** Show the index label above each LED. Default `true`. */
  showIndices?: boolean;
  /** Board scale unit (the switch housing width). Default `34`. */
  size?: number | string;
  /** Let the user click LEDs. Off by default. */
  interactive?: boolean;
  /** Disable clicking when `interactive`. */
  disabled?: boolean;
}

/**
 * The LEDR[9:0] bank, drawn to match `DesignResources/LEDs.png`.
 *
 * Normally driven: pass `value` and let the design light them. Pass
 * `interactive` to click them by hand while testing.
 */
export function Leds({
  count = 10,
  value,
  defaultValue,
  onChange,
  name = 'LEDR',
  title,
  color = 'red',
  framed = true,
  showReadout = true,
  showIndices = true,
  size,
  interactive = false,
  disabled = false,
  className,
  style,
  ...rest
}: LedsProps) {
  const [internal, setInternal] = useState<BitVector>(
    () => defaultValue ?? zeroBits(count),
  );

  const isControlled = value !== undefined;
  const bits = useMemo<BitVector>(
    () => coerceBits(isControlled ? value : internal, count),
    [count, internal, isControlled, value],
  );

  const handleToggle = useCallback(
    (index: number, next: boolean) => {
      const updated = [...bits];
      updated[index] = next ? 1 : 0;
      if (!isControlled) setInternal(updated);
      onChange?.(updated, index);
    },
    [bits, isControlled, onChange],
  );

  const heading = title ?? `LEDs (${name}[${count - 1}:0])`;

  return (
    <Panel
      {...rest}
      heading={heading}
      accent="leds"
      framed={framed}
      className={cx('pb-leds', className)}
      style={scaleStyle(size, style)}
    >
      <BitRow
        count={count}
        showIndices={showIndices}
        ariaLabel={heading}
        renderBit={(i) => (
          <Led
            on={bits[i] === 1}
            color={color}
            label={`${name}${i}`}
            interactive={interactive}
            disabled={disabled}
            onToggle={(next) => handleToggle(i, next)}
          />
        )}
      />
      {showReadout && <Readout name={name} text={bitsToString(bits)} />}
    </Panel>
  );
}

export default Leds;
