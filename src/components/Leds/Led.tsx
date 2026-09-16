import {
  forwardRef,
  type ButtonHTMLAttributes,
  type HTMLAttributes,
} from 'react';
import { cx, scaleStyle } from '../board';
import '../board/tokens.css';
import './Led.css';

export type LedColor = 'red' | 'green' | 'amber';

interface LedCommonProps {
  /** Lit when true. LEDs are outputs, so this is always controlled. */
  on: boolean;
  /** Die colour. The DE-board `LEDR` bank is `red`. */
  color?: LedColor;
  /** Accessible name, e.g. `"LEDR3"`. */
  label?: string;
  /**
   * Board scale unit (the switch housing width). The LED is 0.93 × this
   * wide and 1.138 × this tall. Number = pixels.
   */
  size?: number | string;
  /**
   * Make the LED clickable. Off by default — on a real board an LED is
   * driven by the design, not by the user. Handy for demos and for
   * hand-driving a bank while testing.
   */
  interactive?: boolean;
  onToggle?: (next: boolean) => void;
  disabled?: boolean;
}

export type LedProps = LedCommonProps &
  Omit<HTMLAttributes<HTMLElement>, 'color' | 'onToggle'>;

/**
 * A single rectangular LED.
 *
 * Unlit it reproduces `DesignResources/LEDs.png` — grey lens inside a
 * light plastic rim and a dark outer ring. Lit it turns a saturated red
 * with a hot core and a halo that spills onto the card, the way a real
 * through-hole LED looks against a pale PCB.
 */
export const Led = forwardRef<HTMLElement, LedProps>(function Led(
  {
    on,
    color = 'red',
    label,
    size,
    interactive = false,
    onToggle,
    disabled,
    className,
    style,
    ...rest
  },
  ref,
) {
  const classes = cx(
    'pb-ui',
    'pb-led',
    color !== 'red' && `pb-led--${color}`,
    on && 'is-on',
    className,
  );
  const mergedStyle = scaleStyle(size, style);
  const lens = <span className="pb-led__lens" />;

  if (interactive) {
    const buttonProps = rest as ButtonHTMLAttributes<HTMLButtonElement>;
    return (
      <button
        {...buttonProps}
        ref={ref as React.Ref<HTMLButtonElement>}
        type="button"
        role="switch"
        aria-checked={on}
        aria-label={label}
        disabled={disabled}
        onClick={(event) => {
          buttonProps.onClick?.(event);
          if (event.defaultPrevented || disabled) return;
          onToggle?.(!on);
        }}
        className={classes}
        style={mergedStyle}
      >
        {lens}
      </button>
    );
  }

  return (
    <span
      {...rest}
      ref={ref as React.Ref<HTMLSpanElement>}
      role="img"
      aria-label={label ? `${label} ${on ? 'on' : 'off'}` : undefined}
      className={classes}
      style={mergedStyle}
    >
      {lens}
    </span>
  );
});

export default Led;
