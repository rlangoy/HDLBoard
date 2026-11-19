// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import { describe, expect, test } from 'vitest';
import { BUILT_IN_BOARDS, DEFAULT_BOARD } from '../../../boards/boardCatalog';
import type { BoardDefinition } from '../../../boards/types';
import { examplesFor } from '../examples';
import { simOnlyExamples } from './exampleCheck';

/** docs/impl_sim_only_warnings.md § 5.3: the Examples cards say SIM-only as the editor will. */

const board = (id: string): BoardDefinition => BUILT_IN_BOARDS.find((b) => b.id === id) ?? DEFAULT_BOARD;
const simOnlyIds = (b: BoardDefinition, mode: 'synthesis' | 'simulation' = 'synthesis') => [...simOnlyExamples(examplesFor(b), b, mode).keys()].sort();

describe('which example cards are SIM-only', () => {
  test('on the Default board: two clocks, and the slow clock of the blink example', () => {
    expect(simOnlyIds(DEFAULT_BOARD)).toEqual(['blink_verilog', 'blink_vhdl', 'key_counter_two_clocks_verilog', 'key_counter_two_clocks_vhdl']);
  });

  test('the two-clocks example, for its flip-flop template', () => {
    expect(simOnlyExamples(examplesFor(DEFAULT_BOARD), DEFAULT_BOARD, 'synthesis').get('key_counter_two_clocks_vhdl')).toEqual(['flip-flop template']);
  });

  test('on a board with its own files: as they are written there (Basys 3 counts on the slow clock)', () => {
    expect(simOnlyIds(board('basys3'))).toContain('key_counter_7seg_vhdl');
  });

  test('none with Design check set to Simulation only', () => {
    expect(simOnlyIds(DEFAULT_BOARD, 'simulation')).toEqual([]);
  });
});
