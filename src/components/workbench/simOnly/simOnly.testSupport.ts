// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/** Projects for the design check's tests. */

import { analyzeProject, type SourceFile } from '../tbDetect/analyzeProject';
import { TEST_BOARD_PORTS } from '../tbDetect/fixtures.testSupport';
import { EMPTY_OVERRIDES, type TestbenchOverrides } from '../tbDetect/types';
import { DESIGN_CHECKS } from './designCheck';
import { designView } from './designView';
import type { DesignCheck, DesignCheckMode, DesignView } from './types';

/** A file named `name`, in the folder of its language. */
export const source = (name: string, content: string): SourceFile => ({
  id: name,
  name,
  folder: name.endsWith('.v') ? 'verilog' : 'vhdl',
  content,
});

export function viewOf(files: readonly SourceFile[], overrides: TestbenchOverrides = EMPTY_OVERRIDES): DesignView {
  return designView(analyzeProject(files, TEST_BOARD_PORTS), overrides);
}

export function checkOf(files: readonly SourceFile[], overrides: TestbenchOverrides = EMPTY_OVERRIDES, mode: DesignCheckMode = 'synthesis'): DesignCheck {
  return DESIGN_CHECKS[mode]({ view: viewOf(files, overrides), overrides });
}

/** A VHDL entity with `ports` and one architecture of `body`, the statements after `begin`. */
export const vhdlDesign = (name: string, ports: string, body: string): string =>
  `library ieee;\nuse ieee.std_logic_1164.all;\nentity ${name} is\n  port (${ports});\nend entity;\narchitecture rtl of ${name} is\n\nbegin\n${body}\nend architecture;\n`;

/** The same, with `declarations` before the architecture's `begin`. */
export const vhdlDesignWith = (declarations: string, design: string): string =>
  design.replace('\n\nbegin\n', `\n${declarations}\nbegin\n`);

export const BOARD_PORTS = 'LEDR : out std_logic_vector(9 downto 0); SW : in std_logic_vector(9 downto 0); CLOCK_50 : in std_logic';

/** The blink example of the spec's § 1: its process on line 9, `wait for` on lines 12 and 14. */
export const BLINK = vhdlDesign(
  'blink',
  BOARD_PORTS,
  "process\nbegin\n  LEDR(0) <= '1';\n  wait for 500 ms;\n  LEDR(0) <= '0';\n  wait for 500 ms;\nend process;",
);
