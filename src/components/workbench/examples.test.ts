// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import { describe, expect, test } from 'vitest';
import { EXAMPLE_FILES, STARTER_FILES, type VhdlFile } from './files';
import { EXAMPLES, copyExample, examplesFor, filterExamples, hasExamples, type Example } from './examples';
import { DEFAULT_BOARD, builtInBoard } from '../../boards/boardCatalog';

const example = (id: string): Example => {
  const found = EXAMPLES.find((e) => e.id === id);
  if (!found) throw new Error(`no example ${id}`);
  return found;
};

/** Hands out file-1, file-2, … as Workbench's own id sequence does. */
const idSequence = () => {
  let n = 0;
  return () => `file-${++n}`;
};

describe('the examples catalogue', () => {
  test('a fresh workspace holds only the two DE1_SoC top-level files', () => {
    expect(STARTER_FILES.map((f) => f.name)).toEqual(['DE1_SoC.vhdl', 'DE1_SoC.v']);
  });

  test('every built-in file is offered by some example', () => {
    const offered = new Set(EXAMPLES.flatMap((e) => e.fileIds));
    for (const file of EXAMPLE_FILES) expect(offered.has(file.id), file.name).toBe(true);
  });

  test("every example's files exist and sit in its language's folder", () => {
    for (const e of EXAMPLES) {
      for (const id of e.fileIds) {
        const file = EXAMPLE_FILES.find((f) => f.id === id);
        expect(file, `${e.id}: ${id}`).toBeDefined();
        expect(file?.folder).toBe(e.language);
      }
    }
  });
});

describe('filterExamples', () => {
  test('an empty query keeps everything', () => {
    expect(filterExamples(EXAMPLES, '  ')).toEqual(EXAMPLES);
  });

  test('keeps only the chosen languages', () => {
    const verilogOnly = filterExamples(EXAMPLES, '', new Set(['verilog']));
    expect(verilogOnly.length).toBe(EXAMPLES.length / 2);
    expect(verilogOnly.every((e) => e.language === 'verilog')).toBe(true);
    expect(filterExamples(EXAMPLES, 'blink', new Set(['vhdl'])).map((e) => e.id)).toEqual(['blink_vhdl']);
    expect(filterExamples(EXAMPLES, '', new Set())).toEqual([]);
  });

  test('matches title, language and file name, every word required', () => {
    expect(filterExamples(EXAMPLES, 'blink verilog').map((e) => e.id)).toEqual(['blink_verilog']);
    expect(filterExamples(EXAMPLES, 'and_gate_tb.vhd').map((e) => e.id)).toEqual(['and_gate_tb_vhdl']);
    expect(filterExamples(EXAMPLES, 'truth table').map((e) => e.id)).toEqual([
      'and_gate_truthtable_tb_vhdl',
      'and_gate_truthtable_tb_verilog',
    ]);
    expect(filterExamples(EXAMPLES, 'nothing like this')).toEqual([]);
  });
});

describe('copyExample', () => {
  test('an example naming a file that is not built in is a bug, not a silent skip', () => {
    const broken: Example = { ...example('blink_vhdl'), fileIds: ['no_such_file'] };
    expect(() => copyExample(broken, STARTER_FILES, idSequence(), DEFAULT_BOARD)).toThrow('no_such_file');
  });

  test('copies the file under a fresh id and opens it', () => {
    const result = copyExample(example('blink_vhdl'), STARTER_FILES, idSequence(), DEFAULT_BOARD);
    expect(result.added).toHaveLength(1);
    expect(result.added[0]).toMatchObject({ id: 'file-1', name: 'blinkTest.vhdl', folder: 'vhdl' });
    expect(result.openId).toBe('file-1');
    expect(result.kept).toEqual([]);
  });

  test('a testbench brings its design along, and opens the testbench', () => {
    const result = copyExample(example('and_gate_tb_verilog'), STARTER_FILES, idSequence(), DEFAULT_BOARD);
    expect(result.added.map((f) => f.name)).toEqual(['and_gate_tb.v', 'and_gate.v']);
    expect(result.openId).toBe('file-1');
  });

  test('never overwrites a file the project already has: it is opened instead', () => {
    const edited: VhdlFile = { id: 'file-9', name: 'and_gate.v', folder: 'verilog', content: '// mine' };
    const result = copyExample(example('and_gate_tb_verilog'), [...STARTER_FILES, edited], idSequence(), DEFAULT_BOARD);
    expect(result.added.map((f) => f.name)).toEqual(['and_gate_tb.v']);
    expect(result.kept).toEqual(['and_gate.v']);

    const again = copyExample(example('and_gate_verilog'), [edited], idSequence(), DEFAULT_BOARD);
    expect(again).toEqual({ added: [], kept: ['and_gate.v'], openId: 'file-9', descriptions: {}, untranslated: [] });
  });

  test("describes each copied file for the project's file list, by the example card it opens itself", () => {
    const result = copyExample(example('and_gate_tb_verilog'), STARTER_FILES, idSequence(), DEFAULT_BOARD);
    expect(result.descriptions).toEqual({
      'and_gate_tb.v': example('and_gate_tb_verilog').description,
      'and_gate.v': example('and_gate_verilog').description,
    });
    expect(result.descriptions['and_gate.v']).toBe('Basic AND gate implementation.');
  });

  test('describes a single-file example by its own card', () => {
    expect(copyExample(example('blink_vhdl'), STARTER_FILES, idSequence(), DEFAULT_BOARD).descriptions).toEqual({
      'blinkTest.vhdl': 'Simple blinking LED example using a counter.',
    });
  });
});

describe('examples written for Basys 3, Nexys A7 and DE10-Lite', () => {
  const boards = ['basys3', 'nexys-a7', 'de10-lite'].map((id) => builtInBoard(id));

  test('only boards with their own display files offer the display examples', () => {
    const original = EXAMPLES.filter((e) => !e.usesHex).map((e) => e.id);
    expect(original).not.toContain('key_counter_7seg_vhdl');
    for (const board of boards) {
      expect(hasExamples(board), board.name).toBe(true);
      const expected = board.id === 'de10-lite' ? original : EXAMPLES.map((e) => e.id);
      expect(examplesFor(board).map((e) => e.id), board.name).toEqual(expected);
    }
    expect(examplesFor(DEFAULT_BOARD)).toEqual(EXAMPLES);
  });

  test('a board with neither the Default shape nor files of its own has none', () => {
    const custom = { ...builtInBoard('basys3'), id: 'my-own-board' };
    expect(hasExamples(custom)).toBe(false);
    expect(examplesFor(custom)).toEqual([]);
  });

  test("every example copies in the board's own names, and mentions no display", () => {
    for (const board of boards) {
      for (const e of examplesFor(board).filter((entry) => !entry.usesHex)) {
        const result = copyExample(e, [], idSequence(), board);
        expect(result.untranslated).toEqual([]);
        for (const f of result.added) expect(f.content, `${board.name}: ${f.name}`).not.toMatch(/\bHEX|\bseg\b|\bsegment/i);
        const names = result.added.map((f) => f.name);
        expect(new Set(names).size).toBe(names.length);
      }
    }
  });

  test.each(['basys3', 'nexys-a7'])('%s copies its display counters', (id) => {
    const board = builtInBoard(id);
    for (const language of ['vhdl', 'verilog']) {
      const e = examplesFor(board).find((entry) => entry.id === `key_counter_7seg_${language}`);
      expect(e).toBeDefined();
      const file = copyExample(e!, [], idSequence(), board).added[0];
      expect(file.name).toBe(`keyCounter7Seg.${language === 'vhdl' ? 'vhdl' : 'v'}`);
      expect(file.content).toContain('CLOCK_500Hz');
      expect(e?.description).toContain(id === 'basys3' ? 'btnC' : 'BTNC');
    }
  });

  test('the top level and the key examples use only the ports of the board', () => {
    const basys = builtInBoard('basys3');
    const top = copyExample(example('de1_soc_vhdl'), [], idSequence(), basys).added[0];
    expect(top.name).toBe('Basys_3.vhdl');
    expect(top.content).toContain('led <= sw;');
    expect(top.content).not.toMatch(/btn|clk/);
    const counter = copyExample(example('key_counter_verilog'), [], idSequence(), basys).added[0];
    expect(counter.content).toMatch(/input\s+wire\s+btnC/);
    expect(counter.content).not.toMatch(/\bsw\b|\bclk\b/);
    expect(examplesFor(basys).find((e) => e.key === 'key_uart_tx')?.description).toContain('btnC');
  });

  test('the DE10-Lite keeps its two keys and 50 MHz clock; the 100 MHz boards double the UART divider', () => {
    const uart = (id: string) => copyExample(example('key_uart_tx_vhdl'), [], idSequence(), builtInBoard(id)).added[0].content;
    expect(uart('de10-lite')).toContain('MAX10_CLK1_50 : in');
    expect(uart('de10-lite')).toContain('50_000_000');
    expect(uart('basys3')).toContain('100_000_000');
    expect(uart('nexys-a7')).toContain('CLK100MHZ : in');
  });
});
