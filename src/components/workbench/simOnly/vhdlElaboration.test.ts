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

  test('a call before a trailing -- synthesis translate_off on its line is read: f runs in the design (GHDL rejects the line variable)', () => {
    const body = "LEDR(1) <= '1' when f = 5 else '0'; -- synthesis translate_off\nLEDR(2) <= '0';\n-- synthesis translate_on";
    const content = design(PRINTS('f'), body);
    expect(fileIoLines(content)).toEqual(linesWith(content, 'variable l : line', 'writeline('));
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

  test('a file-reading function called only by a helper nothing calls (Quartus builds it)', () => {
    const chain = [
      'type rom_t is array (0 to 3) of std_logic_vector(7 downto 0);',
      'impure function load(name : string) return rom_t is',
      '  file f : text open read_mode is name;',
      '  variable l : line;',
      '  variable r : rom_t;',
      'begin',
      '  readline(f, l);',
      '  return r;',
      'end function;',
      'impure function helper return rom_t is',
      'begin',
      '  return load("rom.txt");',
      'end function;',
    ].join('\n');
    expect(fileIoLines(design(chain))).toEqual([]);
  });

  test('the same chain, the helper giving a constant its value, is file I/O', () => {
    const chain = [
      'type rom_t is array (0 to 3) of std_logic_vector(7 downto 0);',
      'impure function load(name : string) return rom_t is',
      '  file f : text open read_mode is name;',
      '  variable l : line;',
      '  variable r : rom_t;',
      'begin',
      '  readline(f, l);',
      '  return r;',
      'end function;',
      'impure function helper return rom_t is',
      'begin',
      '  return load("rom.txt");',
      'end function;',
      'constant ROM : rom_t := helper;',
    ].join('\n');
    const content = design(chain);
    expect(fileIoLines(content)).toEqual(linesWith(content, 'file f :', 'readline('));
  });

  test("a function an entity declares is seen by its architectures in other files: the call there counts (Quartus builds the ROM from the file's contents, or none)", () => {
    const entity = [
      'library ieee;',
      'use ieee.std_logic_1164.all;',
      'use std.textio.all;',
      'entity top is',
      `  port (${BOARD_PORTS});`,
      '  type rom_t is array (0 to 3) of std_logic_vector(9 downto 0);',
      '  impure function load(name : string) return rom_t is',
      '    file f : text open read_mode is name;',
      '    variable l : line;',
      '    variable r : rom_t;',
      '  begin',
      '    readline(f, l);',
      '    return r;',
      '  end function;',
      'end entity;',
    ].join('\n');
    const architecture = 'architecture rtl of top is\n  constant ROM : rom_t := load("rom.txt");\nbegin\n  LEDR <= ROM(0);\nend architecture;';
    const lines = checkOf([source('e.vhd', entity), source('a.vhd', architecture)]).findings
      .filter((f) => f.construct === 'vhdl-file-io' && f.fileId === 'e.vhd')
      .map((f) => f.line);
    expect(lines).toEqual(linesWith(entity, 'file f :', 'variable l : line', 'readline('));
  });

  test('a generic formal with a named default (is increment) in an unused procedure has no body: the process after it keeps its file I/O', () => {
    const unused = [
      'function increment (x : natural) return natural is begin return x + 1; end function;',
      'procedure unused is',
      '  function apply generic (function op (x : natural) return natural is increment) parameter (x : natural) return natural is',
      '  begin',
      '    return op(x);',
      '  end function;',
      'begin',
      '  null;',
      'end procedure;',
    ].join('\n');
    const body = 'process (CLOCK_50)\n  variable l : line;\nbegin\n  if rising_edge(CLOCK_50) then\n    write(l, 1);\n    writeline(output, l);\n  end if;\nend process;';
    const content = design(unused, body);
    expect(fileIoLines(content)).toEqual(linesWith(content, 'variable l : line', 'writeline('));
  });

  test('a named default written with blanks around its dots (is work . helper_pkg . incr) is no body either', () => {
    const unused = [
      'procedure unused is',
      '  function apply generic (function op (x : natural) return natural is work . helper_pkg . incr) parameter (x : natural) return natural is',
      '  begin',
      '    return op(x);',
      '  end function;',
      'begin',
      '  null;',
      'end procedure;',
    ].join('\n');
    const body = 'process (CLOCK_50)\n  variable l : line;\nbegin\n  if rising_edge(CLOCK_50) then\n    write(l, 1);\n    writeline(output, l);\n  end if;\nend process;';
    const content = design(unused, body);
    expect(fileIoLines(content)).toEqual(linesWith(content, 'variable l : line', 'writeline('));
  });

  test('function unused is new work.p.generic_id generic map (…) has no body: the process after it keeps its file I/O (GHDL 6.0 rejects the line variable)', () => {
    const instance = 'function unused is new work.p.generic_id generic map (N => 1);';
    const body = 'process (CLOCK_50)\n  variable l : line;\nbegin\n  if rising_edge(CLOCK_50) then\n    write(l, 1);\n    writeline(output, l);\n  end if;\nend process;';
    const content = design(instance, body);
    expect(fileIoLines(content)).toEqual(linesWith(content, 'variable l : line', 'writeline('));
  });

  test('a generic subprogram of a component is a formal, no body: the process after it keeps its file I/O (GHDL rejects the line variable)', () => {
    const component = 'component c is\n  generic (function op (x : integer) return integer is <>);\nend component;';
    const body = 'process (CLOCK_50)\n  variable l : line;\nbegin\n  if rising_edge(CLOCK_50) then\n    write(l, 1);\n    writeline(output, l);\n  end if;\nend process;';
    const content = design(component, body);
    expect(fileIoLines(content)).toEqual(linesWith(content, 'variable l : line', 'writeline('));
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
