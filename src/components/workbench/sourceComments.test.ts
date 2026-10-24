// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import { describe, expect, it } from 'vitest';
import { withoutComments } from './sourceComments';

describe('withoutComments', () => {
  it('removes Verilog line and block comments', () => {
    expect(withoutComments('a // one\nb /* two */ c', 'verilog')).toBe('a  \nb   c');
  });

  it('keeps the line breaks of a block comment, so the lines stay', () => {
    expect(withoutComments('a /* one\ntwo */ b', 'verilog').split('\n')).toHaveLength(2);
  });

  it('leaves a comment marker inside a Verilog string alone', () => {
    const code = '$display("/* start"); module m; endmodule';
    expect(withoutComments(code, 'verilog')).toBe(code);
  });

  it('knows an escaped quote in a Verilog string', () => {
    const code = '$display("say \\"// hi\\""); x = 1;';
    expect(withoutComments(code, 'verilog')).toBe(code);
  });

  it('removes VHDL line comments and VHDL-2008 block comments', () => {
    expect(withoutComments('a -- one\n/* entity counter_tb is */ b', 'vhdl')).toBe('a  \n  b');
  });

  it('leaves -- inside a VHDL string alone, with its doubled quotes', () => {
    const code = 'report "a -- b ""quoted""";';
    expect(withoutComments(code, 'vhdl')).toBe(code);
  });

  it('reads a VHDL character literal quote as code, not as a string', () => {
    expect(withoutComments(`c <= '"'; -- note`, 'vhdl')).toBe(`c <= '"';  `);
  });

  it('ends at an unclosed block comment', () => {
    expect(withoutComments('a /* never closed', 'verilog')).toBe('a  ');
  });
});
