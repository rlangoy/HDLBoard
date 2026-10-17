// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import { describe, expect, test } from 'vitest';
import { unwrapCodeFence } from './pasteFence';

describe('pasting a Markdown code block', () => {
  test('keeps only the code inside the fence', () => {
    expect(unwrapCodeFence('```vhdl\nlibrary ieee;\nuse ieee.std_logic_1164.all;\n```')).toBe('library ieee;\nuse ieee.std_logic_1164.all;\n');
  });

  test('with or without a language, backticks or tildes, blank lines around it', () => {
    expect(unwrapCodeFence('\n```\nmodule m; endmodule\n```\n\n')).toBe('module m; endmodule\n');
    expect(unwrapCodeFence('~~~verilog\nmodule m; endmodule\n~~~')).toBe('module m; endmodule\n');
    expect(unwrapCodeFence('````vhdl\nx\n`````')).toBe('x\n');
  });

  test('keeps Windows line endings', () => {
    expect(unwrapCodeFence('```vhdl\r\na;\r\nb;\r\n```\r\n')).toBe('a;\r\nb;\r\n');
  });

  test('leaves everything else as it was pasted', () => {
    expect(unwrapCodeFence('library ieee;\nuse ieee.std_logic_1164.all;')).toBeNull();
    expect(unwrapCodeFence('Here is the code:\n```vhdl\na;\n```')).toBeNull();
    expect(unwrapCodeFence('```vhdl\na;\n```\nand\n```vhdl\nb;\n```')).toBeNull();
    expect(unwrapCodeFence('```vhdl\na;')).toBeNull();
    expect(unwrapCodeFence('```vhdl\na;\n~~~')).toBeNull();
    expect(unwrapCodeFence('```')).toBeNull();
  });
});
