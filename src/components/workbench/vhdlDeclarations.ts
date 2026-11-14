// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * The objects a VHDL file declares and their types, found by pattern rather than
 * by parsing: enough for advice to say "`leds` has 8 bits" or "`value` is 0 to 3".
 * Signals, variables, constants, ports, generics, parameters and loop variables;
 * array, range, enumeration and subtype declarations. Comments are skipped.
 * Anything not understood gives `undefined`, never a guess. Pure.
 */

import { constantDifference, evaluateStatic, type StaticNames } from './staticInteger';
import { tokenizeVhdlLine } from './vhdlHighlight';

export type Direction = 'to' | 'downto';

/**
 * A range as written (`3 downto 0`), with its ends when they are static numbers,
 * else its length when that does not change with them (`i downto i - 3` has 4).
 */
export interface DeclaredRange {
  readonly text: string;
  readonly direction: Direction;
  readonly left?: number;
  readonly right?: number;
  readonly length?: number;
}

/** What advice needs to know of a type; `name` is as the student wrote it. */
export type ObjectType =
  | { readonly kind: 'vector'; readonly name: string; readonly range?: DeclaredRange; readonly element?: string }
  | { readonly kind: 'number'; readonly name: string; readonly range?: DeclaredRange }
  | { readonly kind: 'enumeration'; readonly name: string; readonly literals: readonly string[] }
  | { readonly kind: 'scalar'; readonly name: string };

export type ObjectClass = 'signal' | 'variable' | 'constant' | 'port' | 'generic' | 'parameter' | 'loop';

export interface DeclaredObject {
  readonly name: string;
  readonly objectClass: ObjectClass;
  /** 1-based. */
  readonly line: number;
  /** The subtype indication as written, spaces collapsed: `integer range 0 to 3`. */
  readonly typeText: string;
  /** The default or constant value as written, if any. */
  readonly initial?: string;
}

export const INTEGER_HIGH = 2147483647;

/** The ends of a range in ascending order, when both are known. */
export function boundsOf(range: DeclaredRange | undefined): { readonly low: number; readonly high: number } | undefined {
  if (range?.left === undefined || range.right === undefined) return undefined;
  return { low: Math.min(range.left, range.right), high: Math.max(range.left, range.right) };
}

/** How many elements `left` to `right` has in `direction`; a null range has 0. */
function elementCount(direction: Direction, left: number, right: number): number {
  return Math.max(direction === 'downto' ? left - right + 1 : right - left + 1, 0);
}

/** How many elements a range has: `3 downto 0` has 4, and so does `i downto i - 3`. */
export function lengthOf(range: DeclaredRange | undefined): number | undefined {
  if (range?.left === undefined || range.right === undefined) return range?.length;
  return elementCount(range.direction, range.left, range.right);
}

/** Stands for every generic when a `generic map` sets generics by position. */
const BY_POSITION = '';
const GENERIC_MAP = /\bgeneric\s+map\s*\(/gi;
const NAMED_ASSOCIATION = /^\s*(?<formal>\w+)\s*=>/;

/**
 * The generics some instance in the project sets (`generic map (WIDTH => 6)`):
 * their defaults are not their values. A map by position may set any of them.
 */
export class GenericsSetByInstances {
  private readonly names = new Set<string>();

  constructor(contents: readonly string[]) {
    for (const content of contents) {
      const code = codeOf(content.split('\n'));
      for (const match of code.matchAll(GENERIC_MAP)) this.read(code, match.index + match[0].length);
    }
  }

  sets(generic: string): boolean {
    return this.names.has(BY_POSITION) || this.names.has(generic.toLowerCase());
  }

  /** The associations of the map whose list starts at `open`, split at its top-level commas. */
  private read(code: string, open: number): void {
    let depth = 0;
    let start = open;
    for (let i = open; i < code.length && depth >= 0; i++) {
      const char = code[i];
      const ends = (char === ',' && depth === 0) || (char === ')' && depth === 0);
      if (ends) {
        this.names.add(NAMED_ASSOCIATION.exec(code.slice(start, i))?.groups?.formal.toLowerCase() ?? BY_POSITION);
        start = i + 1;
      }
      if (char === '(') depth++;
      else if (char === ')') depth--;
    }
  }
}

const NO_GENERICS_SET = new GenericsSetByInstances([]);

const VECTOR_TYPES: ReadonlySet<string> = new Set([
  'std_logic_vector', 'std_ulogic_vector', 'bit_vector', 'unsigned', 'signed', 'string', 'boolean_vector', 'integer_vector',
]);

const PREDEFINED_RANGES: Readonly<Record<string, string | undefined>> = {
  integer: undefined,
  natural: `0 to ${INTEGER_HIGH}`,
  positive: `1 to ${INTEGER_HIGH}`,
};

const MODE_WORDS = /^(?:in|out|inout|buffer|linkage)\s+/i;
const RANGE_TEXT = /^(?<left>.+?)\s+(?<direction>to|downto)\s+(?<right>.+)$/is;
const RANGE_ATTRIBUTE = /^(?<name>\w+)'(?<attribute>range|reverse_range)$/i;
/** `natural range 0 to 7` in a loop or an index constraint: the type in front adds nothing. */
const TYPE_BEFORE_RANGE = /^\w+\s+range\s+/i;
/** `name`, an index or range constraint, then a `range` constraint: `integer range 0 to 3`. */
const SUBTYPE_INDICATION = /^(?<base>\w+)\s*(?:\((?<constraint>.*)\))?\s*(?:range\s+(?<range>.*))?$/is;

const OBJECT_DECLARATION = /\b(?<objectClass>signal|variable|constant)\s+(?<names>\w+(?:\s*,\s*\w+)*)\s*:(?!=)/gi;
const INTERFACE_LIST = /\b(?:(?<list>port|generic)\s*\(|(?:function|procedure)\s+\w+\s*\()/gi;
const INTERFACE_ITEM = /^\s*(?:signal|variable|constant|file)?\s*(?<names>\w+(?:\s*,\s*\w+)*)\s*:(?!=)(?<rest>[\s\S]*)$/i;
const LOOP_PARAMETER = /\bfor\s+(?<name>\w+)\s+in\s+(?<range>[^;]+?)\s+(?:loop|generate)\b/gi;
const ARRAY_TYPE = /\btype\s+(?<name>\w+)\s+is\s+array\s*\((?<range>[^;]*?)\)\s*of\s+(?<element>[^;]+);/gi;
const ENUMERATION_TYPE = /\btype\s+(?<name>\w+)\s+is\s+\((?<literals>[^;]*?)\)\s*;/gi;
const RANGE_TYPE = /\btype\s+(?<name>\w+)\s+is\s+range\s+(?<range>[^;]+);/gi;
const SUBTYPE = /\bsubtype\s+(?<name>\w+)\s+is\s+(?<indication>[^;]+);/gi;

/** A declared type or subtype, before it is resolved. */
type TypeDeclaration =
  | { readonly kind: 'array'; readonly range: string; readonly element: string }
  | { readonly kind: 'enumeration'; readonly literals: readonly string[] }
  | { readonly kind: 'range'; readonly range: string }
  | { readonly kind: 'subtype'; readonly indication: string };

/** Subtypes of subtypes are followed this deep, so a cycle cannot hang the advice. */
const MAX_TYPE_DEPTH = 8;
/** Constants defined by other constants are followed this deep, for the same reason. */
const MAX_NESTING = 16;

function collapse(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

function namesIn(list: string): string[] {
  return list.split(',').map((name) => name.trim());
}

/** The file as one text, each comment blanked so that every offset stays where it was. */
function codeOf(lines: readonly string[]): string {
  const withoutComment = (line: string) =>
    tokenizeVhdlLine(line).map(({ text, type }) => (type === 'comment' ? ' '.repeat(text.length) : text)).join('');
  return lines.map(withoutComment).join('\n');
}

/**
 * The text from `start` to the end of a subtype indication: a `;` or `:=` outside
 * parentheses, or the `)` that closes the list it is in.
 */
function readUntilEnd(code: string, start: number): string {
  let depth = 0;
  for (let i = start; i < code.length; i++) {
    const char = code[i];
    if (char === '(') depth++;
    else if (char === ')' && --depth < 0) return code.slice(start, i);
    else if (depth === 0 && (char === ';' || code.startsWith(':=', i))) return code.slice(start, i);
  }
  return code.slice(start);
}

/** The items of the parenthesised list that starts after `open`, split at its top-level `;`. */
function listItems(code: string, open: number): { readonly text: string; readonly start: number }[] {
  const items: { text: string; start: number }[] = [];
  let depth = 0;
  let itemStart = open;
  for (let i = open; i < code.length; i++) {
    const char = code[i];
    if (char === '(') depth++;
    else if (char === ')' && --depth < 0) {
      items.push({ text: code.slice(itemStart, i), start: itemStart });
      return items;
    } else if (char === ';' && depth === 0) {
      items.push({ text: code.slice(itemStart, i), start: itemStart });
      itemStart = i + 1;
    }
  }
  return items;
}

/** `in std_logic := '0'` → the subtype and the default. */
function subtypeAndDefault(text: string): { readonly typeText: string; readonly initial?: string } {
  const assignment = text.indexOf(':=');
  const indication = assignment < 0 ? text : text.slice(0, assignment);
  const typeText = collapse(indication).replace(MODE_WORDS, '');
  return assignment < 0 ? { typeText } : { typeText, initial: collapse(text.slice(assignment + 2)) };
}

/** Where each line starts in the text the lines make, joined by newlines. */
function lineStartsOf(lines: readonly string[]): number[] {
  const starts: number[] = [];
  let offset = 0;
  for (const line of lines) {
    starts.push(offset);
    offset += line.length + 1;
  }
  return starts;
}

/** Every declaration of one file, read once; answers questions about names in it. */
export class VhdlDeclarations {
  private readonly code: string;
  private readonly lineStarts: readonly number[];
  private readonly objects: DeclaredObject[] = [];
  private readonly types = new Map<string, TypeDeclaration>();
  /** How deep `valueOf` is in constants naming constants: `constant A : integer := A + 1` must end. */
  private nesting = 0;

  /** `genericsSet`: generics whose default is not their value, because an instance sets them. */
  constructor(
    lines: readonly string[],
    private readonly genericsSet: GenericsSetByInstances = NO_GENERICS_SET,
  ) {
    this.code = codeOf(lines);
    this.lineStarts = lineStartsOf(lines);
    this.readObjects();
    this.readInterfaceLists();
    this.readLoopParameters();
    this.readTypes();
  }

  /** The declaration of `name` that `line` sees: the nearest one above it, else the first in the file. */
  objectAt(name: string, line: number): DeclaredObject | undefined {
    const same = this.objects.filter((object) => object.name.toLowerCase() === name.toLowerCase());
    const above = same.filter((object) => object.line <= line).sort((a, b) => b.line - a.line);
    return above[0] ?? same.sort((a, b) => a.line - b.line)[0];
  }

  /** The objects whose declaration starts on 1-based `line`. */
  declaredOn(line: number): DeclaredObject[] {
    return this.objects.filter((object) => object.line === line);
  }

  /** The port `name` of the entity declared on `entityLine`: the first port by that name after it. */
  portAfter(entityLine: number, name: string): DeclaredObject | undefined {
    const ports = this.objects.filter((o) => o.objectClass === 'port' && o.line >= entityLine && o.name.toLowerCase() === name.toLowerCase());
    return ports.sort((a, b) => a.line - b.line)[0];
  }

  /** The type of the object `name` that `line` sees. */
  typeAt(name: string, line: number): ObjectType | undefined {
    const object = this.objectAt(name, line);
    if (object === undefined) return undefined;
    return object.objectClass === 'loop' ? this.loopType(object, line) : this.typeOf(object.typeText, line);
  }

  /** A static integer expression's value (`N - 1`), with the file's constants and generics. */
  valueOf(expression: string, line: number): number | undefined {
    return this.nested(() => evaluateStatic(expression, this.staticNames(line)));
  }

  /** Runs one evaluation, unless constants naming constants have gone too deep. */
  private nested<T>(evaluation: () => T | undefined): T | undefined {
    if (this.nesting > MAX_NESTING) return undefined;
    this.nesting++;
    try {
      return evaluation();
    } finally {
      this.nesting--;
    }
  }

  private staticNames(line: number): StaticNames {
    return {
      constant: (name) => this.constantValue(name, line),
      attribute: (name, attribute) => this.attributeValue(name, attribute, line),
    };
  }

  /** A signal, variable, port, parameter or loop variable: a name whose value changes while the design runs. */
  private changes(name: string, line: number): boolean {
    const objectClass = this.objectAt(name, line)?.objectClass;
    return objectClass !== undefined && objectClass !== 'constant' && objectClass !== 'generic';
  }

  /** `left - right` when algebra proves it the same whatever the changing names hold (staticInteger.ts). */
  constantDifference(left: string, right: string, line: number): number | undefined {
    const names = { ...this.staticNames(line), changes: (name: string) => this.changes(name, line) };
    return this.nested(() => constantDifference(left, right, names));
  }

  /** `3 downto 0`, `x'range`, `natural range 0 to 7`; undefined for `natural range <>`. */
  rangeOf(text: string, line: number): DeclaredRange | undefined {
    const written = collapse(text).replace(TYPE_BEFORE_RANGE, '');
    const attribute = RANGE_ATTRIBUTE.exec(written)?.groups;
    if (attribute) return this.rangeAttribute(attribute.name, attribute.attribute.toLowerCase(), line);
    const parts = RANGE_TEXT.exec(written)?.groups;
    if (parts === undefined) return undefined;
    const direction = parts.direction.toLowerCase() as Direction;
    const left = this.valueOf(parts.left, line);
    const right = this.valueOf(parts.right, line);
    if (left !== undefined && right !== undefined) return { text: written, direction, left, right };
    const difference = this.constantDifference(parts.left, parts.right, line);
    const length = difference === undefined ? undefined : elementCount(direction, difference, 0);
    return { text: written, direction, left, right, length };
  }

  /** What a subtype indication (`std_logic_vector(7 downto 0)`, `digit_t`) stands for. */
  typeOf(indication: string, line: number, depth = 0): ObjectType | undefined {
    const parts = SUBTYPE_INDICATION.exec(collapse(indication))?.groups;
    if (parts === undefined || depth > MAX_TYPE_DEPTH) return undefined;
    const { base, constraint, range } = parts;
    const constrained = (fallback?: DeclaredRange) => this.constraintRange(constraint ?? range, line) ?? fallback;
    const lower = base.toLowerCase();
    if (VECTOR_TYPES.has(lower)) return { kind: 'vector', name: base, range: constrained() };
    if (lower in PREDEFINED_RANGES) {
      const own = PREDEFINED_RANGES[lower];
      return { kind: 'number', name: base, range: constrained(own === undefined ? undefined : this.rangeOf(own, line)) };
    }
    const declared = this.types.get(lower);
    return declared === undefined ? { kind: 'scalar', name: base } : this.declaredType(base, declared, constrained, line, depth);
  }

  private declaredType(
    name: string,
    declared: TypeDeclaration,
    constrained: (fallback?: DeclaredRange) => DeclaredRange | undefined,
    line: number,
    depth: number,
  ): ObjectType | undefined {
    switch (declared.kind) {
      case 'array':
        return { kind: 'vector', name, range: constrained(this.constraintRange(declared.range, line)), element: declared.element };
      case 'enumeration':
        return { kind: 'enumeration', name, literals: declared.literals };
      case 'range':
        return { kind: 'number', name, range: constrained(this.rangeOf(declared.range, line)) };
      case 'subtype': {
        const resolved = this.typeOf(declared.indication, line, depth + 1);
        if (resolved === undefined || resolved.kind === 'enumeration' || resolved.kind === 'scalar') return resolved;
        return { ...resolved, name, range: constrained(resolved.range) };
      }
    }
  }

  /** The range in `(7 downto 0)` or after `range`; an index constraint with a comma has none. */
  private constraintRange(text: string | undefined, line: number): DeclaredRange | undefined {
    return text === undefined || text.includes(',') ? undefined : this.rangeOf(text, line);
  }

  private loopType(object: DeclaredObject, line: number): ObjectType {
    return { kind: 'number', name: 'integer', range: this.rangeOf(object.typeText, line) };
  }

  private rangeAttribute(name: string, attribute: string, line: number): DeclaredRange | undefined {
    const type = this.typeAt(name, line);
    const range = type?.kind === 'vector' || type?.kind === 'number' ? type.range : undefined;
    if (range === undefined || attribute === 'range') return range;
    const direction: Direction = range.direction === 'to' ? 'downto' : 'to';
    return { text: `${name}'reverse_range`, direction, left: range.right, right: range.left };
  }

  /** A constant's value, or a generic's default when no instance sets that generic. */
  private constantValue(name: string, line: number): number | undefined {
    const object = this.objectAt(name, line);
    const isGenericWithKnownValue = object?.objectClass === 'generic' && !this.genericsSet.sets(object.name);
    const isConstant = object?.objectClass === 'constant' || isGenericWithKnownValue;
    return isConstant && object?.initial !== undefined ? this.valueOf(object.initial, object.line) : undefined;
  }

  private attributeValue(name: string, attribute: string, line: number): number | undefined {
    if (name.toLowerCase() === 'integer' && attribute === 'high') return INTEGER_HIGH;
    const type = this.typeAt(name, line);
    const range = type?.kind === 'vector' || type?.kind === 'number' ? type.range : undefined;
    const bounds = boundsOf(range);
    const values: Readonly<Record<string, number | undefined>> = {
      length: lengthOf(range),
      high: bounds?.high,
      low: bounds?.low,
      left: range?.left,
      right: range?.right,
    };
    return values[attribute];
  }

  private lineAt(offset: number): number {
    let line = 0;
    while (line + 1 < this.lineStarts.length && this.lineStarts[line + 1] <= offset) line++;
    return line + 1;
  }

  private add(names: string, objectClass: ObjectClass, offset: number, text: string): void {
    const { typeText, initial } = subtypeAndDefault(text);
    for (const name of namesIn(names)) this.objects.push({ name, objectClass, line: this.lineAt(offset), typeText, initial });
  }

  private readObjects(): void {
    for (const match of this.code.matchAll(OBJECT_DECLARATION)) {
      const { objectClass, names } = match.groups ?? {};
      const end = match.index + match[0].length;
      const indication = readUntilEnd(this.code, end);
      const assignment = end + indication.length;
      const initial = this.code.startsWith(':=', assignment) ? `:=${readUntilEnd(this.code, assignment + 2)}` : '';
      this.add(names, objectClass.toLowerCase() as ObjectClass, match.index, `${indication}${initial}`);
    }
  }

  private readInterfaceLists(): void {
    for (const match of this.code.matchAll(INTERFACE_LIST)) {
      const list = match.groups?.list?.toLowerCase();
      const objectClass: ObjectClass = list === 'port' ? 'port' : list === 'generic' ? 'generic' : 'parameter';
      for (const item of listItems(this.code, match.index + match[0].length)) {
        const parts = INTERFACE_ITEM.exec(item.text)?.groups;
        if (parts) this.add(parts.names, objectClass, item.start + item.text.indexOf(parts.names), parts.rest);
      }
    }
  }

  private readLoopParameters(): void {
    for (const match of this.code.matchAll(LOOP_PARAMETER)) {
      const { name, range } = match.groups ?? {};
      this.objects.push({ name, objectClass: 'loop', line: this.lineAt(match.index), typeText: collapse(range) });
    }
  }

  private readTypes(): void {
    const declare = (name: string, declaration: TypeDeclaration) => this.types.set(name.toLowerCase(), declaration);
    for (const { groups } of this.code.matchAll(ARRAY_TYPE)) {
      if (groups) declare(groups.name, { kind: 'array', range: groups.range, element: collapse(groups.element) });
    }
    for (const { groups } of this.code.matchAll(ENUMERATION_TYPE)) {
      if (groups) declare(groups.name, { kind: 'enumeration', literals: namesIn(groups.literals) });
    }
    for (const { groups } of this.code.matchAll(RANGE_TYPE)) {
      if (groups) declare(groups.name, { kind: 'range', range: groups.range });
    }
    for (const { groups } of this.code.matchAll(SUBTYPE)) {
      if (groups) declare(groups.name, { kind: 'subtype', indication: groups.indication });
    }
  }
}
