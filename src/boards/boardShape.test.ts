// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/** Board shapes: the bit layout, inputs, frames, shape differences and renames (docs/board_io_v2_spec.md § 12.1). */

import { describe, expect, it } from 'vitest';
import sharedFrames from '../../tests/fixtures/boards/board-frames.json';
import { bitsToString, type Bit, type BitVector } from '../components/board/bits';
import { BUILT_IN_BOARDS, builtInBoard, DEFAULT_BOARD } from './boardCatalog';
import { encodeBoardBody } from './boardFrame';
import { renamesBetween, roleRenames } from './boardPorts';
import {
  decodeState,
  encodeStim,
  restInputs,
  sameInputShape,
  stateLength,
  stimFields,
  stimLength,
  type BoardInputs,
} from './boardShape';
import { testBoard } from './boards.testSupport';
import { describeShapeChange, formatShapeDifference, isDefaultShape } from './shapeChange';
import type { BoardDefinition, BoardPorts } from './types';

const DE1_SOC = builtInBoard('de1-soc');
const DE10_LITE = builtInBoard('de10-lite');
const BASYS3 = builtInBoard('basys3');
const NEXYS_A7 = builtInBoard('nexys-a7');
const MUX_NO_POINT = testBoard('mux-no-point');
const ALL_BOARDS: readonly BoardDefinition[] = [...BUILT_IN_BOARDS, MUX_NO_POINT, testBoard('video-clock'), testBoard('course')];

/** A small, seeded generator, so a failing case can be found again. */
function seededBits(seed: number): (count: number) => BitVector {
  let state = seed;
  return (count) =>
    Array.from({ length: count }, () => {
      state = (state * 1103515245 + 12345) % 2 ** 31;
      return (state >> 16) & 1 ? 1 : 0;
    });
}

describe('the bit layout', () => {
  it.each([
    ['default', 14, 52],
    ['de1-soc', 14, 52],
    ['de10-lite', 12, 58],
    ['basys3', 21, 48],
    ['nexys-a7', 22, 80],
  ])('gives %s a STIM of %i bits and a STATE of %i', (id, stim, state) => {
    const { ports } = builtInBoard(id);
    expect([stimLength(ports), stateLength(ports)]).toEqual([stim, state]);
  });

  it('gives a multiplexed board without a decimal point 7-bit display words', () => {
    expect(stateLength(MUX_NO_POINT.ports)).toBe(8 + 4 * 7);
  });

  it('puts the reset button last in STIM, after the buttons', () => {
    expect(stimFields(NEXYS_A7.ports)).toEqual([
      { role: 'switches', width: 16 },
      { role: 'buttons', width: 5 },
      { role: 'reset', width: 1 },
    ]);
  });

  it('encodes the Default board exactly as 1.6.0 did, for 100 seeded inputs', () => {
    const next = seededBits(0x27);
    for (let run = 0; run < 100; run++) {
      const switches = next(10);
      const buttons = next(4);
      const legacyPayload = `${bitsToString(switches)}${bitsToString(buttons)}`;
      expect(encodeStim(DEFAULT_BOARD.ports, { switches, buttons, reset: [] })).toBe(legacyPayload);
    }
  });

  it.each(ALL_BOARDS.map((board) => [board.id, board] as const))('decodes what %s publishes, field by field', (_id, board) => {
    const next = seededBits(0x27);
    const leds = next(board.ports.leds.count);
    const state = stateLength(board.ports);
    const displayBits = next(state - leds.length);
    const decoded = decodeState(board.ports, bitsToString(leds) + displayBits.join(''));
    expect(decoded?.leds).toEqual(leds);
    expect(decoded?.displays.flatMap((word) => [...word].reverse())).toEqual(displayBits);
  });

  it('drops a STATE of the wrong length, and reads an undefined bit as off', () => {
    expect(decodeState(BASYS3.ports, '0'.repeat(52))).toBeUndefined();
    const decoded = decodeState(DEFAULT_BOARD.ports, 'X'.repeat(52));
    expect(decoded?.leds).toEqual(Array(10).fill(0));
    expect(decoded?.displays[0]).toEqual(Array(7).fill(1));
  });
});

describe('the inputs', () => {
  it('rest at the released level of each board', () => {
    expect(restInputs(DEFAULT_BOARD.ports)).toEqual({ switches: Array(10).fill(0), buttons: [1, 1, 1, 1], reset: [] });
    expect(restInputs(NEXYS_A7.ports)).toEqual({ switches: Array(16).fill(0), buttons: [0, 0, 0, 0, 0], reset: [1] });
  });

  it('are kept between boards whose inputs mean the same', () => {
    expect(sameInputShape(DEFAULT_BOARD.ports, DE1_SOC.ports)).toBe(true);
    expect(sameInputShape(DEFAULT_BOARD.ports, BASYS3.ports)).toBe(false);
    expect(sameInputShape(BASYS3.ports, NEXYS_A7.ports)).toBe(false);
  });

  it('put button 0 (centre) last in its field', () => {
    const inputs: BoardInputs = { switches: Array<Bit>(16).fill(0), buttons: [1, 0, 0, 0, 0], reset: [1] };
    expect(encodeStim(NEXYS_A7.ports, inputs)).toBe(`${'0'.repeat(16)}00001` + '1');
  });
});

describe('the BOARD frame', () => {
  const frames: Record<string, string> = sharedFrames;

  it.each(ALL_BOARDS.map((board) => [board.id, board] as const))('is the shared fixture text for %s', (id, board) => {
    expect(encodeBoardBody(board.ports)).toBe(frames[id]);
  });

  it('leaves the button layout out: the backend never needs it', () => {
    expect(frames.basys3).not.toContain('layout');
    expect(frames.basys3).not.toContain('cross');
  });

  it('is unchanged for the Default board (guard: the backend copy is DEFAULT_BOARD_IO)', () => {
    expect(frames.default).toBe(
      '{"version":2,"clock":{"port":"CLOCK_50","mhz":50},"clock500Hz":"CLOCK_500Hz","switches":{"port":"SW","count":10},' +
        '"pushbuttons":{"group":{"kind":"vector","port":"KEY_N","count":4},"activeLow":true},"leds":{"port":"LEDR","count":10},' +
        '"sevenSegment":{"kind":"independent","ports":["HEX0_N","HEX1_N","HEX2_N","HEX3_N","HEX4_N","HEX5_N"],"width":7,"activeLow":true}}',
    );
  });
});

describe('shape differences', () => {
  it('are none between Default and DE1-SoC', () => {
    expect(describeShapeChange(DEFAULT_BOARD.ports, DE1_SOC.ports)).toEqual([]);
  });

  it('are the five hand edits from Default to Basys 3, in role order', () => {
    expect(describeShapeChange(DEFAULT_BOARD.ports, BASYS3.ports).map(formatShapeDifference)).toEqual([
      'Clock frequency: 50 MHz → 100 MHz (divider and counter constants change).',
      'Switches: 10 → 16 (sw[15:0]).',
      'Pushbuttons: 4 active-low (KEY_N[3:0]) → 5 active-high in a cross (btnC, btnU, btnL, btnR, btnD).',
      'LEDs: 10 → 16 (led[15:0]).',
      '7-segment: 6 separate displays → a 4-digit multiplexed display (seg[6:0], dp, an[3:0]).',
    ]);
  });

  it('are only the clock for a board equal to Default but at 100 MHz, which keeps the Default shape', () => {
    const fast: BoardPorts = { ...DEFAULT_BOARD.ports, clock: { port: 'CLOCK_50', mhz: 100 } };
    expect(describeShapeChange(DEFAULT_BOARD.ports, fast).map((difference) => difference.role)).toEqual(['clock']);
    expect(isDefaultShape(fast)).toBe(true);
  });

  it('name the reset button and the decimal point', () => {
    expect(describeShapeChange(BASYS3.ports, NEXYS_A7.ports).map(formatShapeDifference)).toContain(
      'Reset button: none → CPU_RESETN, active-low.',
    );
    expect(describeShapeChange(DE1_SOC.ports, DE10_LITE.ports).map(formatShapeDifference)).toEqual([
      'Pushbuttons: 4 active-low (KEY[3:0]) → 2 active-low (KEY[1:0]).',
      '7-segment: 6 separate displays → 6 separate displays with decimal point (HEXn[7:0]).',
    ]);
  });

  it('keep the Default shape only for Default, DE1-SoC and the boards like them', () => {
    expect(ALL_BOARDS.filter((board) => isDefaultShape(board.ports)).map((board) => board.id)).toEqual(['default', 'de1-soc', 'video-clock']);
  });
});

describe('roleRenames: a port is renamed only when it needs no further edit (§ 9)', () => {
  it('renames Default to DE1-SoC name by name', () => {
    expect(renamesBetween(DEFAULT_BOARD, DE1_SOC)).toEqual([
      { from: 'KEY_N', to: 'KEY' },
      ...[0, 1, 2, 3, 4, 5].map((index) => ({ from: `HEX${index}_N`, to: `HEX${index}` })),
    ]);
  });

  it('renames only the clock from Default to Basys 3', () => {
    expect(renamesBetween(DEFAULT_BOARD, BASYS3)).toEqual([{ from: 'CLOCK_50', to: 'clk' }]);
  });

  it('renames a cross name by name, and keeps vector and scalar segments and 4 and 8 digits apart (Basys 3 → Nexys A7)', () => {
    expect(roleRenames('pushbuttons', BASYS3.ports, NEXYS_A7.ports)).toEqual([
      { from: 'btnC', to: 'BTNC' },
      { from: 'btnU', to: 'BTNU' },
      { from: 'btnL', to: 'BTNL' },
      { from: 'btnR', to: 'BTNR' },
      { from: 'btnD', to: 'BTND' },
    ]);
    expect(roleRenames('switches', BASYS3.ports, NEXYS_A7.ports)).toEqual([{ from: 'sw', to: 'SW' }]);
    expect(roleRenames('sevenSegment', BASYS3.ports, NEXYS_A7.ports)).toEqual([]);
    expect(roleRenames('resetButton', BASYS3.ports, NEXYS_A7.ports)).toEqual([]);
  });

  it('renames the segments, point and enables of two multiplexed displays alike', () => {
    const displays = BASYS3.ports.sevenSegment;
    if (displays.kind !== 'multiplexed') throw new Error('the Basys 3 display is multiplexed');
    const otherNames: BoardPorts = {
      ...BASYS3.ports,
      sevenSegment: { ...displays, segments: { kind: 'vector', port: 'SSEG_CA', count: 7 }, decimalPoint: 'DPT', digitEnables: 'SSEG_AN' },
    };
    expect(roleRenames('sevenSegment', BASYS3.ports, otherNames)).toEqual([
      { from: 'seg', to: 'SSEG_CA' },
      { from: 'dp', to: 'DPT' },
      { from: 'an', to: 'SSEG_AN' },
    ]);
  });

  it('never renames across a change of polarity', () => {
    const activeHighKeys: BoardPorts = { ...DE1_SOC.ports, pushbuttons: { ...DE1_SOC.ports.pushbuttons, activeLow: false } };
    expect(roleRenames('pushbuttons', DEFAULT_BOARD.ports, activeHighKeys)).toEqual([]);
  });

  it('never renames across a change of width', () => {
    expect(roleRenames('pushbuttons', DE1_SOC.ports, DE10_LITE.ports)).toEqual([]);
    expect(roleRenames('sevenSegment', DE1_SOC.ports, DE10_LITE.ports)).toEqual([]);
    expect(roleRenames('clock', DE1_SOC.ports, DE10_LITE.ports)).toEqual([{ from: 'CLOCK_50', to: 'MAX10_CLK1_50' }]);
  });
});
