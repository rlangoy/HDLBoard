// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import { describe, expect, test } from 'vitest';
import { BOARD_PORTS, checkOf, source, vhdlDesign, vhdlDesignWith } from './simOnly.testSupport';

/**
 * docs/impl_sim_only_warnings.md § 3.3: a `line` variable in a function that only
 * computes a constant. Each case was synthesized with Quartus Prime Lite 25.1 and
 * GHDL 6.0 `--synth`: both build the text-printing function, GHDL rejects the `line`
 * variable once a process uses it, and Quartus builds a ROM read from a file as zeros.
 */

const design = (declarations: string, body = "LEDR(0) <= '1';") =>
  vhdlDesignWith(declarations, vhdlDesign('top', BOARD_PORTS, body)).replace('library ieee;', 'library ieee;\nuse std.textio.all;');

/** The lines of the file-I/O findings, and the lines of `content` that hold `needles`. */
const fileIoLines = (content: string) =>
  checkOf([source('top.vhd', content)]).findings.filter((f) => f.construct === 'vhdl-file-io').map((f) => f.line);
const linesWith = (content: string, ...needles: string[]) =>
  content.split('\n').flatMap((text, i) => (needles.some((n) => text.includes(n)) ? [i + 1] : []));

const PRINTS = (name: string) =>
  `function ${name} return natural is\n  variable l : line;\nbegin\n  write(l, 42);\n  writeline(output, l);\n  return 5;\nend function;`;

describe('a function that prints while it computes a constant is not file I/O', () => {
  test('its constant is the only call', () => {
    expect(fileIoLines(design(`${PRINTS('f')}\nconstant C : natural := f;`))).toEqual([]);
  });

  test('PoC arith_addw: the writes in translate_off, the line variable not', () => {
    const fn = 'impure function f return natural is\n  variable l : line;\nbegin\n  --synthesis translate_off\n  write(l, 1);\n  writeline(output, l);\n  --synthesis translate_on\n  return 5;\nend f;';
    expect(fileIoLines(design(`${fn}\nconstant C : natural := f;`))).toEqual([]);
  });

  test("a signal's width and initial value", () => {
    expect(fileIoLines(design(`${PRINTS('f')}\nsignal s : std_logic_vector(f - 1 downto 0) := (others => '0');`))).toEqual([]);
  });

  test('called by another function that computes a constant', () => {
    const g = 'function g return natural is\nbegin\n  return f + 1;\nend function;';
    expect(fileIoLines(design(`${PRINTS('f')}\n${g}\nconstant C : natural := g;`))).toEqual([]);
  });

  test('a forward declaration is not a call', () => {
    expect(fileIoLines(design(`function f return natural;\n${PRINTS('f')}\nconstant C : natural := f;`))).toEqual([]);
  });

  test('a call that synthesis never reads', () => {
    const body = "process (CLOCK_50)\nbegin\n  --synthesis translate_off\n  LEDR(1) <= '1' when f = 5 else '0';\n  --synthesis translate_on\nend process;";
    expect(fileIoLines(design(`${PRINTS('f')}\nconstant C : natural := f;`, body))).toEqual([]);
  });
});

describe('a subprogram nothing calls runs nowhere', () => {
  test("riscv_vhdl otp_clocked: a file-reading init_ram whose call is commented out (Quartus builds it)", () => {
    const load = [
      'type ram_t is array (0 to 3) of std_logic_vector(7 downto 0);',
      'impure function init_ram(file_name : in string) return ram_t is',
      '  file ram_file : text open read_mode is file_name;',
      '  variable l : line;',
      '  variable r : ram_t;',
      'begin',
      '  readline(ram_file, l);',
      '  return r;',
      'end function;',
      'signal ram : ram_t;-- := init_ram("ram.hex");',
    ].join('\n');
    expect(fileIoLines(design(load))).toEqual([]);
  });

  test('a procedure that writes a line, never called', () => {
    expect(fileIoLines(design('procedure say is\n  variable l : line;\nbegin\n  write(l, 1);\n  writeline(output, l);\nend procedure;'))).toEqual([]);
  });

  test('the same procedure, called from a process, is file I/O', () => {
    const content = design('procedure say is\n  variable l : line;\nbegin\n  write(l, 1);\n  writeline(output, l);\nend procedure;', 'process (CLOCK_50)\nbegin\n  say;\nend process;');
    expect(fileIoLines(content)).toEqual(linesWith(content, 'variable l : line', 'writeline('));
  });
});

describe('file I/O that still is', () => {
  test('a line variable in a process', () => {
    const body = 'process (CLOCK_50)\n  variable l : line;\nbegin\n  write(l, 1);\n  writeline(output, l);\nend process;';
    const content = design('', body);
    expect(fileIoLines(content)).toEqual(linesWith(content, 'variable l : line', 'writeline('));
  });

  test('a function a process calls, not only a constant', () => {
    const body = "process (CLOCK_50)\nbegin\n  if rising_edge(CLOCK_50) then\n    LEDR(0) <= '1' when f = 5 else '0';\n  end if;\nend process;";
    const content = design(`${PRINTS('f')}\nconstant C : natural := f;`, body);
    expect(fileIoLines(content)).toEqual(linesWith(content, 'variable l : line', 'writeline('));
  });

  test('a function called by a function that a process calls', () => {
    const g = 'function g return natural is\nbegin\n  return f + 1;\nend function;';
    const body = "LEDR(0) <= '1' when g = 6 else '0';";
    const content = design(`${PRINTS('f')}\n${g}`, body);
    expect(fileIoLines(content)).toEqual(linesWith(content, 'variable l : line', 'writeline('));
  });

  test('a ROM read from a file: Quartus builds it without the contents', () => {
    const load = [
      'type rom_t is array (0 to 3) of std_logic_vector(7 downto 0);',
      'impure function load return rom_t is',
      '  file f : text open read_mode is "rom.txt";',
      '  variable l : line;',
      '  variable r : rom_t;',
      'begin',
      '  for i in rom_t\'range loop',
      '    readline(f, l);',
      '  end loop;',
      '  return r;',
      'end function;',
      'constant ROM : rom_t := load;',
    ].join('\n');
    const content = design(load);
    expect(fileIoLines(content)).toEqual(linesWith(content, 'file f :', 'readline('));
    expect(checkOf([source('top.vhd', content)]).groups.byFile.get('top.vhd')).toBe('sim-only');
  });
});
