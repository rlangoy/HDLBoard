// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * Each Verilog module's ports: which way each goes, and whether it is a variable
 * (`output reg`, or a later `reg` of the same name) or a net. Enough to tell an input
 * port assigned from an output port, and whether the assignment the other way round
 * is legal. Walks tokens like symbols/verilogSymbols.ts, with its name-list rules; a
 * function's or task's `input` is an argument, not a port. Pure.
 */

import type { SourceToken } from './symbols/sourceTokens';
import { declaredNameIndices } from './verilogDeclaredNames';

export type PortDirection = 'input' | 'output' | 'inout';

export interface VerilogPort {
  readonly direction: PortDirection;
  /** A `reg` (or `logic`, `integer`): assigned in `always`, never by `assign`. */
  readonly variable: boolean;
}

export interface ModulePorts {
  /** 1-based lines from `module` to `endmodule`. */
  readonly firstLine: number;
  readonly lastLine: number;
  /** By name; Verilog names are case-sensitive. */
  readonly ports: ReadonlyMap<string, VerilogPort>;
}

const DIRECTIONS: ReadonlySet<string> = new Set<PortDirection>(['input', 'output', 'inout']);
const VARIABLE_TYPES: ReadonlySet<string> = new Set(['reg', 'logic', 'integer']);
const MODULE_STARTS: ReadonlySet<string> = new Set(['module', 'macromodule']);
const SUBPROGRAM_STARTS: ReadonlySet<string> = new Set(['function', 'task']);
const SUBPROGRAM_ENDS: ReadonlySet<string> = new Set(['endfunction', 'endtask']);

/** A module being read: its first line, its ports' directions, and its variables. */
interface OpenModule {
  readonly firstLine: number;
  readonly directions: Map<string, PortDirection>;
  readonly variables: Set<string>;
}

export function modulePorts(tokens: readonly SourceToken[]): ModulePorts[] {
  const modules: ModulePorts[] = [];
  let open: OpenModule | undefined;
  let inSubprogram = false;
  tokens.forEach(({ text, line }, i) => {
    if (MODULE_STARTS.has(text)) open = { firstLine: line + 1, directions: new Map(), variables: new Set() };
    else if (SUBPROGRAM_STARTS.has(text)) inSubprogram = true;
    else if (SUBPROGRAM_ENDS.has(text)) inSubprogram = false;
    else if (text === 'endmodule' && open !== undefined) {
      modules.push(closed(open, line + 1));
      open = undefined;
    } else if (open !== undefined && !inSubprogram) declare(open, tokens, i);
  });
  return modules;
}

/** Records what the declaring word at `i` declares: a port's direction, or a variable. */
function declare(module: OpenModule, tokens: readonly SourceToken[], i: number): void {
  const { text } = tokens[i];
  const names = () => declaredNameIndices(tokens, i).map((j) => tokens[j].text);
  if (DIRECTIONS.has(text)) {
    const isVariable = VARIABLE_TYPES.has(tokens[i + 1]?.text ?? '');
    for (const name of names()) {
      module.directions.set(name, text as PortDirection);
      if (isVariable) module.variables.add(name);
    }
  } else if (VARIABLE_TYPES.has(text) && !DIRECTIONS.has(tokens[i - 1]?.text ?? '')) {
    for (const name of names()) module.variables.add(name);
  }
}

function closed(module: OpenModule, lastLine: number): ModulePorts {
  const ports = new Map<string, VerilogPort>();
  for (const [name, direction] of module.directions) ports.set(name, { direction, variable: module.variables.has(name) });
  return { firstLine: module.firstLine, lastLine, ports };
}

/** The port `name` of the module around 1-based `line`, if it is one. */
export function portAt(modules: readonly ModulePorts[], line: number, name: string): VerilogPort | undefined {
  return modules.find((m) => m.firstLine <= line && line <= m.lastLine)?.ports.get(name);
}
