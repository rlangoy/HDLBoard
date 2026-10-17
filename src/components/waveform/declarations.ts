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
  /** The declared symbol's id in that file's symbol index, for the editor to highlight. */
  readonly symbolId: string;
}

interface Unit {
  readonly file: VhdlFile;
  readonly symbols: FileSymbols;
  readonly tokens: readonly SourceToken[];
  readonly unit: DeclaredUnit;
}

const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();
/** `label : entity`: the keyword is the second token after the label. */
const ENTITY_KEYWORD_OFFSET = 2;
/** Where the unit's name is after the label: `label : entity work . unit`, `label : component unit`. */
const NAME_OFFSET_AFTER: Readonly<Record<string, number>> = { entity: 5, component: 3, configuration: 3 };
/** `module #(`: the module name is two tokens before the parameter list's `(`. */
const PARAMETER_LIST_PREFIX = 2;

function findUnit(files: readonly VhdlFile[], name: string): Unit | undefined {
  for (const file of files) {
    const symbols = analyzeFile(file.name, file.content);
    const tokens = sourceTokens(symbols.tokenLines);
    const unit = declaredUnits(symbols.language, tokens).find((u) => same(u.name, name));
    if (unit !== undefined) return { file, symbols, tokens, unit };
  }
  return undefined;
}

/** VHDL: `label : [entity lib.]unit`, `label : component unit`, `label : unit`. */
function vhdlUnitAfterLabel(tokens: readonly SourceToken[], at: number): string | undefined {
  const [colon, next] = tokens.slice(at + 1, at + ENTITY_KEYWORD_OFFSET + 1).map((token) => token.text);
  if (colon !== ':' || next === undefined) return undefined;
  const offset = NAME_OFFSET_AFTER[next.toLowerCase()];
  return offset === undefined ? next : tokens[at + offset]?.text;
}

/** The index of the `(` that opens the parameter list ending just before `at`, or `at` when there is none. */
function openingOfParameters(tokens: readonly SourceToken[], at: number, first: number): number {
  if (tokens[at]?.text !== ')') return at + 1;
  let depth = 0;
  for (let j = at; j > first; j--) {
    if (tokens[j].text === ')') depth++;
    else if (tokens[j].text === '(' && --depth === 0) return j;
  }
  return first;
}

/** Verilog: `unit [#( … )] label (`. */
function verilogUnitBeforeLabel(tokens: readonly SourceToken[], at: number, first: number): string | undefined {
  if (tokens[at + 1]?.text !== '(') return undefined;
  const open = openingOfParameters(tokens, at - 1, first);
  // Before a parameter list come `#` and the module name; without one, the name is right before the label.
  return open === at ? tokens[at - 1]?.text : tokens[open - PARAMETER_LIST_PREFIX]?.text;
}

/** The unit an instance label in `parent` instantiates. */
function instantiatedUnit(parent: Unit, label: string): string | undefined {
  const { tokens, unit } = parent;
  const verilog = parent.symbols.language === 'verilog';
  for (let i = unit.from; i < unit.to; i++) {
    if (!same(tokens[i].text, label)) continue;
    const found = verilog ? verilogUnitBeforeLabel(tokens, i, unit.from) : vhdlUnitAfterLabel(tokens, i);
    if (found !== undefined) return found;
  }
  return undefined;
}

function lineRange(unit: Unit): { first: number; last: number } {
  const { tokens } = unit;
  return { first: tokens[unit.unit.from]?.line ?? 0, last: tokens[unit.unit.to - 1]?.line ?? Number.MAX_SAFE_INTEGER };
}

/** The unit a scope path runs: the testbench, then the unit of each instance label down. */
function unitOfScope(files: readonly VhdlFile[], scopes: readonly string[]): Unit | undefined {
  const [top, ...instances] = scopes;
  if (top === undefined) return undefined;
  let unit = findUnit(files, top);
  for (const label of instances) {
    if (unit === undefined) return undefined;
    const child = instantiatedUnit(unit, label);
    unit = child === undefined ? undefined : findUnit(files, child);
  }
  return unit;
}

/** The name of the file whose unit a scope path runs (`rs232_tx.vhd` for `rs232_tx_tb/dut`), if it is in the project. */
export function scopeFileName(files: readonly VhdlFile[], scopes: readonly string[]): string | undefined {
  return unitOfScope(files, scopes)?.file.name;
}

/**
 * The declaration of signal `name` in the scope `scopes` (from the testbench down), or
 * undefined when it cannot be found – a generated name, a library unit.
 */
export function findDeclaration(files: readonly VhdlFile[], scopes: readonly string[], name: string): DeclarationTarget | undefined {
  const unit = unitOfScope(files, scopes);
  if (unit === undefined) return undefined;
  const { first, last } = lineRange(unit);
  const symbol = unit.symbols.index.symbols.find(
    (s) => same(s.name, name) && DECLARATION_KINDS.has(s.kind) && s.declaration.line >= first && s.declaration.line <= last,
  );
  return symbol === undefined ? undefined : { fileId: unit.file.id, line: symbol.declaration.line + 1, symbolId: symbol.id };
}
