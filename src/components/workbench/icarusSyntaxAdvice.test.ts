// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import { describe, expect, test } from 'vitest';
import { icarusSyntaxAdvice } from './icarusSyntaxAdvice';
import { sourceTokens } from './symbols/sourceTokens';
import { tokenizeVerilog } from './verilogHighlight';

function advice(source: string, line = 1) {
  const diagnostic = { fileId: 'f', line, severity: 'error' as const, message: 'syntax error', details: [] };
  return icarusSyntaxAdvice(diagnostic, sourceTokens(tokenizeVerilog(source.split('\n'))));
}

describe('syntax advice only when the source supports it', () => {
  test.each(['<=', '>=', '==', '!=', '===', '!=='])('does not confuse legal %s with assignment', (operator) => {
    expect(advice(`if (a ${operator} b) q = 1;`)).toBeUndefined();
  });

  test.each([
    'initial $display("if (a = b) q =< 1; 4\'b1020");',
    '// if (a = b) q =< 1;',
    '/* if (a = b)\n q =< 1; */',
    "initial q = 4'b10xz;",
    "initial q = 4'b10?1;",
    "initial q = 8'hfa;",
    '`ifdef ENABLED\nmodule x;\n`endif\n',
    'module m; initial begin end endmodule',
    'always @(posedge clk) q <= 1;',
    'always @(posedge clk\n or negedge rst) q <= 1;',
    'if (a q = 1;',
  ])('declines legal or uncertain code: %s', (source) => {
    expect(advice(source)).toBeUndefined();
  });

  test.each(["4'b1020", "8'o89", "4'd1a"])('explains an invalid literal %s', (literal) => {
    expect(advice(`initial q = ${literal};`)?.headline).toContain('invalid base-');
  });

  test('declines an ordinary statement even if the surrounding block is still open', () => {
    expect(advice('initial begin\nq = 1;', 2)).toBeUndefined();
  });

  test('a blank line at EOF can explain a missing closer', () => {
    expect(advice('module top;\ninitial begin\nq = 1;\n', 4)).toMatchObject({
      headline: 'Probably a missing `end` for `begin` on line 2.', relatedLine: 2,
    });
  });

  test('ordinary names that match JavaScript prototype properties are not block openers', () => {
    expect(advice('module constructor;\nwire toString;\n', 3)).toMatchObject({
      headline: 'Probably a missing `endmodule` for `module` on line 1.', relatedLine: 1,
    });
  });

  test('does not infer block intent from indentation alone', () => {
    expect(advice('initial begin\n  if (a) b = 1;\n  c = 1;\nend', 3)).toBeUndefined();
  });

  test('does not infer a case colon outside a case', () => {
    expect(advice('0 q = 1;')).toBeUndefined();
  });
});
