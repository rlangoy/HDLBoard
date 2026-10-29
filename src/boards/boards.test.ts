// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import { describe, expect, it } from 'vitest';
import { BUILT_IN_BOARDS, BUILT_IN_CATALOG, builtInBoard, DEFAULT_BOARD, mergeCatalog } from './boardCatalog';
import { canUndo, undoneRenames, viewsAfterUndo, type BoardChangeRecord } from './boardChangeUndo';
import { encodeV1BoardFrame } from './boardFrame';
import { foreignBoardNames } from './boardMatch';
import { BUILT_IN_PORT_NAMES } from './boardPorts';
import { sevenSegmentHeading } from './boardPortText';
import { portList } from './boardShape';
import { testBoard } from './boards.testSupport';
import { parsePreferredBoard, preferredBoardIn } from './preferredBoard';
import type { IndependentDisplays } from './types';

const DE1_SOC = builtInBoard('de1-soc');

/** A user board whose own names differ from every built-in: `BTN0`…, `SEG0`…. */
const COURSE = testBoard('course');

/**
 * The literal Default `BOARD` frame of protocol 2, which a 1.6 backend still gets. The
 * same text is in server/src/protocol.test.ts: the two packages share no code, so this
 * text is their contract.
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

  it('knows the names of the Default and DE1-SoC boards only, lower case (F8)', () => {
    for (const name of ['key_n', 'key', 'hex0_n', 'hex0', 'clock_500hz', 'ledr']) expect(BUILT_IN_PORT_NAMES.has(name)).toBe(true);
    for (const name of ['rst', 'clk', 'led', 'seg', 'an', 'max10_clk1_50']) expect(BUILT_IN_PORT_NAMES.has(name)).toBe(false);
  });

  const independent = (ports: string[], width: 7 | 8 = 7): IndependentDisplays => ({ kind: 'independent', ports, width, activeLow: true });

  it.each([
    [independent(['HEX0_N', 'HEX1_N', 'HEX2_N', 'HEX3_N', 'HEX4_N', 'HEX5_N']), 'HEXn_N[6:0]'],
    [independent(['HEX0', 'HEX1', 'HEX2', 'HEX3', 'HEX4', 'HEX5'], 8), 'HEXn[7:0]'],
    [independent(['SEG_A', 'SEG_B', 'SEG_C', 'SEG_D', 'SEG_E', 'SEG_F']), 'SEG_A…SEG_F[6:0]'],
    [independent(['D0', 'D1', 'D2', 'D3', 'D5', 'D4']), 'D0…D4[6:0]'],
    [builtInBoard('basys3').ports.sevenSegment, 'seg[6:0], dp, an[3:0]'],
    [builtInBoard('nexys-a7').ports.sevenSegment, 'CA…CG, DP, AN[7:0]'],
  ])('heads the displays %j as %s', (displays, heading) => {
    expect(sevenSegmentHeading(displays)).toBe(heading);
  });
});

describe('the protocol-2 BOARD frame', () => {
  it('is the literal Default frame a 1.6 server decodes', () => {
    expect(encodeV1BoardFrame(DEFAULT_BOARD.ports)).toBe(DEFAULT_BOARD_FRAME);
  });

  it('cannot carry a board of another shape', () => {
    expect(() => encodeV1BoardFrame(builtInBoard('basys3').ports)).toThrow(/Default shape/);
  });

  it('carries the DE1-SoC names', () => {
    expect(encodeV1BoardFrame(DE1_SOC.ports)).toBe(
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
    expect(foreignBoardNames(['MAX10_CLK1_50', 'KEY', 'BTN0'], catalog, DEFAULT_BOARD)?.board.id).toBe('de10-lite');
  });

  it('gives no hint on a tie between two boards', () => {
    expect(foreignBoardNames(['MAX10_CLK1_50', 'BTN0'], catalog, DEFAULT_BOARD)).toBeUndefined();
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
    project: '0',
    before: { files: before, board: 'default', waveViews: undefined },
    after: { files: after, board: 'de1-soc', waveViews: undefined },
    renames: [{ from: 'KEY_N', to: 'KEY' }],
  };

  it('is possible right after the change', () => {
    expect(canUndo(record, { project: '0', files: after, board: 'de1-soc' })).toBe(true);
  });

  it('is not possible once a file changed, was added, deleted or renamed: a new array', () => {
    expect(canUndo(record, { project: '0', files: [...after], board: 'de1-soc' })).toBe(false);
    expect(canUndo(record, { project: '0', files: [{ id: 'a', content: 'KEY ' }], board: 'de1-soc' })).toBe(false);
  });

  it('is not possible once the board changed again', () => {
    expect(canUndo(record, { project: '0', files: after, board: 'default' })).toBe(false);
  });

  it('refuses undo when the selected board definition was edited', () => {
    const config = { id: 'custom', ports: { clock: 'CLK' } };
    const changed = { ...config, ports: { clock: 'NEW_CLK' } };
    const customRecord = { ...record, after: { ...record.after, board: 'custom', boardConfig: config } };
    expect(canUndo(customRecord, { project: '0', files: after, board: 'custom', boardConfig: config })).toBe(true);
    expect(canUndo(customRecord, { project: '0', files: after, board: 'custom', boardConfig: changed })).toBe(false);
  });

  it('is not possible in another project, even one with the same files and board (Close project)', () => {
    expect(canUndo(record, { project: '1', files: after, board: 'de1-soc' })).toBe(false);
  });

  it('holds for a board-only change with the same files', () => {
    const boardOnly = { ...record, before: { ...record.before, files: before }, after: { ...record.after, files: before }, renames: [] };
    expect(canUndo(boardOnly, { project: '0', files: before, board: 'de1-soc' })).toBe(true);
  });
});

describe('undoneRenames', () => {
  it('takes every name back', () => {
    expect(undoneRenames([{ from: 'KEY_N', to: 'KEY' }])).toEqual([{ from: 'KEY', to: 'KEY_N' }]);
  });
});

describe('viewsAfterUndo', () => {
  // A Verilog port written in lower case: the change wrote the board's spelling, Undo puts the file back.
  const beforeViews = { counter_tb: { signals: [{ path: 'uut/key_n' }] } };
  const afterViews = { counter_tb: { signals: [{ path: 'uut/KEY' }] } };
  const record: BoardChangeRecord<string[]> = {
    project: '0',
    before: { files: [], board: 'default', waveViews: beforeViews },
    after: { files: [], board: 'de1-soc', waveViews: afterViews },
    renames: [{ from: 'KEY_N', to: 'KEY' }],
  };
  const verilog = () => 'verilog' as const;

  it('restores views left as the change made them exactly, in the spelling the files had', () => {
    expect(viewsAfterUndo(record, afterViews, verilog)).toBe(beforeViews);
  });

  it("keeps a view changed since, its renamed names in the files' own spelling again", () => {
    const changedSince = { counter_tb: { signals: [{ path: 'uut/KEY' }, { path: 'uut/added_after' }] } };
    expect(viewsAfterUndo(record, changedSince, verilog)).toEqual({ counter_tb: { signals: [{ path: 'uut/key_n' }, { path: 'uut/added_after' }] } });
  });

  it('renames back a name the change did not rename in any view', () => {
    const changedSince = { counter_tb: { signals: [{ path: 'uut/KEY' }] }, other_tb: { signals: [{ path: 'dut/HEX0' }] } };
    const both: BoardChangeRecord<string[]> = { ...record, renames: [...record.renames, { from: 'HEX0_N', to: 'HEX0' }] };
    expect(viewsAfterUndo(both, changedSince, verilog)?.other_tb.signals).toEqual([{ path: 'dut/HEX0_N' }]);
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
    expect(preferredBoardIn(BUILT_IN_CATALOG, 'de0-nano')).toBe('default');
    expect(preferredBoardIn(BUILT_IN_CATALOG, 'de1-soc')).toBe('de1-soc');
  });
});
