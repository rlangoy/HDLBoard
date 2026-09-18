// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import {
  forwardRef,
  useCallback,
  type ButtonHTMLAttributes,
  type FocusEvent,
  type KeyboardEvent,
  type PointerEvent,
} from 'react';
import { cx, scaleStyle } from '../board';
import '../board/tokens.css';
import './Pushbutton.css';

type NativeButtonProps = Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  'onChange' | 'value' | 'type' | 'aria-pressed'
>;

export interface PushbuttonProps extends NativeButtonProps {
  /** Held down when true. Always controlled — the panel owns the state. */
  pressed: boolean;
  /** Called with the new pressed state on press and on release. */
  onPressedChange?: (pressed: boolean) => void;
  /**
   * Momentary (default): held only while the pointer or key is down,
   * like the real part. Set false to make it latch on each press, which
   * is useful when a value has to stay put during a demo.
   */
  momentary?: boolean;
  /** Accessible name, e.g. `"KEY0"`. */
  label?: string;
  /**
   * Board scale unit (the switch housing width). The pushbutton is
   * 1.862 × this square. Number = pixels.
   */
  size?: number | string;
  disabled?: boolean;
}

const isActivationKey = (key: string) => key === ' ' || key === 'Enter';

/**
 * A single momentary pushbutton.
 *
 * At rest it reproduces `DesignResources/PushButtons.png`. The four
 * states — normal, hover, pressed, pressed + hover — follow
 * `DesignResources/PushButtonStates.png`: hover comes from `:hover` and
 * pressed from a class, so "pressed + hover" is just both at once.
 */
export const Pushbutton = forwardRef<HTMLButtonElement, PushbuttonProps>(
  function Pushbutton(
    {
      pressed,
      onPressedChange,
      momentary = true,
      label,
      size,
      disabled,
      className,
      style,
      onPointerDown,
      onPointerUp,
      onPointerCancel,
      onKeyDown,
      onKeyUp,
      onBlur,
      ...rest
    },
    ref,
  ) {
    /** Momentary: down/up. Latching: flip on the down edge only. */
    const begin = useCallback(() => {
      if (disabled) return;
      if (momentary) {
        if (!pressed) onPressedChange?.(true);
      } else {
        onPressedChange?.(!pressed);
      }
    }, [disabled, momentary, onPressedChange, pressed]);

    const end = useCallback(() => {
      if (disabled || !momentary || !pressed) return;
      onPressedChange?.(false);
    }, [disabled, momentary, onPressedChange, pressed]);

    const handlePointerDown = (event: PointerEvent<HTMLButtonElement>) => {
      onPointerDown?.(event);
      if (event.defaultPrevented || event.button !== 0) return;
      // Capture, so releasing outside the button still ends the press.
      event.currentTarget.setPointerCapture(event.pointerId);
      begin();
    };

    const handlePointerUp = (event: PointerEvent<HTMLButtonElement>) => {
      onPointerUp?.(event);
      end();
    };

    const handlePointerCancel = (event: PointerEvent<HTMLButtonElement>) => {
      onPointerCancel?.(event);
      end();
    };

    const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
      onKeyDown?.(event);
      if (event.defaultPrevented || !isActivationKey(event.key)) return;
      // Space would scroll the page; this button is handling it.
      event.preventDefault();
      if (!event.repeat) begin();
    };

    const handleKeyUp = (event: KeyboardEvent<HTMLButtonElement>) => {
      onKeyUp?.(event);
      if (isActivationKey(event.key)) end();
    };

    const handleBlur = (event: FocusEvent<HTMLButtonElement>) => {
      onBlur?.(event);
      // Losing focus mid-press must not leave the button stuck down.
      end();
    };

    return (
      <button
        {...rest}
        ref={ref}
        type="button"
        aria-pressed={pressed}
        aria-label={label}
        disabled={disabled}
        onPointerDown={handlePointerDown}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerCancel}
        onKeyDown={handleKeyDown}
        onKeyUp={handleKeyUp}
        onBlur={handleBlur}
        className={cx('pb-ui', 'pb-key', pressed && 'is-pressed', className)}
        style={scaleStyle(size, style)}
      >
        <span className="pb-key__cap" />
      </button>
    );
  },
);

export default Pushbutton;
