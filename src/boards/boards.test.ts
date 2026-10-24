// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import { describe, expect, it } from 'vitest';
import { BUILT_IN_BOARDS, BUILT_IN_CATALOG, DEFAULT_BOARD, mergeCatalog } from './boardCatalog';
import { canUndo, type BoardChangeRecord } from './boardChangeUndo';
import { encodeBoardFrame } from './boardFrame';
import { foreignBoardNames } from './boardMatch';
import { BUILT_IN_PORT_NAMES, portList, sevenSegmentHeading } from './boardPorts';
import { DEFAULT_LABELS } from './parseBoards';
import { parsePreferredBoard, preferredBoardIn } from './preferredBoard';
import type { BoardDefinition } from './types';

const DE1_SOC = BUILT_IN_BOARDS.find((board) => board.id === 'de1-soc')!;

/** A user board whose own names differ from both built-ins: `BTN`, `SEG0`…. */
const COURSE: BoardDefinition = {
  id: 'course',
  name: 'Course',
  description: '',
  origin: 'user',
  labels: DEFAULT_LABELS,
  ports: {
    clock50: 'CLOCK_50',
    clock500Hz: 'CLOCK_500Hz',
    switches: 'SW',
    pushbuttons: 'BTN',
    leds: 'LEDR',
    sevenSegment: ['SEG0', 'SEG1', 'SEG2', 'SEG3', 'SEG4', 'SEG5'],
  },
};

/**
 * The literal Default `BOARD` frame. The same text is in server/src/protocol.test.ts:
 * the two packages share no code, so this text is their contract.
 */
const DEFAULT_BOARD_FRAME = `BOARD
clock50 CLOCK_50
clock500Hz CLOCK_500Hz
switches SW
pushbuttons KEY_N
leds LEDR
sevenSegment HEX0_N HEX1_N HEX2_N HEX3_N HEX4_N HEX5_N`;

describe('board ports', () => {
  it('lists the names in role order', () => {
    expect(portList(DE1_SOC.ports)).toEqual(['CLOCK_50', 'CLOCK_500Hz', 'SW', 'KEY', 'LEDR', 'HEX0', 'HEX1', 'HEX2', 'HEX3', 'HEX4', 'HEX5']);
  });

  it('knows the names of every built-in board, lower case', () => {
    for (const name of ['key_n', 'key', 'hex0_n', 'hex0', 'clock_500hz', 'ledr']) expect(BUILT_IN_PORT_NAMES.has(name)).toBe(true);
    expect(BUILT_IN_PORT_NAMES.has('rst')).toBe(false);
  });

  it.each([
    [['HEX0_N', 'HEX1_N', 'HEX2_N', 'HEX3_N', 'HEX4_N', 'HEX5_N'], 'HEXn_N[6:0]'],
    [['HEX0', 'HEX1', 'HEX2', 'HEX3', 'HEX4', 'HEX5'], 'HEXn[6:0]'],
    [['SEG_A', 'SEG_B', 'SEG_C', 'SEG_D', 'SEG_E', 'SEG_F'], 'SEG_A…SEG_F[6:0]'],
    [['D0', 'D1', 'D2', 'D3', 'D5', 'D4'], 'D0…D4[6:0]'],
  ])('heads the displays %j as %s', (names, heading) => {
    expect(sevenSegmentHeading(names)).toBe(heading);
  });
});

describe('the BOARD frame', () => {
  it('is the literal Default frame the server decodes', () => {
    expect(encodeBoardFrame(DEFAULT_BOARD.ports)).toBe(DEFAULT_BOARD_FRAME);
  });

  it('carries the DE1-SoC names', () => {
    expect(encodeBoardFrame(DE1_SOC.ports)).toBe(
      'BOARD\nclock50 CLOCK_50\nclock500Hz CLOCK_500Hz\nswitches SW\npushbuttons KEY\nleds LEDR\nsevenSegment HEX0 HEX1 HEX2 HEX3 HEX4 HEX5',
    );
  });
});

describe('foreignBoardNames', () => {
  const catalog = mergeCatalog(BUILT_IN_BOARDS, { boards: [COURSE], warnings: [] });

  it('gives no hint for a design that only uses names every board shares', () => {
    expect(foreignBoardNames(['SW', 'LEDR', 'CLOCK_50'], catalog, DE1_SOC)).toBeUndefined();
  });

  it('names the Default board and the ports for KEY_N on the DE1-SoC', () => {
    const hint = foreignBoardNames(['SW', 'KEY_N', 'LEDR'], catalog, DE1_SOC);
    expect(hint?.board.id).toBe('default');
    expect(hint?.names).toEqual(['KEY_N']);
  });

  it('picks the board with the most names', () => {
    expect(foreignBoardNames(['KEY', 'HEX0', 'BTN'], catalog, DEFAULT_BOARD)?.board.id).toBe('de1-soc');
  });

  it('gives no hint on a tie between two boards', () => {
    expect(foreignBoardNames(['KEY', 'BTN'], catalog, DEFAULT_BOARD)).toBeUndefined();
  });

  it('gives no hint for a unit without ports, or one on its own board', () => {
    expect(foreignBoardNames([], catalog, DEFAULT_BOARD)).toBeUndefined();
    expect(foreignBoardNames(['key_n', 'hex0_n'], catalog, DEFAULT_BOARD)).toBeUndefined();
  });
});

describe('canUndo', () => {
  const before = [{ id: 'a', content: 'KEY_N' }];
  const after = [{ id: 'a', content: 'KEY' }];
  const record: BoardChangeRecord<Array<{ id: string; content: string }>> = {
    before: { files: before, board: 'default' },
    after: { files: after, board: 'de1-soc' },
  };

  it('is possible right after the change', () => {
    expect(canUndo(record, { files: after, board: 'de1-soc' })).toBe(true);
  });

  it('is not possible once a file changed, was added, deleted or renamed: a new array', () => {
    expect(canUndo(record, { files: [...after], board: 'de1-soc' })).toBe(false);
    expect(canUndo(record, { files: [{ id: 'a', content: 'KEY ' }], board: 'de1-soc' })).toBe(false);
  });

  it('is not possible once the board changed again', () => {
    expect(canUndo(record, { files: after, board: 'default' })).toBe(false);
  });

  it('holds for a board-only change with the same files', () => {
    const boardOnly = { before: { files: before, board: 'default' }, after: { files: before, board: 'de1-soc' } };
    expect(canUndo(boardOnly, { files: before, board: 'de1-soc' })).toBe(true);
  });
});

describe('the preferred board', () => {
  it('is Default when nothing is stored, or garbage', () => {
    expect(parsePreferredBoard(null)).toBe('default');
    expect(parsePreferredBoard('{not json')).toBe('default');
    expect(parsePreferredBoard('42')).toBe('default');
  });

  it('is the stored id', () => {
    expect(parsePreferredBoard('"de1-soc"')).toBe('de1-soc');
  });

  it('falls back to Default for an id that is not installed', () => {
    expect(preferredBoardIn(BUILT_IN_CATALOG, 'de10-lite')).toBe('default');
    expect(preferredBoardIn(BUILT_IN_CATALOG, 'de1-soc')).toBe('de1-soc');
  });
});
