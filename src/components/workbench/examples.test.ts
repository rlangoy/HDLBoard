// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import { describe, expect, test } from 'vitest';
import { EXAMPLE_FILES, STARTER_FILES, type VhdlFile } from './files';
import { EXAMPLES, copyExample, filterExamples, type Example } from './examples';

const example = (id: string): Example => {
  const found = EXAMPLES.find((e) => e.id === id);
  if (!found) throw new Error(`no example ${id}`);
  return found;
};

const counter = () => {
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
    expect(filterExamples(EXAMPLES, '  ')).toBe(EXAMPLES);
  });

  test('matches title, language and file name, every word required', () => {
    expect(filterExamples(EXAMPLES, 'blink verilog').map((e) => e.id)).toEqual(['blink_verilog']);
    expect(filterExamples(EXAMPLES, 'and_gate_tb.vhd').map((e) => e.id)).toEqual(['and_gate_tb_vhdl']);
    expect(filterExamples(EXAMPLES, 'nothing like this')).toEqual([]);
  });
});

describe('copyExample', () => {
  test('copies the file under a fresh id and opens it', () => {
    const result = copyExample(example('blink_vhdl'), STARTER_FILES, counter());
    expect(result.added).toHaveLength(1);
    expect(result.added[0]).toMatchObject({ id: 'file-1', name: 'blinkTest.vhdl', folder: 'vhdl' });
    expect(result.openId).toBe('file-1');
    expect(result.kept).toEqual([]);
  });

  test('a testbench brings its design along, and opens the testbench', () => {
    const result = copyExample(example('and_gate_tb_verilog'), STARTER_FILES, counter());
    expect(result.added.map((f) => f.name)).toEqual(['and_gate_tb.v', 'and_gate.v']);
    expect(result.openId).toBe('file-1');
  });

  test('never overwrites a file the project already has: it is opened instead', () => {
    const edited: VhdlFile = { id: 'file-9', name: 'and_gate.v', folder: 'verilog', content: '// mine' };
    const result = copyExample(example('and_gate_tb_verilog'), [...STARTER_FILES, edited], counter());
    expect(result.added.map((f) => f.name)).toEqual(['and_gate_tb.v']);
    expect(result.kept).toEqual(['and_gate.v']);

    const again = copyExample(example('and_gate_verilog'), [edited], counter());
    expect(again).toEqual({ added: [], kept: ['and_gate.v'], openId: 'file-9' });
  });
});
