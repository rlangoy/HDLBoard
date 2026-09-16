import { forwardRef, type HTMLAttributes } from 'react';
import { cx, scaleStyle, type Bit } from '../board';
import { segmentsToPattern, type SegmentVector } from './segments';
import '../board/tokens.css';
import './SevenSegmentDisplay.css';

/** Which CSS class draws each segment, indexed by the board's bit number. */
const SEGMENT_SHAPE = [
  'h', // 0 top
  'v', // 1 top right
  'v', // 2 bottom right
  'h', // 3 bottom
  'v', // 4 bottom left
  'v', // 5 top left
  'h', // 6 middle
] as const;

type NativeProps = Omit<HTMLAttributes<HTMLElement>, 'color'>;

export interface SevenSegmentDisplayProps extends NativeProps {
  /**
   * The segment word, LSB first: `segments[n]` drives segment *n*, the
   * same way `HEX0[n]` does. **Not** the number to display — feed it
   * `nibbleToSegments(value)` if that is what you have.
   */
  segments: SegmentVector;
  /**
   * `true` (default): a `0` lights a segment, as on the DE-board. Set
   * false for a common-cathode part where `1` lights.
   */
  activeLow?: boolean;
  /** Accessible name, e.g. `"HEX0"`. */
  label?: string;
  /**
   * Board scale unit (the switch housing width). The package is
   * 1.862 × this wide and 2.621 × this tall. Number = pixels.
   */
  size?: number | string;
}

/**
 * One 7-segment display module, drawn to match
 * `DesignResources/7SegmentDisplays.png`.
 *
 * The input is the segment word, not a digit: this is the component that
 * makes a wrong decoder table *look* wrong, which is the whole point of
 * having it in a VHDL course.
 */
export const SevenSegmentDisplay = forwardRef<
  HTMLSpanElement,
  SevenSegmentDisplayProps
>(function SevenSegmentDisplay(
  { segments, activeLow = true, label, size, className, style, ...rest },
  ref,
) {
  const onLevel: Bit = activeLow ? 0 : 1;

  return (
    <span
      {...rest}
      ref={ref}
      role="img"
      aria-label={label ? `${label} ${segmentsToPattern(segments)}` : undefined}
      className={cx('pb-ui', 'pb-hex', className)}
      style={scaleStyle(size, style)}
    >
      <span className="pb-hex__digit">
        {SEGMENT_SHAPE.map((shape, index) => (
          <span
            key={index}
            className={cx(
              'pb-hex__seg',
              `pb-hex__seg--${shape}`,
              `pb-hex__seg--s${index}`,
              segments[index] === onLevel && 'is-lit',
            )}
          />
        ))}
      </span>
      {/* Moulded into the package; the board has no bit for it. */}
      <span className="pb-hex__dp" />
    </span>
  );
});

export default SevenSegmentDisplay;
