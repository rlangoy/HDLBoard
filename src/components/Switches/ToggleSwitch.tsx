// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import {
  forwardRef,
  useCallback,
  useState,
  type ButtonHTMLAttributes,
  type CSSProperties,
} from 'react';
import '../board/tokens.css';
import './ToggleSwitch.css';

type NativeButtonProps = Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  'onChange' | 'value' | 'defaultValue' | 'type' | 'role' | 'aria-checked'
>;

export interface ToggleSwitchProps extends NativeButtonProps {
  /** Controlled state. Omit to let the component own its state. */
  checked?: boolean;
  /** Initial state when uncontrolled. Default `false`. */
  defaultChecked?: boolean;
  /** Fired on every user-driven change with the new state. */
  onChange?: (checked: boolean) => void;
  /** Accessible name, e.g. `"SW3"`. */
  label?: string;
  /**
   * Housing width. Everything else is derived from it, so this is the
   * only knob needed to scale the switch. Number = pixels.
   * Default: the inherited `--pb-sw-size` (34px).
   */
  size?: number | string;
  /**
   * Swap which end of the slot means "on". By default the knob sits at
   * the TOP for `checked`, the way the reference render shows it.
   */
  flip?: boolean;
}

const toLength = (v: number | string): string =>
  typeof v === 'number' ? `${v}px` : v;

/**
 * A single physical-looking slide switch.
 *
 * Renders as a `<button role="switch">`, so Space/Enter toggle it and
 * screen readers announce on/off without any extra wiring.
 */
export const ToggleSwitch = forwardRef<HTMLButtonElement, ToggleSwitchProps>(
  function ToggleSwitch(
    {
      checked,
      defaultChecked = false,
      onChange,
      label,
      size,
      flip = false,
      disabled,
      className,
      style,
      onClick,
      ...rest
    },
    ref,
  ) {
    const [internal, setInternal] = useState<boolean>(defaultChecked);
    const isControlled = checked !== undefined;
    const isOn = isControlled ? checked : internal;

    const handleClick = useCallback<
      NonNullable<ButtonHTMLAttributes<HTMLButtonElement>['onClick']>
    >(
      (event) => {
        onClick?.(event);
        if (event.defaultPrevented || disabled) return;
        const next = !isOn;
        if (!isControlled) setInternal(next);
        onChange?.(next);
      },
      [disabled, isControlled, isOn, onChange, onClick],
    );

    // `flip` only changes which end of the slot represents `true`.
    const knobUp = flip ? !isOn : isOn;

    const mergedStyle: CSSProperties | undefined =
      size === undefined
        ? style
        : ({ ...style, '--pb-unit': toLength(size) } as CSSProperties);

    return (
      <button
        {...rest}
        ref={ref}
        type="button"
        role="switch"
        aria-checked={isOn}
        aria-label={label}
        disabled={disabled}
        onClick={handleClick}
        style={mergedStyle}
        className={[
          'pb-ui',
          'pb-switch',
          knobUp ? 'is-on' : '',
          isOn ? 'is-checked' : '',
          className ?? '',
        ]
          .filter(Boolean)
          .join(' ')}
      >
        <span className="pb-switch__body">
          <span className="pb-switch__track" />
          <span className="pb-switch__knob" />
        </span>
      </button>
    );
  },
);

export default ToggleSwitch;
