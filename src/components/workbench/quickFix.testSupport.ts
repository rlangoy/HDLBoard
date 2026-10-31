// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/** The bug report behind the missing-package Quick Fix, shared by its tests. */

import { EXAMPLE_FILES } from './files';

/** The student's line: adds two 4-bit numbers from the switches. */
export const ADDER_LINE = '    LEDR(3 downto 0) <= std_logic_vector(unsigned(SW(3 downto 0)) + unsigned(SW(7 downto 4)));';

/** The DE1-SoC starter design with `LEDR <= SW;` replaced by the adder line (line 27). */
export function starterWithAdder(): string {
  const starter = EXAMPLE_FILES.find((file) => file.folder === 'vhdl' && file.name === 'DE1_SoC.vhdl');
  if (starter === undefined) throw new Error('DE1_SoC.vhdl starter not found');
  return starter.content.replace('    LEDR <= SW;', ADDER_LINE);
}

/** What GHDL printed for it, as in the bug report: one error per `unsigned`. */
export const GHDL_OUTPUT = [
  'DE1_SoC.vhdl:27:42:error: no declaration for "unsigned"',
  ADDER_LINE,
  '                                         ^',
  'DE1_SoC.vhdl:27:69:error: no declaration for "unsigned"',
].join('\n');
