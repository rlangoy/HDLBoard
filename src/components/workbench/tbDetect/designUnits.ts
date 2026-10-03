// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * The design units of a blanked file (docs/impl_split_screen.md § 5.3): VHDL
 * entity + its architectures, Verilog module / program; with their ports,
 * instances and process / initial / always blocks. Found by pattern on code the
 * blanking lexer has cleaned, not by parsing. Pure.
 */

import { isReservedWord } from '../vhdlWords';
import { isVerilogReservedWord } from '../verilogWords';
import { isBoardPort } from './boardPorts';
import { lineIndex, type LineOf } from './lines';
import type { CodeBlock, DesignUnit, Instance, Language } from './types';

type Range = { readonly from: number; readonly to: number };

export function designUnits(language: Language, code: string): DesignUnit[] {
  const lineOf = lineIndex(code);
  return language === 'vhdl' ? vhdlUnits(code, lineOf) : verilogUnits(code, lineOf);
}

/** The offset just after the `)` matching the `(` at `open`. */
export function skipBalanced(code: string, open: number): number {
  let depth = 0;
  for (let i = open; i < code.length; i++) {
    if (code[i] === '(') depth++;
    else if (code[i] === ')' && --depth === 0) return i + 1;
  }
  return code.length;
}

/** Port names with their offsets, from a port list's text starting at `base`. */
function portNames(list: string, base: number, isWordReserved: (w: string) => boolean): Instance[] {
  const names: Instance[] = [];
  for (const m of list.matchAll(/[A-Za-z_]\w*/g)) {
    if (!isWordReserved(m[0])) names.push({ name: m[0], line: base + (m.index ?? 0) });
  }
  return names;
}

/* ------------------------------- VHDL ------------------------------- */

interface VhdlItem {
  readonly kind: 'entity' | 'architecture' | 'other';
  readonly name: string;
  /** For an architecture: the entity it belongs to. */
  readonly of: string;
  readonly from: number;
  to: number;
}

const VHDL_ITEM =
  /\b(?:entity\s+(\w+)\s+is\b|architecture\s+\w+\s+of\s+(\w+)\s+is\b|package\s+(?:body\s+)?\w+\s+is\b|configuration\s+\w+\s+of\s+\w+\s+is\b|context\s+\w+\s+is\b)/gi;

function vhdlItems(code: string): VhdlItem[] {
  const items: VhdlItem[] = [...code.matchAll(VHDL_ITEM)].map((m) => {
    const kind = m[1] ? 'entity' : m[2] ? 'architecture' : 'other';
    return { kind, name: m[1] ?? '', of: (m[2] ?? '').toLowerCase(), from: m.index ?? 0, to: code.length };
  });
  items.forEach((item, i) => {
    const next = items[i + 1]?.from ?? code.length;
    item.to = lastEndBefore(code, item.from, next);
  });
  return items;
}

/** The offset after the last `end …;` in `code[from, to)`, or `to` when there is none. */
function lastEndBefore(code: string, from: number, to: number): number {
  let last = to;
  const end = /\bend\b[^;]*;/gi;
  end.lastIndex = from;
  for (let m = end.exec(code); m && m.index < to; m = end.exec(code)) last = m.index + m[0].length;
  return Math.min(last, to);
}

function vhdlUnits(code: string, lineOf: LineOf): DesignUnit[] {
  const items = vhdlItems(code);
  const owners = architectureOwners(items);
  return items.flatMap((item, i) => {
    if (item.kind !== 'entity') return [];
    const archs = items.filter((a) => owners.get(a) === item);
    const contextFrom = contextClauseStart(code, i === 0 ? 0 : items[i - 1].to, item.from);
    return [vhdlUnit(code, lineOf, item, archs, contextFrom)];
  });
}

/** Each architecture belongs to the nearest entity of its name before it, else the first one after. */
function architectureOwners(items: readonly VhdlItem[]): Map<VhdlItem, VhdlItem> {
  const owners = new Map<VhdlItem, VhdlItem>();
  const latest = new Map<string, VhdlItem>();
  const pending: VhdlItem[] = [];
  for (const item of items) {
    if (item.kind === 'architecture') {
      const owner = latest.get(item.of);
      if (owner) owners.set(item, owner);
      else pending.push(item);
    } else if (item.kind === 'entity') {
      const name = item.name.toLowerCase();
      latest.set(name, item);
      pending.filter((a) => a.of === name && !owners.has(a)).forEach((a) => owners.set(a, item));
    }
  }
  return owners;
}

/** Library and use clauses before an entity belong to it. */
function contextClauseStart(code: string, from: number, entityAt: number): number {
  const found = /\b(?:library|use|context)\b/i.exec(code.slice(from, entityAt));
  return found ? from + found.index : entityAt;
}

function vhdlUnit(code: string, lineOf: LineOf, entity: VhdlItem, archs: VhdlItem[], contextFrom: number): DesignUnit {
  const headerEnd = vhdlHeaderEnd(code, entity.from);
  const ports = vhdlPorts(code, entity.from, headerEnd);
  const boardPort = ports?.find((p) => isBoardPort(p.name));
  const end = Math.max(entity.to, ...archs.map((a) => a.to));
  return {
    name: entity.name,
    kind: 'entity',
    span: { start: lineOf(contextFrom), end: lineOf(Math.max(contextFrom, end - 1)) },
    declLine: lineOf(entity.from),
    hasPorts: ports !== undefined,
    hasBoardPorts: boardPort !== undefined,
    boardPortLine: boardPort ? lineOf(boardPort.line) : undefined,
    instances: archs.flatMap((a) => vhdlInstances(code.slice(a.from, a.to), a.from, lineOf)),
    blocks: archs.flatMap((a) => vhdlBlocks(code, a, lineOf)),
    ranges: [{ from: contextFrom, to: entity.to }, ...archs.map(({ from, to }) => ({ from, to }))],
  };
}

function vhdlHeaderEnd(code: string, from: number): number {
  const end = /\bend\b/gi;
  end.lastIndex = from;
  return end.exec(code)?.index ?? code.length;
}

/** The port clause's names (offsets in `line`), or `undefined` when the entity has none. */
function vhdlPorts(code: string, from: number, to: number): Instance[] | undefined {
  const port = /\bport\s*\(/i.exec(code.slice(from, to));
  if (!port) return undefined;
  const open = from + port.index + port[0].length - 1;
  const close = skipBalanced(code, open);
  const declarations = code.slice(open + 1, close - 1).split(';');
  let at = open + 1;
  return declarations.flatMap((text) => {
    const base = at;
    at += text.length + 1;
    const colon = text.indexOf(':');
    return colon < 0 ? [] : portNames(text.slice(0, colon), base, () => false);
  });
}

const VHDL_INSTANCE =
  /\b(\w+)\s*:\s*(?:entity\s+(?:\w+\.)?(\w+)(?:\s*\(\s*\w+\s*\))?|component\s+(\w+)|(\w+))\s*(?:generic|port)\s+map\b/gi;

function vhdlInstances(text: string, base: number, lineOf: LineOf): Instance[] {
  return [...text.matchAll(VHDL_INSTANCE)].flatMap((m) => {
    const name = m[2] ?? m[3] ?? m[4];
    if (m[4] && isReservedWord(m[4])) return [];
    return [{ name, line: lineOf(base + (m.index ?? 0)) }];
  });
}

function vhdlBlocks(code: string, arch: Range, lineOf: LineOf): CodeBlock[] {
  const blocks: CodeBlock[] = [];
  const text = code.slice(arch.from, arch.to);
  const start = /\b(?:(\w+)\s*:\s*)?(?:postponed\s+)?process\b/gi;
  for (let m = start.exec(text); m; m = start.exec(text)) {
    if (/\bend\s+(?:postponed\s+)?$/i.test(text.slice(Math.max(0, m.index - 20), m.index))) continue;
    const end = /\bend\s+(?:postponed\s+)?process\b[^;]*;/gi;
    end.lastIndex = m.index + m[0].length;
    const to = end.exec(text)?.index ?? text.length;
    const [from, until] = [arch.from + m.index, arch.from + to];
    const label = m[1] ?? 'process';
    blocks.push({ label, named: m[1] !== undefined, kind: 'process', from, to: until, span: { start: lineOf(from), end: lineOf(until) } });
    start.lastIndex = to;
  }
  return blocks;
}

/* ------------------------------ Verilog ----------------------------- */

const VERILOG_UNIT = /\b(module|macromodule|program)\s+([A-Za-z_]\w*)/g;

function verilogUnits(code: string, lineOf: LineOf): DesignUnit[] {
  const units: DesignUnit[] = [];
  VERILOG_UNIT.lastIndex = 0;
  for (let m = VERILOG_UNIT.exec(code); m; m = VERILOG_UNIT.exec(code)) {
    const closer = new RegExp(`\\bend${m[1] === 'program' ? 'program' : 'module'}\\b`, 'g');
    closer.lastIndex = m.index + m[0].length;
    const found = closer.exec(code);
    const to = found ? found.index + found[0].length : code.length;
    units.push(verilogUnit(code, lineOf, m, to));
    VERILOG_UNIT.lastIndex = to;
  }
  return units;
}

function verilogUnit(code: string, lineOf: LineOf, m: RegExpExecArray, to: number): DesignUnit {
  const from = m.index;
  const header = verilogHeader(code, from + m[0].length, to);
  const boardPort = header.ports.find((p) => isBoardPort(p.name));
  const body = { from: header.end, to };
  return {
    name: m[2],
    kind: m[1] === 'program' ? 'program' : 'module',
    span: { start: lineOf(from), end: lineOf(to - 1) },
    declLine: lineOf(from),
    hasPorts: header.ports.length > 0,
    hasBoardPorts: boardPort !== undefined,
    boardPortLine: boardPort ? lineOf(boardPort.line) : undefined,
    instances: verilogInstances(code, body, lineOf),
    blocks: verilogBlocks(code, body, lineOf),
    ranges: [{ from, to }],
  };
}

/** The header after the module name: `#( … )` skipped, ports listed, `end` after its `;`. */
function verilogHeader(code: string, from: number, limit: number): { ports: Instance[]; end: number } {
  let i = from;
  while (i < limit && /\s/.test(code[i])) i++;
  if (code[i] === '#') i = skipBalanced(code, code.indexOf('(', i));
  let end = i;
  while (end < limit && code[end] !== ';') end = code[end] === '(' ? skipBalanced(code, end) : end + 1;
  const ports = portNames(code.slice(i, end), i, isVerilogReservedWord);
  return { ports, end: Math.min(end + 1, limit) };
}

const LEADING_NOISE = /^\s*(?:(?:[A-Za-z_]\w*)\s*:(?!:)|:\s*[A-Za-z_]\w*)/;

function verilogInstances(code: string, body: Range, lineOf: LineOf): Instance[] {
  const instances: Instance[] = [];
  let at = body.from;
  for (const statement of code.slice(body.from, body.to).split(';')) {
    const found = instanceIn(statement);
    if (found) instances.push({ name: found.name, line: lineOf(at + found.offset) });
    at += statement.length + 1;
  }
  return instances;
}

/** `<module> [#( … )] <instance> [ [range] ] (`, the first word not a keyword. */
function instanceIn(statement: string): { name: string; offset: number } | undefined {
  let rest = statement;
  for (let changed = true; changed; ) {
    const before = rest;
    const noise = LEADING_NOISE.exec(rest);
    if (noise) rest = rest.slice(noise[0].length);
    const word = /^\s*([A-Za-z_]\w*)/.exec(rest);
    if (word && isVerilogReservedWord(word[1])) rest = rest.slice(word[0].length);
    changed = rest !== before;
  }
  const head = /^\s*([A-Za-z_]\w*)\s*/.exec(rest);
  if (!head) return undefined;
  let i = head[0].length;
  if (rest[i] === '#') i = skipParameterOverride(rest, i + 1);
  const tail = /^\s*[A-Za-z_]\w*\s*(?:\[[^\]]*\]\s*)?\(/.exec(rest.slice(i));
  if (!tail) return undefined;
  return { name: head[1], offset: statement.length - rest.length + head[0].search(/\S/) };
}

function skipParameterOverride(text: string, i: number): number {
  while (/\s/.test(text[i] ?? '')) i++;
  if (text[i] === '(') return skipBalanced(text, i);
  const value = /^[\w.']+/.exec(text.slice(i));
  return i + (value?.[0].length ?? 0);
}

const VERILOG_BLOCK = /\b(initial|always(?:_comb|_ff|_latch)?)\b/g;

function verilogBlocks(code: string, body: Range, lineOf: LineOf): CodeBlock[] {
  const blocks: CodeBlock[] = [];
  VERILOG_BLOCK.lastIndex = body.from;
  for (let m = VERILOG_BLOCK.exec(code); m && m.index < body.to; m = VERILOG_BLOCK.exec(code)) {
    const to = statementEnd(code, m.index + m[0].length, body.to);
    const name = /^\s*(?:@\s*(?:\([^)]*\)|\*|\w+)\s*)?begin\s*:\s*([A-Za-z_]\w*)/.exec(code.slice(m.index + m[0].length, to));
    const kind = m[1] === 'initial' ? 'initial' : 'always';
    const label = name?.[1] ?? `${kind} block`;
    blocks.push({ label, named: name !== null, kind, from: m.index, to, span: { start: lineOf(m.index), end: lineOf(to - 1) } });
    VERILOG_BLOCK.lastIndex = to;
  }
  return blocks;
}

const STATEMENT_TOKEN = /\b(begin|fork|case|casex|casez|end|join|join_any|join_none|endcase)\b|[;()]/g;

/** The end of the statement starting at `from`: a `begin … end`, or up to `;`, `else` branches included. */
function statementEnd(code: string, from: number, limit: number): number {
  let depth = 0;
  let parens = 0;
  STATEMENT_TOKEN.lastIndex = from;
  for (let m = STATEMENT_TOKEN.exec(code); m && m.index < limit; m = STATEMENT_TOKEN.exec(code)) {
    const t = m[0];
    if (t === '(') parens++;
    else if (t === ')') parens--;
    else if (parens > 0) continue;
    else if (/^(begin|fork|case|casex|casez)$/.test(t)) depth++;
    else if (t !== ';') depth--;
    const after = m.index + t.length;
    if (depth <= 0 && (t === ';' || /^(end|join|join_any|join_none|endcase)$/.test(t)) && !/^\s*else\b/.test(code.slice(after, after + 40))) {
      return after;
    }
  }
  return limit;
}
