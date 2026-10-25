// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import { Board, type BitVector } from '../board';
import { Leds } from '../Leds';
import { PushbuttonCross, Pushbuttons, ResetButton, releasedLevel } from '../Pushbuttons';
import { SevenSegmentDisplays } from '../SevenSegment';
import { Switches } from '../Switches';
import { buttonCount, displayCount, groupNames, hasDecimalPoint, type BoardInputs, type BoardOutputs } from '../../boards/boardShape';
import type { BoardDefinition } from '../../boards/types';
import { buttonsTitle, displaysTitle, ledsTitle, multiplexedNote, switchesTitle } from './boardText';

export interface BoardIoPanelProps {
  /** The active board: its shape decides the parts, its names head the panels. */
  board: BoardDefinition;
  outputs: BoardOutputs;
  inputs: BoardInputs;
  /** The inputs that changed; the others keep their latest values, even before the next render. */
  onInputsChange: (changed: Partial<BoardInputs>) => void;
}

/**
 * The board's parts, built from the active board (docs/board_io_v2_spec.md § 5.1): as
 * many switches, LEDs and displays as it has, its buttons as a row or a cross, and its
 * reset button beside them. This maps the board to the parts' props; the parts
 * themselves know nothing about boards.
 */
export function BoardIoPanel({ board, outputs, inputs, onInputsChange }: BoardIoPanelProps) {
  const { ports, labels } = board;
  return (
    <Board size={24}>
      <Leds value={outputs.leds} count={ports.leds.count} name={labels.leds} title={ledsTitle(ports.leds)} />
      <SevenSegmentDisplays
        value={outputs.displays}
        count={displayCount(ports)}
        activeLow={ports.sevenSegment.activeLow}
        decimalPoint={hasDecimalPoint(ports)}
        name={labels.sevenSegment}
        title={displaysTitle(ports.sevenSegment)}
        note={multiplexedNote(ports.sevenSegment)}
      />
      <Switches
        value={inputs.switches}
        count={ports.switches.count}
        onChange={(switches) => onInputsChange({ switches })}
        name={labels.switches}
        title={switchesTitle(ports.switches)}
      />
      <ButtonsPart board={board} inputs={inputs} onInputsChange={onInputsChange} />
    </Board>
  );
}

type PartProps = Omit<BoardIoPanelProps, 'outputs'>;

/** The pushbuttons as a row or a cross, with the reset button beside them. */
function ButtonsPart({ board, inputs, onInputsChange }: PartProps) {
  const { ports, labels } = board;
  const { pushbuttons } = ports;
  const shared = {
    value: inputs.buttons,
    onChange: (buttons: BitVector) => onInputsChange({ buttons }),
    activeLow: pushbuttons.activeLow,
    name: labels.pushbuttons,
    title: buttonsTitle(pushbuttons),
    aside: <ResetPart board={board} inputs={inputs} onInputsChange={onInputsChange} />,
  };
  if (pushbuttons.layout === 'cross') return <PushbuttonCross {...shared} labels={groupNames(pushbuttons.group)} />;
  const scalarNames = pushbuttons.group.kind === 'scalars' ? pushbuttons.group.ports : undefined;
  return <Pushbuttons {...shared} count={buttonCount(ports)} labels={scalarNames} showHint={false} />;
}

/** The reset button, on a board that has one. */
function ResetPart({ board, inputs, onInputsChange }: PartProps) {
  const reset = board.ports.resetButton;
  if (reset === undefined) return null;
  return (
    <ResetButton
      value={inputs.reset[0] ?? releasedLevel(reset.activeLow)}
      activeLow={reset.activeLow}
      label={reset.port}
      onChange={(level) => onInputsChange({ reset: [level] })}
    />
  );
}
