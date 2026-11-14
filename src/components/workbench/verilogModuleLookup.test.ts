// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import { describe, expect, test } from 'vitest';
import { sourceTokens } from './symbols/sourceTokens';
import { tokenizeVerilog } from './verilogHighlight';
import { VerilogModuleLookup } from './verilogModuleLookup';

function lookup(...sources: string[]): VerilogModuleLookup {
  const tokens = sources.map((content) => sourceTokens(tokenizeVerilog(content.split('\n'))));
  return new VerilogModuleLookup(new Map(tokens.map((fileTokens, i) => [`${i}`, fileTokens])));
}

const TOP = 'module top;\nchild u1(.dtaa(0));\nendmodule';
const CHILD = 'module child(input [3:0] data); endmodule';

describe('module member suggestions', () => {
  test('resolves a port from another file', () => {
    expect(lookup(TOP, CHILD).suggestMember({ fileId: '0', line: 2, instance: 'u1', kind: 'port', name: 'dtaa' })).toBe('data');
  });

  test('finds an instance that follows the end of a block', () => {
    const top = 'module top;\ninitial begin x = 0; end\nchild u1(.dtaa(0));\nendmodule';
    expect(lookup(top, CHILD).suggestMember({ fileId: '0', line: 3, instance: 'u1', kind: 'port', name: 'dtaa' })).toBe('data');
  });

  test('handles non-ANSI port declarations', () => {
    expect(lookup(TOP, 'module child(data); input data; endmodule').suggestMember({ fileId: '0', line: 2, instance: 'u1', kind: 'port', name: 'dtaa' })).toBe('data');
  });

  test('resolves a multiline parameter override', () => {
    const top = 'module top;\nchild #(\n.WIDHT(8)\n) u1();\nendmodule';
    expect(lookup(top, 'module child #(parameter WIDTH=4)(); endmodule').suggestMember({ fileId: '0', line: 3, instance: 'top.u1', kind: 'parameter', name: 'WIDHT' })).toBe('WIDTH');
  });

  test.each([
    'module child(input datum); endmodule\nmodule child(input data); endmodule',
    'module child; wire data; endmodule',
    'module child; task t; input data; endtask endmodule',
    'module child; localparam WIDTH=4; endmodule',
    '`ifdef A\nmodule child(input data); endmodule\n`endif',
  ])('does not guess from ambiguous or irrelevant declarations: %s', (source) => {
    expect(lookup(TOP, source).suggestMember({ fileId: '0', line: 2, instance: 'u1', kind: 'port', name: 'dtaa' })).toBeUndefined();
  });

  test('uses the instance at the reported location when two modules reuse a name', () => {
    const top = `${TOP}\nmodule other;\nsecond u1(.dtaa(0));\nendmodule`;
    expect(lookup(top, CHILD, 'module second(input datum); endmodule').suggestMember({ fileId: '0', line: 2, instance: 'u1', kind: 'port', name: 'dtaa' })).toBe('data');
  });

  test('ties between close names do not produce a correction', () => {
    expect(lookup(TOP, 'module child(input data, input dtba); endmodule').suggestMember({ fileId: '0', line: 2, instance: 'u1', kind: 'port', name: 'dtaa' })).toBeUndefined();
  });

  test('Verilog names are case-sensitive', () => {
    expect(lookup(TOP, CHILD).suggestMember({ fileId: '0', line: 2, instance: 'u1', kind: 'port', name: 'Data' })).toBe('data');
  });

  test('does not correct a name that is already declared', () => {
    expect(lookup(TOP, CHILD).suggestMember({ fileId: '0', line: 2, instance: 'u1', kind: 'port', name: 'data' })).toBeUndefined();
  });

  test('suggests a unique module name', () => {
    expect(lookup(CHILD).suggestModule('chlid')).toBe('child');
  });

  test('does not suggest an ambiguously declared module', () => {
    expect(lookup(CHILD, CHILD).suggestModule('chlid')).toBeUndefined();
  });
});
