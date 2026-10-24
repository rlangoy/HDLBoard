// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * The Verilog modules of a run's sources, found once per waveform for the passes that
 * read them (`verilogMemories.ts`, `verilogStates.ts`): each module's name and its text,
 * `module` … `endmodule`, read through the testbench detector's `blankSource`, so a
 * comment, a string or an inactive `ifdef branch is never taken for code. Pure.
 */

import { blankSource } from '../workbench/tbDetect/blank';

export interface VerilogModule {
  readonly name: string;
  /** From `module` to `endmodule`, with comments and strings blanked: same length, same lines. */
  readonly text: string;
}

const MODULE = /\bmodule\s+(\w+)[\s\S]*?\bendmodule\b/g;

export function verilogModulesIn(sources: readonly string[]): VerilogModule[] {
  return sources.flatMap((source) => [...blankSource('verilog', source).code.matchAll(MODULE)].map((match) => ({ name: match[1], text: match[0] })));
}
