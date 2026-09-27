// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * The rules behind the New File dialog: which file name a typed name becomes, whether
 * it is allowed, and what a new file starts with. Pure — no React, no state — so the
 * dialog only asks, and the rules are tested on their own (newFile.test.ts).
 */

export type NewFileLanguage = 'vhdl' | 'verilog';

/** The extension a new file of each language gets; `.vhd` is what New File has always used. */
const EXTENSION: Record<NewFileLanguage, string> = { vhdl: '.vhd', verilog: '.v' };

// A typed extension of either language is dropped, so "counter.v" with VHDL selected
// becomes counter.vhd rather than counter.v.vhd — the radio button decides the language.
const SOURCE_EXTENSION = /\.(vhdl?|vh?)$/i;

// A Verilog module name (IEEE 1364 simple identifier) and a VHDL basic identifier:
// a letter first, no double or trailing underscore, and no `$`.
const VERILOG_IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_$]*$/;
const VHDL_IDENTIFIER = /^[A-Za-z](_?[A-Za-z0-9])*$/;

/** The name without surrounding space or a source extension: the module/entity name. */
export function baseName(input: string): string {
  return input.trim().replace(SOURCE_EXTENSION, '');
}

/** The file name a typed name becomes for the chosen language. */
export function newFileName(input: string, language: NewFileLanguage): string {
  return `${baseName(input)}${EXTENSION[language]}`;
}

/**
 * Why the typed name cannot be used, or `undefined` if it can. The base name has to be
 * a legal identifier of the language, because it is also the module (or entity) name.
 */
export function newFileNameError(
  input: string,
  language: NewFileLanguage,
  existingNames: readonly string[],
): string | undefined {
  const base = baseName(input);
  if (base === '') return 'Enter a file name.';
  if (language === 'verilog' && !VERILOG_IDENTIFIER.test(base)) {
    return 'Use letters, digits and _ only, starting with a letter or _ (it is also the module name).';
  }
  if (language === 'vhdl' && !VHDL_IDENTIFIER.test(base)) {
    return 'Use letters, digits and single _ only, starting with a letter (it is also the entity name).';
  }
  const name = newFileName(input, language).toLowerCase();
  if (existingNames.some((existing) => existing.toLowerCase() === name)) {
    return `A file named ${newFileName(input, language)} already exists.`;
  }
  return undefined;
}

/**
 * What a new file starts with: a design named after the file — a Verilog module or a
 * VHDL entity (with an `rtl` architecture) — declaring every DE1-SoC board port, the
 * same list as the DE1_SoC starter files. The name matters for Verilog, where a run looks
 * for the module named after the top file when it holds several (server/src/verilog/ports.ts).
 * The body wires LEDR to SW and blanks the 7-segment displays, so no output is left
 * undriven and the file can be marked as top and run straight away.
 */
export function newFileContent(input: string, language: NewFileLanguage): string {
  const name = baseName(input);
  if (language === 'verilog') {
    return `module ${name} (
    input  wire        CLOCK_50,
    input  wire [9:0]  SW,
    input  wire [3:0]  KEY_N,
    output wire [9:0]  LEDR,
    output wire [6:0]  HEX0_N,
    output wire [6:0]  HEX1_N,
    output wire [6:0]  HEX2_N,
    output wire [6:0]  HEX3_N,
    output wire [6:0]  HEX4_N,
    output wire [6:0]  HEX5_N
);
    assign LEDR = SW;

    // Active low, so all-ones is "off".
    assign HEX0_N = 7'b1111111;
    assign HEX1_N = 7'b1111111;
    assign HEX2_N = 7'b1111111;
    assign HEX3_N = 7'b1111111;
    assign HEX4_N = 7'b1111111;
    assign HEX5_N = 7'b1111111;
endmodule
`;
  }
  return `library ieee;
use ieee.std_logic_1164.all;

entity ${name} is
    port (
        CLOCK_50 : in  std_logic;
        SW       : in  std_logic_vector(9 downto 0);
        KEY_N    : in  std_logic_vector(3 downto 0);
        LEDR     : out std_logic_vector(9 downto 0);
        HEX0_N   : out std_logic_vector(6 downto 0);
        HEX1_N   : out std_logic_vector(6 downto 0);
        HEX2_N   : out std_logic_vector(6 downto 0);
        HEX3_N   : out std_logic_vector(6 downto 0);
        HEX4_N   : out std_logic_vector(6 downto 0);
        HEX5_N   : out std_logic_vector(6 downto 0)
    );
end entity;

architecture rtl of ${name} is
begin
    LEDR <= SW;

    -- Active low, so all-ones is "off".
    HEX0_N <= (others => '1');
    HEX1_N <= (others => '1');
    HEX2_N <= (others => '1');
    HEX3_N <= (others => '1');
    HEX4_N <= (others => '1');
    HEX5_N <= (others => '1');
end architecture;
`;
}
