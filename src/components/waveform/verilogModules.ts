// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * The Verilog modules of a run's sources, found once per waveform for the passes that
 * read them (`verilogMemories.ts`, `verilogStates.ts`): each module's name and its text
 * without comments, `module` … `endmodule`. Pure.
 */

import { withoutComments } from '../workbench/sourceComments';

export interface VerilogModule {
  readonly name: string;
  /** From `module` to `endmodule`, comments removed. */
  readonly text: string;
}

const MODULE = /\bmodule\s+(\w+)[\s\S]*?\bendmodule\b/g;

export function verilogModulesIn(sources: readonly string[]): VerilogModule[] {
  return sources.flatMap((source) => [...withoutComments(source, 'verilog').matchAll(MODULE)].map((match) => ({ name: match[1], text: match[0] })));
}
