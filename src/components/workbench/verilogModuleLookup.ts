// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import { uniqueNearest } from './nearestWord';
import type { SourceToken } from './symbols/sourceTokens';
import { analyzeVerilog } from './symbols/verilogSymbols';
import { matchingClose } from './symbols/analysis';
import { needsPreprocessing } from './verilogDirectives';

interface Module {
  readonly name: string;
  readonly ports: readonly string[];
  readonly parameters: readonly string[];
}

interface MemberReference {
  readonly fileId: string;
  readonly line: number;
  readonly instance: string;
  readonly kind: 'port' | 'parameter';
  readonly name: string;
}

/** Suggestions only: preprocessing or an ambiguous declaration falls back to generic advice. */
export class VerilogModuleLookup {
  private readonly files: ReadonlyMap<string, readonly SourceToken[]>;
  private readonly modules: readonly Module[];

  /** `files`: each Verilog file's significant tokens, by file id. */
  constructor(files: ReadonlyMap<string, readonly SourceToken[]>) {
    const preprocessed = [...files.values()].some(needsPreprocessing);
    this.files = preprocessed ? new Map() : files;
    this.modules = [...this.files.values()].flatMap(modulesIn);
  }

  suggestModule(name: string): string | undefined {
    if (this.modules.some((module) => module.name === name)) return undefined;
    return uniqueNearest(name, this.modules.map((module) => module.name), { caseSensitive: true });
  }

  suggestMember({ fileId, line, instance, kind, name }: MemberReference): string | undefined {
    const tokens = this.files.get(fileId) ?? [];
    const moduleNames = instanceModules(tokens, line, instance.slice(instance.lastIndexOf('.') + 1));
    if (moduleNames.length !== 1) return undefined;
    const modules = this.modules.filter((module) => module.name === moduleNames[0]);
    if (modules.length !== 1) return undefined;
    const candidates = kind === 'port' ? modules[0].ports : modules[0].parameters;
    if (candidates.includes(name)) return undefined;
    return uniqueNearest(name, candidates, { caseSensitive: true });
  }
}

function modulesIn(tokens: readonly SourceToken[]): Module[] {
  const analysis = analyzeVerilog(tokens);
  const modules: Module[] = [];
  tokens.forEach((token, i) => {
    if (token.text !== 'module' && token.text !== 'macromodule') return;
    if (tokens[i + 1]?.type !== 'identifier') return;
    const scope = analysis.tokenScopes[i + 1];
    const declarations = [...analysis.declarations].filter(([index]) => analysis.tokenScopes[index] === scope);
    modules.push({
      name: tokens[i + 1].text,
      ports: declarations.filter(([, kind]) => kind === 'port').map(([index]) => tokens[index].text),
      parameters: declarations.filter(([, kind]) => kind === 'parameter').map(([index]) => tokens[index].text),
    });
  });
  return modules;
}

function afterParameters(tokens: readonly SourceToken[], start: number): number {
  if (tokens[start]?.text !== '#') return start;
  if (tokens[start + 1]?.text !== '(') return tokens.length;
  return matchingClose(tokens, start + 1) + 1;
}

/** What may come right before a module item: a statement's `;` or the end of a block. */
const BEFORE_MODULE_ITEM: ReadonlySet<string> = new Set([';', 'end', 'endcase', 'endfunction', 'endtask', 'endgenerate']);

function isInstanceStart(tokens: readonly SourceToken[], index: number): boolean {
  return tokens[index].type === 'identifier' && BEFORE_MODULE_ITEM.has(tokens[index - 1]?.text);
}

function isNamedInstance(tokens: readonly SourceToken[], index: number, name: string): boolean {
  return tokens[index]?.text === name && tokens[index + 1]?.text === '(';
}

/** Simple module instances, including multiline parameter/port lists. Generated forms get no guess. */
function instanceModules(tokens: readonly SourceToken[], line: number, instance: string): string[] {
  const found: string[] = [];
  tokens.forEach((token, i) => {
    if (!isInstanceStart(tokens, i)) return;
    const nameIndex = afterParameters(tokens, i + 1);
    if (!isNamedInstance(tokens, nameIndex, instance)) return;
    const end = tokens.findIndex((next, j) => j > nameIndex && next.text === ';');
    if (end >= 0 && token.line < line && tokens[end].line >= line - 1) found.push(token.text);
  });
  return found;
}
