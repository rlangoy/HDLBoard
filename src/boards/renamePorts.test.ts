// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import { describe, expect, it } from 'vitest';
import { EXAMPLE_FILES, STARTER_FILES } from '../components/workbench/files';
import { languageOf } from './boards.testSupport';
import { BUILT_IN_BOARDS, builtInBoard, DEFAULT_BOARD } from './boardCatalog';
import { renamesBetween, type PortRename } from './boardPorts';
import {
  applyBoardChange,
  keepColumn,
  planBoardChange,
  renameInSource,
  renameWaveViews,
  testbenchLanguageIn,
  translateFromDefault,
} from './renamePorts';

const DE1_SOC = builtInBoard('de1-soc');
const TO_DE1 = renamesBetween(DEFAULT_BOARD, DE1_SOC);
const TO_DEFAULT = renamesBetween(DE1_SOC, DEFAULT_BOARD);

/** The renamed text; the rename must succeed. */
function renamed(text: string, language: 'vhdl' | 'verilog', renames: readonly PortRename[] = TO_DE1): string {
  const result = renameInSource(text, language, renames);
  if (!result.ok) throw new Error(`unexpected conflict: ${result.reasons.join('; ')}`);
  return result.text;
}

function reasonsOf(text: string, language: 'vhdl' | 'verilog', renames: readonly PortRename[] = TO_DE1): readonly string[] {
  const result = renameInSource(text, language, renames);
  return result.ok ? [] : result.reasons;
}

describe('renamesBetween', () => {
  it('lists every name that differs, the displays element by element', () => {
    expect(TO_DE1).toEqual([
      { from: 'KEY_N', to: 'KEY' },
      ...[0, 1, 2, 3, 4, 5].map((i) => ({ from: `HEX${i}_N`, to: `HEX${i}` })),
    ]);
    expect(renamesBetween(DE1_SOC, DE1_SOC)).toEqual([]);
  });
});

describe('renameInSource in VHDL', () => {
  it('renames a declaration, an index, an attribute and a lower-case use, in the board spelling', () => {
    const source = [
      'KEY_N : in std_logic_vector(3 downto 0);',
      'x <= KEY_N(0);',
      'for i in KEY_N\'range loop',
      'y <= key_n(1);',
    ].join('\n');
    expect(renamed(source, 'vhdl')).toBe(
      ['KEY : in std_logic_vector(3 downto 0);', 'x <= KEY(0);', "for i in KEY'range loop", 'y <= KEY(1);'].join('\n'),
    );
  });

  it('renames named association, selected names and aliases', () => {
    expect(renamed('u: entity work.top port map (KEY_N => k);', 'vhdl')).toBe('u: entity work.top port map (KEY => k);');
    expect(renamed('x <= rec.KEY_N;', 'vhdl')).toBe('x <= rec.KEY;');
    expect(renamed('alias k is KEY_N;', 'vhdl')).toBe('alias k is KEY;');
  });

  it('leaves longer names, strings and extended identifiers alone', () => {
    expect(renamed('HEX0_N_reg <= HEX0_N;', 'vhdl')).toBe('HEX0_N_reg <= HEX0;');
    expect(renamed('report "KEY_N is " & to_string(KEY_N);', 'vhdl')).toBe('report "KEY_N is " & to_string(KEY);');
    expect(renamed('x <= \\KEY_N\\ and KEY_N(0);', 'vhdl')).toBe('x <= \\KEY_N\\ and KEY(0);');
  });

  it('renames a comment only where the file also uses the name in code, whole words and exact case', () => {
    expect(renamed('x <= KEY_N(1); -- KEY_N(1): reset', 'vhdl')).toBe('x <= KEY(1); -- KEY(1): reset');
    expect(renamed('x <= KEY_N(1); -- the key_n is pressed', 'vhdl')).toBe('x <= KEY(1); -- the key_n is pressed');
    const proseOnly = renameInSource('-- hold KEY_N pressed\nx <= SW;', 'vhdl', TO_DE1);
    expect(proseOnly).toEqual({ ok: true, text: '-- hold KEY_N pressed\nx <= SW;', count: 0 });
  });

  it('never renames the English word in a comment on the way back', () => {
    expect(renamed('x <= KEY(1); -- press the key, any KEY', 'vhdl', TO_DEFAULT)).toBe('x <= KEY_N(1); -- press the key, any KEY_N');
  });

  it('renames inside a VHDL-2008 /* */ comment, which the editor does not colour as one (pinned)', () => {
    expect(renamed('x <= KEY_N(0); /* KEY_N */', 'vhdl')).toBe('x <= KEY(0); /* KEY */');
  });

  it('counts each renamed name and comment word', () => {
    expect(renameInSource('x <= KEY_N(0) and KEY_N(1); -- KEY_N', 'vhdl', TO_DE1)).toMatchObject({ ok: true, count: 3 });
  });

  it('is a conflict when the new name is already a name in the file', () => {
    expect(reasonsOf('signal key : std_logic;\nkey <= KEY_N(0);', 'vhdl')).toEqual(['KEY is already a name in this file']);
  });

  it('is no conflict when the file already uses only the new names', () => {
    expect(renameInSource('x <= KEY(0);', 'vhdl', TO_DE1)).toEqual({ ok: true, text: 'x <= KEY(0);', count: 0 });
  });

  it('swaps two names in one pass', () => {
    const swap = [
      { from: 'A', to: 'B' },
      { from: 'B', to: 'A' },
    ];
    expect(renamed('x <= A and B;', 'vhdl', swap)).toBe('x <= B and A;');
  });
});

describe('renameInSource in Verilog', () => {
  it('renames a port, a part select and a hierarchical name', () => {
    expect(renamed('input wire [3:0] KEY_N,', 'verilog')).toBe('input wire [3:0] KEY,');
    expect(renamed('assign x = KEY_N[1:0];', 'verilog')).toBe('assign x = KEY[1:0];');
    expect(renamed('$display("%b", uut.KEY_N);', 'verilog')).toBe('$display("%b", uut.KEY);');
  });

  it('renames a macro and its uses together', () => {
    expect(renamed('`define KEY_N 4\nassign x = `KEY_N;', 'verilog')).toBe('`define KEY 4\nassign x = `KEY;');
  });

  it('changes only the argument of a $display, not its string', () => {
    expect(renamed('$display("KEY_N=%b", KEY_N);', 'verilog')).toBe('$display("KEY_N=%b", KEY);');
  });

  it('leaves an escaped identifier alone', () => {
    expect(renamed('wire \\KEY_N ; assign y = KEY_N;', 'verilog')).toBe('wire \\KEY_N ; assign y = KEY;');
  });

  it('renames inside a block comment across lines', () => {
    expect(renamed('assign y = KEY_N;\n/* uses\n   KEY_N here */', 'verilog')).toBe('assign y = KEY;\n/* uses\n   KEY here */');
  });

  it('is a conflict when a name is spelled two ways, which are two names in Verilog', () => {
    expect(reasonsOf('input [3:0] KEY_N; wire [3:0] key_n;', 'verilog')).toEqual(['KEY_N and key_n are different names in Verilog']);
  });
});

describe('the rename keeps the file as it was otherwise', () => {
  it('keeps CRLF line endings and a byte-order mark', () => {
    const source = '﻿entity t is\r\n  port (KEY_N : in bit);\r\nend;\r\n';
    expect(renamed(source, 'vhdl')).toBe('﻿entity t is\r\n  port (KEY : in bit);\r\nend;\r\n');
  });
});

describe('keepColumn', () => {
  it('keeps an aligned column after a shorter or longer name', () => {
    expect(renamed('        KEY_N    : in  std_logic_vector(3 downto 0);', 'vhdl')).toBe(
      '        KEY      : in  std_logic_vector(3 downto 0);',
    );
    expect(renamed('        KEY      : in', 'vhdl', TO_DEFAULT)).toBe('        KEY_N    : in');
  });

  it('never changes a single space or whitespace with a tab', () => {
    expect(keepColumn(' ', 2)).toBe(' ');
    expect(keepColumn('\t ', 2)).toBe('\t ');
    expect(renamed('HEX0_N <= x;', 'vhdl')).toBe('HEX0 <= x;');
  });

  it('never shrinks an alignment below one space', () => {
    expect(keepColumn('  ', -5)).toBe(' ');
  });
});

describe('translateFromDefault', () => {
  const sources = [...EXAMPLE_FILES, ...STARTER_FILES];

  it.each(BUILT_IN_BOARDS.map((board) => [board.name, board] as const))(
    'translates every built-in source to %s without a conflict, and back again exactly',
    (_name, board) => {
      for (const file of sources) {
        const language = languageOf(file.name);
        const translated = translateFromDefault(file.content, language, board);
        expect(translated.untranslated, file.name).toBeUndefined();
        const back = renameInSource(translated.text, language, renamesBetween(board, DEFAULT_BOARD));
        expect(back, file.name).toEqual(expect.objectContaining({ ok: true, text: file.content }));
      }
    },
  );

  it('leaves no Default name behind on the DE1-SoC', () => {
    for (const file of sources) {
      const translated = translateFromDefault(file.content, languageOf(file.name), DE1_SOC);
      expect(translated.text, file.name).not.toMatch(/\b(?:KEY_N|HEX\d_N)\b/i);
    }
  });

  it('gives a source back as written, with why, when the board\'s names clash with its own', () => {
    const source = 'entity key is port (KEY_N : in bit_vector(3 downto 0)); end;';
    expect(translateFromDefault(source, 'vhdl', DE1_SOC)).toEqual({ text: source, untranslated: ['KEY is already a name in this file'] });
  });
});

describe('planBoardChange and applyBoardChange', () => {
  const files = [
    { id: 'a', name: 'top.vhdl', folder: 'vhdl', content: 'entity top is port (KEY_N : in bit_vector(3 downto 0)); end;' },
    { id: 'b', name: 'notes.txt', folder: 'vhdl', content: 'KEY_N' },
    { id: 'c', name: 'top.v', folder: 'verilog', content: 'module top(input [3:0] KEY_N, output [6:0] HEX0_N); endmodule' },
    { id: 'd', name: 'and.vhdl', folder: 'vhdl', content: 'entity a is end;' },
  ];

  it('plans the files that change, with their counts, and leaves the input alone', () => {
    const plan = planBoardChange(files, DEFAULT_BOARD, DE1_SOC);
    expect(plan.conflicts).toEqual([]);
    expect(plan.changes.map((change) => [change.fileName, change.count])).toEqual([
      ['top.vhdl', 1],
      ['top.v', 2],
    ]);
    expect(plan.totalCount).toBe(3);
    expect(plan.basis).toBe(files);

    const applied = applyBoardChange(files, plan);
    expect(applied).not.toBe(files);
    expect(applied[0].content).toContain('KEY : in');
    expect(applied[1]).toBe(files[1]);
    expect(files[0].content).toContain('KEY_N');
  });

  it('reports a conflict in one file, and the plan cannot be applied', () => {
    const clash = [...files, { id: 'e', name: 'tb.vhdl', folder: 'work', content: 'signal key : bit; x <= KEY_N(0);' }];
    const plan = planBoardChange(clash, DEFAULT_BOARD, DE1_SOC);
    expect(plan.conflicts).toEqual([{ fileName: 'tb.vhdl', reasons: ['KEY is already a name in this file'] }]);
    expect(() => applyBoardChange(clash, plan)).toThrow();
  });

  it('renames a saved path in the case the simulator wrote it: GHDL lower-cases VHDL names', () => {
    const views = { counter_tb: { signals: [{ path: 'uut/key_n' }, { path: 'uut/HEX0_N' }] } };
    expect(renameWaveViews(views, TO_DE1)?.counter_tb.signals).toEqual([{ path: 'uut/key' }, { path: 'uut/HEX0' }]);
  });

  it('writes a lower-case Verilog port in the board spelling, as Icarus will after the rename', () => {
    const verilog = [{ id: 'v', name: 'counter_tb.v', content: 'module counter_tb; counter uut (.key_n(k)); endmodule' }];
    const views = { counter_tb: { signals: [{ path: 'uut/key_n' }] } };
    expect(renameWaveViews(views, TO_DE1, testbenchLanguageIn(verilog))?.counter_tb.signals).toEqual([{ path: 'uut/KEY' }]);
  });

  it('writes a VHDL port in lower case, as GHDL does, whatever its old case', () => {
    const vhdl = [{ id: 'h', name: 'counter_tb.vhd', content: 'entity Counter_TB is end entity;' }];
    const views = { counter_tb: { signals: [{ path: 'uut/KEY_N' }] } };
    expect(renameWaveViews(views, TO_DE1, testbenchLanguageIn(vhdl))?.counter_tb.signals).toEqual([{ path: 'uut/key' }]);
  });

  it('does not count a unit named only in a comment', () => {
    const files = [
      { id: 'h', name: 'counter_tb.vhd', content: 'entity counter_tb is end entity;' },
      { id: 'v', name: 'notes.v', content: '// this module counter_tb is the VHDL one\nmodule other; endmodule' },
    ];
    expect(testbenchLanguageIn(files)('counter_tb')).toBe('vhdl');
  });

  it('cannot tell the language of a testbench both languages declare', () => {
    const both = [
      { id: 'h', name: 'counter_tb.vhd', content: 'entity counter_tb is end entity;' },
      { id: 'v', name: 'counter_tb.v', content: 'module counter_tb; endmodule' },
    ];
    expect(testbenchLanguageIn(both)('counter_tb')).toBeUndefined();
  });

  it('renames saved waveform paths, and back again', () => {
    const views = { counter_tb: { signals: [{ path: 'uut/KEY_N', showAs: 'binary' }, { path: 'clk' }], notShown: [{ path: 'uut/hex0_n' }] } };
    const there = renameWaveViews(views, TO_DE1);
    expect(there).toEqual({ counter_tb: { signals: [{ path: 'uut/KEY', showAs: 'binary' }, { path: 'clk' }], notShown: [{ path: 'uut/hex0' }] } });
    expect(renameWaveViews(there, TO_DEFAULT)?.counter_tb.signals).toEqual(views.counter_tb.signals);
    expect(renameWaveViews(undefined, TO_DE1)).toBeUndefined();
  });
});
