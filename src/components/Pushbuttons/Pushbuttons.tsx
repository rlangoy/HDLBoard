import {
  useCallback,
  useMemo,
  useState,
  type CSSProperties,
  type HTMLAttributes,
} from 'react';
import {
  BitRow,
  Panel,
  Readout,
  bitsToString,
  coerceBits,
  cx,
  fillBits,
  scaleStyle,
  type Bit,
  type BitVector,
} from '../board';
import { Pushbutton } from './Pushbutton';
import '../board/tokens.css';

type NativeProps = Omit<
  HTMLAttributes<HTMLElement>,
  'onChange' | 'defaultValue' | 'title'
>;

export interface PushbuttonsProps extends NativeProps {
  /** Number of buttons. Default `4` (KEY[3:0]). */
  count?: number;
  /**
   * The KEY signal, LSB first — **not** the pressed state. With the
   * default `activeLow`, a released button reads `1` and a held one
   * reads `0`, exactly as the FPGA sees it.
   */
  value?: BitVector;
  /** Initial signal when uncontrolled. Default: all released. */
  defaultValue?: BitVector;
  /** Called with the whole new signal on every press and release. */
  onChange?: (next: BitVector, changedIndex: number) => void;
  /** Signal name used in the title, labels and readout. Default `"KEY"`. */
  name?: string;
  /** Override the card title. Default: `` `Pushbuttons (KEY[3:0])` ``. */
  title?: string;
  /**
   * `true` (default): pressed reads `0`, as on the DE-board. Set false
   * for an active-high board — then the vector is 1-when-pressed and
   * the active-low note is dropped.
   */
  activeLow?: boolean;
  /**
   * Momentary (default), like the real part. Set false to latch, so a
   * value stays put while you look at what it did.
   */
  momentary?: boolean;
  /** Draw the card chrome. Default `true`. */
  framed?: boolean;
  /** Show the binary readout under the row. Default `true`. */
  showReadout?: boolean;
  /** Show the `KEY3 … KEY0` labels above the buttons. Default `true`. */
  showIndices?: boolean;
  /** Show the active-low note under the readout. Default `true`. */
  showHint?: boolean;
  /** Board scale unit (the switch housing width). Default `34`. */
  size?: number | string;
  /** Disable every button. */
  disabled?: boolean;
}

/**
 * The KEY[3:0] pushbutton row, drawn to match
 * `DesignResources/PushButtons.png`, with the interaction states from
 * `DesignResources/PushButtonStates.png`.
 *
 * `value` is the KEY signal itself, so what the readout prints is what
 * the entity port would carry — `1111` at rest, `1101` while KEY1 is
 * held.
 */
export function Pushbuttons({
  count = 4,
  value,
  defaultValue,
  onChange,
  name = 'KEY',
  title,
  activeLow = true,
  momentary = true,
  framed = true,
  showReadout = true,
  showIndices = true,
  showHint = true,
  size,
  disabled = false,
  className,
  style,
  ...rest
}: PushbuttonsProps) {
  /** The level a button sits at when nobody is touching it. */
  const restBit: Bit = activeLow ? 1 : 0;

  const [internal, setInternal] = useState<BitVector>(
    () => defaultValue ?? fillBits(count, restBit),
  );

  const isControlled = value !== undefined;
  const bits = useMemo<BitVector>(
    () => coerceBits(isControlled ? value : internal, count),
    [count, internal, isControlled, value],
  );

  const handlePressedChange = useCallback(
    (index: number, isPressed: boolean) => {
      const next = [...bits];
      next[index] = (isPressed ? 1 - restBit : restBit) as Bit;
      if (!isControlled) setInternal(next);
      onChange?.(next, index);
    },
    [bits, isControlled, onChange, restBit],
  );

  const heading = title ?? `Pushbuttons (${name}[${count - 1}:0])`;

  // KEY columns are wider than the shared pitch — four buttons, not ten,
  // so there is nothing for them to line up with.
  const layout = {
    '--pb-cell-w': 'var(--pb-key-pitch)',
    '--pb-part-w': 'var(--pb-key-w)',
    // "KEY3" is a word, not a digit — it sets in slightly smaller.
    '--pb-index-size': 'calc(var(--pb-unit) * 0.46)',
  } as CSSProperties;

  return (
    <Panel
      {...rest}
      heading={heading}
      accent="keys"
      framed={framed}
      className={cx('pb-pushbuttons', className)}
      style={{ ...scaleStyle(size, style), ...layout }}
    >
      <BitRow
        count={count}
        showIndices={showIndices}
        ariaLabel={heading}
        formatIndex={(i) => `${name}${i}`}
        renderBit={(i) => (
          <Pushbutton
            pressed={bits[i] !== restBit}
            momentary={momentary}
            label={`${name}${i}`}
            disabled={disabled}
            onPressedChange={(isPressed) => handlePressedChange(i, isPressed)}
          />
        )}
      />
      {showReadout && <Readout name={name} text={bitsToString(bits)} />}
      {showHint && activeLow && (
        <p className="pb-panel__hint">(Active low – 0 when pressed)</p>
      )}
    </Panel>
  );
}

export default Pushbuttons;
