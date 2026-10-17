// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * Where a waveform signal is declared in the project (docs/waveform_viewer_spec.md
 * FR-18): the one-click way from "why is this U?" to the line that needs a reset. The
 * hierarchy is walked from the testbench down through its instance labels – `dut :
 * entity work.counter` in VHDL, `counter dut (…)` in Verilog – using the editor's own
 * symbol index for the declaration itself. Pure.
 */

import type { VhdlFile } from '../workbench/files';
import { analyzeFile, type FileSymbols } from '../workbench/symbols/fileSymbols';
import { declaredUnits, type DeclaredUnit } from '../workbench/symbols/instances';
import { sourceTokens, type SourceToken } from '../workbench/symbols/sourceTokens';
import type { SymbolKind } from '../workbench/symbols/types';

const DECLARATION_KINDS: ReadonlySet<SymbolKind> = new Set(['signal', 'port', 'variable', 'constant', 'wire', 'reg', 'logic', 'parameter', 'localparam', 'generic']);

export interface DeclarationTarget {
  readonly fileId: string;
  /** 1-based, as the editor's reveal and the compiler's messages count lines. */
  readonly line: number;
}

interface Unit {
  readonly file: VhdlFile;
  readonly symbols: FileSymbols;
  readonly tokens: readonly SourceToken[];
  readonly unit: DeclaredUnit;
}

const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

function findUnit(files: readonly VhdlFile[], name: string): Unit | undefined {
  for (const file of files) {
    const symbols = analyzeFile(file.name, file.content);
    const tokens = sourceTokens(symbols.tokenLines);
    const unit = declaredUnits(symbols.language, tokens).find((u) => same(u.name, name));
    if (unit !== undefined) return { file, symbols, tokens, unit };
  }
  return undefined;
}

/** The unit an instance label in `parent` instantiates: VHDL `label : [entity lib.]unit`, Verilog `unit [#(…)] label (`. */
function instantiatedUnit(parent: Unit, label: string): string | undefined {
  const { tokens, unit } = parent;
  for (let i = unit.from; i < unit.to; i++) {
    if (!same(tokens[i].text, label)) continue;
    if (parent.symbols.language === 'verilog') {
      if (tokens[i + 1]?.text !== '(') continue;
      // Back over a parameter list `#( … )` to the module name.
      let j = i - 1;
      if (tokens[j]?.text === ')') {
        let depth = 0;
        for (; j > unit.from; j--) {
          if (tokens[j].text === ')') depth++;
          else if (tokens[j].text === '(' && --depth === 0) break;
        }
        j -= 2; // the `(` and the `#`
      }
      return tokens[j]?.text;
    }
    if (tokens[i + 1]?.text !== ':') continue;
    const next = tokens[i + 2];
    if (next === undefined) return undefined;
    // `entity work.counter`, `component counter`, or just `counter`.
    if (same(next.text, 'entity')) return tokens[i + 5]?.text;
    if (same(next.text, 'component') || same(next.text, 'configuration')) return tokens[i + 3]?.text;
    return next.text;
  }
  return undefined;
}

function lineRange(unit: Unit): { first: number; last: number } {
  const { tokens } = unit;
  return { first: tokens[unit.unit.from]?.line ?? 0, last: tokens[unit.unit.to - 1]?.line ?? Number.MAX_SAFE_INTEGER };
}

/**
 * The declaration of signal `name` in the scope `scopes` (from the testbench down), or
 * undefined when it cannot be found – a generated name, a library unit.
 */
export function findDeclaration(files: readonly VhdlFile[], scopes: readonly string[], name: string): DeclarationTarget | undefined {
  const [top, ...instances] = scopes;
  if (top === undefined) return undefined;
  let unit = findUnit(files, top);
  for (const label of instances) {
    if (unit === undefined) return undefined;
    const child = instantiatedUnit(unit, label);
    unit = child === undefined ? undefined : findUnit(files, child);
  }
  if (unit === undefined) return undefined;
  const { first, last } = lineRange(unit);
  const symbol = unit.symbols.index.symbols.find(
    (s) => same(s.name, name) && DECLARATION_KINDS.has(s.kind) && s.declaration.line >= first && s.declaration.line <= last,
  );
  return symbol === undefined ? undefined : { fileId: unit.file.id, line: symbol.declaration.line + 1 };
}
