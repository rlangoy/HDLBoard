import { useMemo, type CSSProperties, type HTMLAttributes } from 'react';
import { BitRow, Panel, Readout, cx, scaleStyle } from '../board';
import { SevenSegmentDisplay } from './SevenSegmentDisplay';
import {
  SEGMENT_COUNT,
  blankSegments,
  segmentsToHexByte,
  type SegmentVector,
} from './segments';
import '../board/tokens.css';

type NativeProps = Omit<
  HTMLAttributes<HTMLElement>,
  'onChange' | 'defaultValue' | 'title' | 'color'
>;

export interface SevenSegmentDisplaysProps extends NativeProps {
  /** Number of displays. Default `6` (HEX[5:0]). */
  count?: number;
  /**
   * One segment word per display, **display 0 first** — `value[0]` is
   * `HEX0`. Each word is 7 bits LSB first, so `value[0][6]` is
   * `HEX0[6]`, the middle segment. Missing entries blank their display.
   */
  value?: SegmentVector[];
  /** `true` (default): a `0` lights a segment, as on the DE-board. */
  activeLow?: boolean;
  /** Signal name used in the title, labels and readout. Default `"HEX"`. */
  name?: string;
  /** Override the card title. Default: `` `7-Segment Displays (HEX[5:0])` ``. */
  title?: string;
  /** Draw the card chrome. Default `true`. */
  framed?: boolean;
  /** Show the hex readout under the row. Default `true`. */
  showReadout?: boolean;
  /** Show the `HEX5 … HEX0` labels above the displays. Default `true`. */
  showIndices?: boolean;
  /** Board scale unit (the switch housing width). Default `34`. */
  size?: number | string;
}

/**
 * The HEX[5:0] display row, drawn to match
 * `DesignResources/7SegmentDisplays.png`.
 *
 * Display-only: on a real board these are driven by the design, so there
 * is nothing to click and no `onChange`.
 */
export function SevenSegmentDisplays({
  count = 6,
  value,
  activeLow = true,
  name = 'HEX',
  title,
  framed = true,
  showReadout = true,
  showIndices = true,
  size,
  className,
  style,
  ...rest
}: SevenSegmentDisplaysProps) {
  /** Exactly `count` words of exactly SEGMENT_COUNT bits, blank-filled. */
  const displays = useMemo<SegmentVector[]>(() => {
    const dark = blankSegments();
    return Array.from({ length: count }, (_, display) =>
      Array.from(
        { length: SEGMENT_COUNT },
        (_unused, bit) => value?.[display]?.[bit] ?? dark[bit],
      ),
    );
  }, [count, value]);

  const heading = title ?? `7-Segment Displays (${name}[${count - 1}:0])`;

  // HEX columns have their own pitch, and the readout prints six hex
  // bytes rather than single bits, so it needs tighter tracking.
  const layout = {
    '--pb-cell-w': 'var(--pb-hex-pitch)',
    '--pb-part-w': 'var(--pb-hex-w)',
    '--pb-index-size': 'calc(var(--pb-unit) * 0.46)',
    '--pb-readout-tracking': 'calc(var(--pb-unit) * 0.055)',
  } as CSSProperties;

  // MSB display first, matching the labels and the silkscreen.
  const readout = displays
    .map(segmentsToHexByte)
    .reverse()
    .join(' ');

  return (
    <Panel
      {...rest}
      heading={heading}
      accent="hex"
      framed={framed}
      className={cx('pb-sevenseg', className)}
      style={{ ...scaleStyle(size, style), ...layout }}
    >
      <BitRow
        count={count}
        showIndices={showIndices}
        ariaLabel={heading}
        formatIndex={(i) => `${name}${i}`}
        renderBit={(i) => (
          <SevenSegmentDisplay
            segments={displays[i]}
            activeLow={activeLow}
            label={`${name}${i}`}
          />
        )}
      />
      {showReadout && <Readout name={name} text={readout} />}
    </Panel>
  );
}

export default SevenSegmentDisplays;
