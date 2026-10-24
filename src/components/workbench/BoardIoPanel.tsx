// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import { Board, type BitVector } from '../board';
import { Leds } from '../Leds';
import { Pushbuttons } from '../Pushbuttons';
import { SevenSegmentDisplays, type SegmentVector } from '../SevenSegment';
import { Switches } from '../Switches';
import { LED_COUNT, PUSHBUTTON_COUNT, SWITCH_COUNT, sevenSegmentPattern, vectorHeading } from '../../boards/boardPorts';
import type { BoardDefinition } from '../../boards/types';

export interface BoardIoPanelProps {
  /** The active board: its port names head the panels, its labels sit under the parts. */
  board: BoardDefinition;
  ledState: BitVector;
  hexState: SegmentVector[];
  sw: BitVector;
  keys: BitVector;
  onSwChange: (next: BitVector) => void;
  onKeyChange: (next: BitVector) => void;
}

/**
 * The board's four parts, headed with the active board's port names
 * (docs/board_io_config_spec.md § 6.6): `Pushbuttons (KEY[3:0])` on the DE1-SoC,
 * `Pushbuttons (KEY_N[3:0])` on Default. The number of parts is the same on every board.
 */
export function BoardIoPanel({ board, ledState, hexState, sw, keys, onSwChange, onKeyChange }: BoardIoPanelProps) {
  const { ports, labels } = board;
  return (
    <Board size={24}>
      <Leds value={ledState} name={labels.leds} title={`LEDs (${vectorHeading(ports.leds, LED_COUNT)})`} />
      <SevenSegmentDisplays value={hexState} name={labels.sevenSegment} port={sevenSegmentPattern(ports.sevenSegment)} />
      <Switches value={sw} onChange={onSwChange} name={labels.switches} title={`Switches (${vectorHeading(ports.switches, SWITCH_COUNT)})`} />
      <Pushbuttons
        value={keys}
        onChange={onKeyChange}
        showHint={false}
        name={labels.pushbuttons}
        title={`Pushbuttons (${vectorHeading(ports.pushbuttons, PUSHBUTTON_COUNT)})`}
      />
    </Board>
  );
}
