// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * The generated starter top (docs/board_io_v2_spec.md § 5.5). Each output is kept as a
 * file under tests/fixtures/boards/starters/, which the backend's integration tests
 * compile and run on their board (server/src/integration/boardShapes.test.ts).
 */

import { describe, expect, it } from 'vitest';
import { BUILT_IN_BOARDS, builtInBoard } from './boardCatalog';
import { generateBoardTop, starterTopFileName, type TopLanguage } from './boardTop';
import type { BoardDefinition } from './types';

const BASYS3 = builtInBoard('basys3');

/** Basys 3 with other counts: more switches than LEDs, and more LEDs than switches. */
const withCounts = (id: string, switches: number, leds: number): BoardDefinition => ({
  ...BASYS3,
  id,
  ports: { ...BASYS3.ports, switches: { port: 'sw', count: switches }, leds: { port: 'led', count: leds } },
});
const MORE_SWITCHES = withCounts('sw16-led8', 16, 8);
const MORE_LEDS = withCounts('sw8-led16', 8, 16);

const LANGUAGES: readonly TopLanguage[] = ['vhdl', 'verilog'];
const EXTENSION: Record<TopLanguage, string> = { vhdl: 'vhdl', verilog: 'v' };
const BOARDS = [...BUILT_IN_BOARDS, MORE_SWITCHES, MORE_LEDS];

describe('generateBoardTop', () => {
  for (const board of BOARDS) {
    for (const language of LANGUAGES) {
      it(`writes the ${board.id} starter in ${language}`, async () => {
        const text = generateBoardTop(board, language, 'starter_top');
        await expect(text).toMatchFileSnapshot(`../../tests/fixtures/boards/starters/${board.id}.${EXTENSION[language]}`);
      });
    }
  }

  it('drives the LEDs from the switches with one assignment, whichever has more', () => {
    expect(generateBoardTop(MORE_SWITCHES, 'vhdl', 't')).toContain('led <= sw(7 downto 0);');
    expect(generateBoardTop(MORE_SWITCHES, 'verilog', 't')).toContain('assign led = sw[7:0];');
    expect(generateBoardTop(MORE_LEDS, 'vhdl', 't')).toContain("led <= (15 downto 8 => '0') & sw;");
    expect(generateBoardTop(MORE_LEDS, 'verilog', 't')).toContain("assign led = {{8{1'b0}}, sw};");
  });

  it('turns every display part off at its inactive level', () => {
    const nexys = generateBoardTop(builtInBoard('nexys-a7'), 'vhdl', 't');
    expect(nexys).toContain("CA <= '1';");
    expect(nexys).toContain("DP <= '1';");
    expect(nexys).toContain("AN <= (others => '1');");
  });

  it('marks the 500 Hz clock as simulator only, and names the board and its resources', () => {
    const text = generateBoardTop(BASYS3, 'verilog', 't');
    expect(text).toContain('CLOCK_500Hz, // Simulator only (HDLBoard): delete this port before synthesis.');
    expect(text).toContain('// Buttons: active high. Displays: active low, multiplexed (digit enables active low).');
    expect(text).toContain('//   Board definitions: https://github.com/Digilent/Basys3/blob/master/Resources/XDC/Basys3_Master.xdc');
  });
});

describe('starterTopFileName', () => {
  it('is named after the board, and free', () => {
    expect(starterTopFileName(BASYS3, 'vhdl', [])).toBe('basys3_top.vhdl');
    expect(starterTopFileName(builtInBoard('nexys-a7'), 'verilog', ['Nexys_A7_top.v'])).toBe('nexys_a7_top_2.v');
  });
});
