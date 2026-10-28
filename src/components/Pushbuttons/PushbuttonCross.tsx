// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import type { CSSProperties, HTMLAttributes, ReactNode } from 'react';
import { Panel, Readout, bitsToString, coerceBits, cx, scaleStyle, type BitVector } from '../board';
import { Pushbutton } from './Pushbutton';
import { levelWhen, releasedLevel } from './levels';
import '../board/tokens.css';
import './PushbuttonCross.css';

/** The five positions, in button order: button 0 is the centre. */
export const CROSS_POSITIONS = ['centre', 'up', 'left', 'right', 'down'] as const;
const BUTTON_COUNT = CROSS_POSITIONS.length;

type NativeProps = Omit<HTMLAttributes<HTMLElement>, 'onChange' | 'title'>;

export interface PushbuttonCrossProps extends NativeProps {
  headerAction?: ReactNode;
  /** The button signal, button 0 (centre) first, as pin levels. */
  value: BitVector;
  /** Called with the whole new signal on every press and release. */
  onChange: (next: BitVector, changedIndex: number) => void;
  /** One label per button, centre first: the port names (`btnC`, `btnU`, …). */
  labels: readonly string[];
  /** The card title, e.g. `Pushbuttons (btnC, btnU, btnL, btnR, btnD)`. */
  title: string;
  /** `true` (default): pressed reads `0`. */
  activeLow?: boolean;
  /** Name in the readout. Default `"BTN"`. */
  name?: string;
  /** Drawn to the right of the cross, inside the panel: a reset button. */
  aside?: ReactNode;
  /** Board scale unit (the switch housing width). */
  size?: number | string;
}

/**
 * Five pushbuttons in a cross — up, left, centre, right, down — as on Digilent boards.
 * The same `Pushbutton` part and press logic as the row; each button is labelled with
 * its port name, and its accessible name adds the position (`btnU (up)`).
 */
export function PushbuttonCross({
  value,
  onChange,
  labels,
  title,
  activeLow = true,
  name = 'BTN',
  aside,
  size,
  headerAction,
  className,
  style,
  ...native
}: PushbuttonCrossProps) {
  const bits = coerceBits(value, BUTTON_COUNT);
  const layout = { '--pb-part-w': 'var(--pb-key-w)' } as CSSProperties;
  return (
    <Panel
      {...native}
      heading={title}
      headerAction={headerAction}
      accent="keys"
      className={cx('pb-pushbuttons', className)}
      style={{ ...scaleStyle(size, style), ...layout }}
    >
      <div className="pb-keys-row">
        <CrossGrid bits={bits} labels={labels} title={title} activeLow={activeLow} onChange={onChange} />
        {aside}
      </div>
      <Readout name={name} text={bitsToString(bits)} />
    </Panel>
  );
}

interface CrossGridProps {
  bits: BitVector;
  labels: readonly string[];
  title: string;
  activeLow: boolean;
  onChange: (next: BitVector, changedIndex: number) => void;
}

/** The five buttons in their 3 × 3 grid. */
function CrossGrid({ bits, labels, title, activeLow, onChange }: CrossGridProps) {
  const press = (index: number, pressed: boolean) => {
    const next = [...bits];
    next[index] = levelWhen(pressed, activeLow);
    onChange(next, index);
  };
  return (
    <div className="pb-cross" role="group" aria-label={title}>
      {CROSS_POSITIONS.map((position, index) => (
        <CrossButton
          key={position}
          position={position}
          label={labels[index]}
          pressed={bits[index] !== releasedLevel(activeLow)}
          onPressedChange={(pressed) => press(index, pressed)}
        />
      ))}
    </div>
  );
}

interface CrossButtonProps {
  position: (typeof CROSS_POSITIONS)[number];
  /** The port name: `btnU`. */
  label: string;
  pressed: boolean;
  onPressedChange: (pressed: boolean) => void;
}

/** One button of the cross, in its grid cell, named by its port and, for a screen reader, its position. */
function CrossButton({ position, label, pressed, onPressedChange }: CrossButtonProps) {
  const fullLabel = `${label} (${position})`;
  return (
    <div className={`pb-cross__cell pb-cross__cell--${position}`}>
      <span className="pb-bank__index">{label}</span>
      <Pushbutton pressed={pressed} label={fullLabel} title={fullLabel} onPressedChange={onPressedChange} />
    </div>
  );
}

export default PushbuttonCross;
