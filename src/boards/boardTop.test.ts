// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * The generated starter top (docs/board_io_v2_spec.md § 5.5). Each output is kept as a
 * file under tests/fixtures/boards/starters/, which the backend's integration tests
 * compile and run on their board (server/src/integration/boardShapes.test.ts).
 */

import { describe, expect, it } from 'vitest';
import { BUILT_IN_BOARDS, builtInBoard, DEFAULT_BOARD } from './boardCatalog';
import { boardTopName, generateBoardTop, projectTopName, starterTopFileName, type TopLanguage } from './boardTop';
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
    expect(nexys).toContain("HEX <= (others => '1');");
    expect(nexys).toContain("DP <= '1';");
    expect(nexys).toContain("AN <= (others => '1');");
  });

  it('drives scalar segments through one HEX word, bit 0 on segment a', () => {
    const nexys = builtInBoard('nexys-a7');
    expect(generateBoardTop(nexys, 'vhdl', 't')).toContain('signal HEX : std_logic_vector(6 downto 0);');
    expect(generateBoardTop(nexys, 'vhdl', 't')).toContain('(CG, CF, CE, CD, CC, CB, CA) <= HEX;');
    expect(generateBoardTop(nexys, 'verilog', 't')).toContain('assign {CG, CF, CE, CD, CC, CB, CA} = HEX;');
    expect(generateBoardTop(BASYS3, 'vhdl', 't')).not.toContain('HEX');
  });

  it('marks the 500 Hz clock as simulator only, and names the board and its resources', () => {
    const text = generateBoardTop(BASYS3, 'verilog', 't');
    expect(text).toContain('CLOCK_500Hz, // Simulator only (HDLBoard): delete this port before synthesis.');
    expect(text).toContain('// Buttons: active high. Displays: active low, multiplexed (digit enables active low).');
    expect(text).toContain('//   Board definitions: https://github.com/Digilent/Basys3/blob/master/Resources/XDC/Basys3_Master.xdc');
  });

  it('declares a vector of one bit as a vector, as the testbench connects it', () => {
    const one = withCounts('sw1-led1', 1, 1);
    const vhdl = generateBoardTop(one, 'vhdl', 'top');
    expect(vhdl).toMatch(/sw\s+: in\s+std_logic_vector\(0 downto 0\);/);
    expect(vhdl).toContain('led <= sw(0 downto 0);');
    expect(generateBoardTop(one, 'verilog', 'top')).toMatch(/input\s+wire \[0:0\]\s+sw,/);
  });
});

describe('starterTopFileName', () => {
  it('is named after the board, and free', () => {
    expect(starterTopFileName(BASYS3, 'vhdl')).toBe('Basys_3.vhdl');
    expect(starterTopFileName(builtInBoard('nexys-a7'), 'verilog', { takenNames: ['nexys_a7.v'] })).toBe('Nexys_A7_2.v');
    expect(starterTopFileName(builtInBoard('de10-lite'), 'vhdl')).toBe('DE10_Lite.vhdl');
    expect(starterTopFileName(DEFAULT_BOARD, 'verilog')).toBe('DE1_SoC.v');
  });

  it('makes a valid identifier of any board name', () => {
    const named = (name: string) => boardTopName({ ...BASYS3, id: 'x', name });
    expect(named('9 Lab — rev B')).toBe('board_9_Lab_rev_B');
    expect(named('Signal')).toBe('Signal_top');
  });

  it('is named after the project when one is given', () => {
    expect(starterTopFileName(BASYS3, 'vhdl', { projectName: 'Traffic light' })).toBe('Traffic_light.vhdl');
    expect(starterTopFileName(DEFAULT_BOARD, 'verilog', { takenNames: ['counter.v'], projectName: 'Counter' })).toBe('Counter_2.v');
    expect(starterTopFileName(DEFAULT_BOARD, 'vhdl', { projectName: '4-bit counter' })).toBe('top_4_bit_counter.vhdl');
  });

  it('makes a valid identifier of any project name', () => {
    expect(projectTopName('process', DEFAULT_BOARD)).toBe('process_top');
    expect(projectTopName('LEDR', DEFAULT_BOARD)).toBe('LEDR_top');
    expect(projectTopName('!!!', DEFAULT_BOARD)).toBe('DE1_SoC');
    expect(projectTopName('a'.repeat(40), DEFAULT_BOARD)).toHaveLength(28);
  });
});
