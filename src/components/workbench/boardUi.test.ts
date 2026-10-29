// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/** The board feature's words and its board-aware sources (docs/board_io_config_spec.md § 3, § 6.7, § 6.8). */

import { describe, expect, it } from 'vitest';
import { builtInBoard, DEFAULT_BOARD } from '../../boards/boardCatalog';
import { renamesBetween } from '../../boards/boardPorts';
import { designUnits } from './tbDetect/designUnits';
import { blankSource } from './tbDetect/blank';
import { TEST_BOARD_PORTS } from './tbDetect/fixtures.testSupport';
import {
  boardOnlyLog,
  boardPaneTitle,
  boardRenamedLog,
  buttonsTitle,
  conflictLine,
  differentIo,
  displaysTitle,
  examplesNotice,
  filesWillChange,
  mismatchHint,
  notInstalledNote,
  notInstalledRunLog,
  renameRows,
  runBoardLog,
  withBoardName,
} from './boardText';
import { copyExample, EXAMPLES, starterFilesFor } from './examples';
import { languageOf, theOne } from '../../boards/boards.testSupport';
import { signalRows, usesActiveLowSuffix } from './helpSignals';
import { newFileContent } from './newFile';

const DE1_SOC = builtInBoard('de1-soc');

/** The ports the top unit of a source declares, as the run's mismatch check reads them. */
function declaredPorts(name: string, content: string): readonly string[] {
  const language = languageOf(name);
  return designUnits(language, blankSource(language, content).code, TEST_BOARD_PORTS)[0]?.portNames ?? [];
}

describe('the board text', () => {
  it('names the board in the pane title and a run', () => {
    expect(boardPaneTitle('Board I/O', DE1_SOC)).toBe('Board I/O · DE1-SoC');
    expect(runBoardLog(DE1_SOC)).toBe('Board: DE1-SoC');
  });

  it('lists the renames with the six displays as one row', () => {
    expect(renameRows(renamesBetween(DEFAULT_BOARD, DE1_SOC), DEFAULT_BOARD)).toEqual([
      { from: 'KEY_N', to: 'KEY' },
      { from: 'HEX0_N … HEX5_N', to: 'HEX0 … HEX5' },
    ]);
  });

  it('names at most five files, then counts the rest', () => {
    expect(filesWillChange(['a.vhd'], 1)).toBe('1 file will change (1 name): a.vhd');
    expect(filesWillChange(['a', 'b', 'c', 'd', 'e', 'f', 'g'], 41)).toBe('7 files will change (41 names): a, b, c, d, e +2 more');
  });

  it('says what a board change did', () => {
    expect(boardRenamedLog(DE1_SOC, 41, 3)).toBe('Board: DE1-SoC. Renamed 41 names in 3 files.');
    expect(boardOnlyLog(DE1_SOC)).toBe('Board: DE1-SoC (files unchanged)');
    expect(conflictLine('counter_tb.vhd', 'KEY is already a name in this file')).toBe('counter_tb.vhd: KEY is already a name in this file.');
  });

  it('says when a board is not installed', () => {
    expect(notInstalledRunLog('de10', DEFAULT_BOARD)).toBe('Board "de10" is not installed here; simulating with Default names.');
    expect(notInstalledNote('de10-lite', DEFAULT_BOARD)).toBe('Board "de10-lite" is not installed here; using Default.');
  });

  it('gives the mismatch hint with the names that triggered it', () => {
    expect(mismatchHint('DE1_SoC.vhdl', { board: DE1_SOC, names: ['KEY', 'HEX0', 'HEX1'] }, DEFAULT_BOARD)).toBe(
      '⚠ DE1_SoC.vhdl uses names of the DE1-SoC board (KEY, HEX0, HEX1), but the board is Default.',
    );
  });
});

describe('examples, starter files and New File on the DE1-SoC', () => {
  it('copies an example in the active board\'s names', () => {
    const example = theOne(EXAMPLES, (e) => e.id === 'key_counter_7seg_vhdl', 'Key Counter to 7-Segment example');
    let id = 0;
    const [copy] = copyExample(example, [], () => `copy-${++id}`, DE1_SOC).added;
    expect(declaredPorts(copy.name, copy.content)).toEqual(['CLOCK_50', 'KEY', 'HEX0', 'HEX1', 'HEX2', 'HEX3', 'HEX4', 'HEX5']);
  });

  it('declares the board\'s names in both languages of every example', () => {
    for (const example of EXAMPLES) {
      const { added } = copyExample(example, [], () => 'x', DE1_SOC);
      for (const file of added) {
        const ports = declaredPorts(file.name, file.content);
        expect(ports.filter((port) => /^(KEY_N|HEX\d_N)$/.test(port)), file.name).toEqual([]);
      }
    }
  });

  it('starts a workspace in the board\'s names, with the same file ids', () => {
    const starters = starterFilesFor(DE1_SOC);
    expect(starters.every((file) => !/\bKEY_N\b/.test(file.content))).toBe(true);
    expect(starterFilesFor(DEFAULT_BOARD).map((file) => file.id)).toEqual(starters.map((file) => file.id));
  });

  it('makes a new design with the board\'s ports', () => {
    expect(newFileContent('counter.vhd', 'vhdl', DE1_SOC).text).toMatch(/^\s+KEY {6}: in/m);
    expect(newFileContent('counter.v', 'verilog', DE1_SOC).text).toMatch(/input\s+wire \[3:0\]\s+KEY,/);
  });

  it('keeps the Default names for a new file named like a port, and says why, instead of failing', () => {
    const template = newFileContent('key.vhd', 'vhdl', DE1_SOC);
    expect(template.text).toMatch(/KEY_N/);
    expect(template.untranslated).toEqual(['KEY is already a name in this file']);
  });

  it('copies an example in the Default names when a user board\'s names clash with it, and says which', () => {
    const clk = { ...DE1_SOC, id: 'clk-board', name: 'Clk board', ports: { ...DE1_SOC.ports, clock: { port: 'clk', mhz: 50 } } };
    const example = theOne(EXAMPLES, (e) => e.id === 'key_uart_tx_vhdl', 'Key to UART Tx example');
    const copied = copyExample(example, [], () => 'x', clk);
    expect(copied.added).toHaveLength(3);
    expect(copied.untranslated.map((file) => file.name)).toEqual(['keyUartTx.vhdl', 'UART_Tx_tb.vhd']);
    expect(copied.added[0].content).toMatch(/CLOCK_50/);
  });

  it('starts a workspace on such a board without failing', () => {
    const clashing = { ...DE1_SOC, id: 'odd', name: 'Odd', ports: { ...DE1_SOC.ports, leds: { port: 'DE1_SoC', count: 10 } } };
    expect(starterFilesFor(clashing).map((file) => file.content)).toEqual(starterFilesFor(DEFAULT_BOARD).map((file) => file.content));
  });
});

describe('Help on another board', () => {
  it('lists the board\'s ports', () => {
    expect(signalRows(DE1_SOC).map((row) => row.port)).toEqual(['CLOCK_50', 'CLOCK_500Hz', 'SW[9:0]', 'KEY[3:0]', 'LEDR[9:0]', 'HEXn[6:0]']);
    expect(signalRows(DEFAULT_BOARD)[5].meaning).toContain('HEX0_N to HEX5_N');
  });

  it('explains _N only on a board that uses it', () => {
    expect(usesActiveLowSuffix(DEFAULT_BOARD)).toBe(true);
    expect(usesActiveLowSuffix(DE1_SOC)).toBe(false);
  });
});

describe('boards of another shape (docs/board_io_v2_spec.md § 5.3, § 5.4)', () => {
  const BASYS3 = builtInBoard('basys3');

  it('say why the examples are missing, with the counts and boards of the Default shape', () => {
    expect(examplesNotice([DEFAULT_BOARD, DE1_SOC])).toBe(
      'The built-in examples are written for boards with 10 switches, 4 keys and 6 displays (Default, DE1-SoC).',
    );
  });

  it('start a workspace and a new file from the generated top, under the same names and ids', () => {
    const starters = starterFilesFor(BASYS3);
    expect(starters.map((file) => file.id)).toEqual(starterFilesFor(DEFAULT_BOARD).map((file) => file.id));
    expect(starters[0].content).toContain('Starter top file for the Basys 3 board');
    expect(newFileContent('blink.vhd', 'vhdl', BASYS3).text).toMatch(/entity blink is[\s\S]*btnC\s+: in {2}std_logic;/);
  });

  it('put the board name in front of a STIM length error, and leave other errors alone', () => {
    expect(withBoardName('STIM needs 21 bits for this board (switches 16 + buttons 5), got 14.', 'Basys 3')).toBe(
      'Basys 3: STIM needs 21 bits for this board (switches 16 + buttons 5), got 14.',
    );
    expect(withBoardName('RUN refused.', 'Basys 3')).toBe('RUN refused.');
    expect(withBoardName("report: the board has 3 states", 'Basys 3')).toBe('report: the board has 3 states');
    expect(withBoardName('Note: SW has a width HDLBoard cannot read (x); the board has 16 switches.', 'Basys 3')).toBe(
      'Note: SW has a width HDLBoard cannot read (x); the Basys 3 board has 16 switches.',
    );
    expect(withBoardName('SW is declared as std_logic_vector(9 downto 0) (10 bits), but the board has 16 switches.', 'Basys 3')).toBe(
      'SW is declared as std_logic_vector(9 downto 0) (10 bits), but the Basys 3 board has 16 switches.',
    );
  });

  it('lead the change dialog with what the student must do', () => {
    expect(differentIo(BASYS3)).toBe('These boards have different I/O. Your design will not run on Basys 3 until the changes listed below are made.');
  });

  it('heads the Board pane with the board\'s own names', () => {
    expect(buttonsTitle(BASYS3.ports.pushbuttons)).toBe('Pushbuttons (btnC, btnU, btnL, btnR, btnD)');
    expect(displaysTitle(builtInBoard('de10-lite').ports.sevenSegment)).toBe('7-Segment Displays (HEXn[7:0])');
  });
});

describe('Help on a board of another shape', () => {
  it('lists every port, with polarity and the multiplexing note', () => {
    const rows = signalRows(builtInBoard('nexys-a7'));
    expect(rows.map((row) => row.port)).toEqual(['CLK100MHZ', 'CLOCK_500Hz', 'SW[15:0]', 'BTNC, BTNU, BTNL, BTNR, BTND', 'CPU_RESETN', 'LED[15:0]', 'CA…CG', 'DP', 'AN[7:0]']);
    expect(rows[0].meaning).toContain('100 MHz clock');
    expect(rows[0].meaning).toContain('simulates more slowly');
    expect(rows[3].meaning).toContain("active high: released reads '0', pressed reads '1'");
    expect(rows[8].meaning).toContain('goes dark when it is not refreshed for 75 ms');
  });
});
