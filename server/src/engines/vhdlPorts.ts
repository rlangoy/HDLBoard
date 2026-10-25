// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * Reads an entity's port clause from VHDL source: each port's name, where it is
 * written, its mode, its type and whether it has a default — and turns a place in the
 * source into GHDL's own line and column. Text analysis for the backend's own use,
 * on source GHDL has already analysed. Pure.
 */

/** One name of an entity's port clause. */
export interface PortDeclaration {
  /** As written. */
  readonly name: string;
  /** Where the name starts in the source. */
  readonly offset: number;
  /** Lower case; `in` when the declaration names none. */
  readonly mode: string;
  /** The type mark, lower case, without a library prefix: `std_logic_vector`. */
  readonly type: string;
  /** A `(` follows the type mark: `std_logic_vector(9 downto 0)`. */
  readonly constrained: boolean;
  readonly hasDefault: boolean;
  /** The subtype as written, without mode or default: `std_logic_vector(9 downto 0)`. */
  readonly declaration: string;
  /** Its width when HDLBoard can read it: 1 for `std_logic`, N for a literal range; else undefined (§ 8). */
  readonly width?: number;
}

const SCALAR_TYPES: readonly string[] = ['std_logic', 'std_ulogic', 'bit'];
const VECTOR_TYPES: readonly string[] = ['std_logic_vector', 'std_ulogic_vector', 'bit_vector', 'unsigned', 'signed'];
/** A literal range: `(9 downto 0)` or `(0 to 9)`. */
const LITERAL_RANGE = /^\(\s*(\d+)\s+(?:downto|to)\s+(\d+)\s*\)$/i;

/** The width of a declared subtype, when it is a scalar type or a vector type with a literal range. */
export function declaredWidth(type: string, declaration: string): number | undefined {
  if (SCALAR_TYPES.includes(type)) return 1;
  if (!VECTOR_TYPES.includes(type)) return undefined;
  const range = LITERAL_RANGE.exec(declaration.slice(declaration.indexOf('(')).trim());
  return range ? Math.abs(Number(range[1]) - Number(range[2])) + 1 : undefined;
}

const GHDL_TAB_STOP = 8;

const STRING_OR_COMMENT = /"[^"\n]*"|--[^\n]*|\/\*[\s\S]*?\*\//g;
const PORT_CLAUSE_OR_END = /\b(?:port\s*\(|end\b|begin\b)/gi;
const MODE_AND_TYPE = /^\s*(?:(?<mode>in|out|inout|buffer|linkage)\b)?\s*(?<type>[\w.]+)\s*(?<constraint>\()?/i;

/** Comments blanked to spaces, so every offset still points at the same character of the source. */
function blankComments(src: string): string {
  return src.replace(STRING_OR_COMMENT, (text) => (text.startsWith('"') ? text : text.replace(/[^\n]/g, ' ')));
}

const escapeRegExp = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** The offset just after the `(` of `entityName`'s port clause, or `undefined` when it has none. */
function portClauseStart(code: string, entityName: string): number | undefined {
  const entity = new RegExp(`\\bentity\\s+${escapeRegExp(entityName)}\\s+is\\b`, 'i').exec(code);
  if (!entity) return undefined;
  const clauseOrEnd = new RegExp(PORT_CLAUSE_OR_END);
  clauseOrEnd.lastIndex = entity.index + entity[0].length;
  const found = clauseOrEnd.exec(code);
  const isPortClause = found !== null && /^port/i.test(found[0]);
  return isPortClause ? found.index + found[0].length : undefined;
}

/** The port clause's declarations with their offsets: split at `;` outside nested parentheses. */
function declarationTexts(code: string, start: number): Array<{ offset: number; text: string }> {
  const declarations: Array<{ offset: number; text: string }> = [];
  let depth = 1;
  let offset = start;
  for (let i = start; i < code.length && depth > 0; i++) {
    if (code[i] === '(') depth++;
    else if (code[i] === ')') depth--;
    const declarationEnds = (code[i] === ';' && depth === 1) || depth === 0;
    if (declarationEnds) {
      declarations.push({ offset, text: code.slice(offset, i) });
      offset = i + 1;
    }
  }
  return declarations;
}

/** `a, b : in std_logic := '0'` → one declaration per name. */
function parseDeclaration(offset: number, text: string): PortDeclaration[] {
  const colon = text.indexOf(':');
  if (colon < 0) return [];
  const subtype = text.slice(colon + 1);
  const groups = MODE_AND_TYPE.exec(subtype)?.groups ?? {};
  const type = (groups.type ?? '').toLowerCase().split('.').pop() ?? '';
  const declaration = writtenSubtype(subtype, groups.mode);
  const shared = {
    mode: (groups.mode ?? 'in').toLowerCase(),
    type,
    constrained: groups.constraint !== undefined,
    hasDefault: subtype.includes(':='),
    declaration,
    width: declaredWidth(type, declaration),
  };
  const names = [...text.slice(0, colon).matchAll(/\w+/g)];
  return names.map((m) => ({ ...shared, name: m[0], offset: offset + (m.index ?? 0) }));
}

/** `in std_logic_vector(9 downto 0) := …` → `std_logic_vector(9 downto 0)`, spaces collapsed. */
function writtenSubtype(subtype: string, mode: string | undefined): string {
  const withoutDefault = subtype.split(':=')[0] ?? '';
  const withoutMode = mode === undefined ? withoutDefault : withoutDefault.replace(new RegExp(`^\\s*${mode}\\b`, 'i'), '');
  return withoutMode.replace(/\s+/g, ' ').trim();
}

/** Every name of `entityName`'s port clause, in order; none when the clause cannot be found. */
export function portDeclarations(src: string, entityName: string): PortDeclaration[] {
  const code = blankComments(src);
  const start = portClauseStart(code, entityName);
  if (start === undefined) return [];
  return declarationTexts(code, start).flatMap(({ offset, text }) => parseDeclaration(offset, text));
}

/** GHDL's column after `char`, which starts at `column`: a tab advances to the next multiple of 8. */
function ghdlColumnAfter(column: number, char: string): number {
  if (char !== '\t') return column + Buffer.byteLength(char, 'utf8');
  return Math.floor((column - 1) / GHDL_TAB_STOP) * GHDL_TAB_STOP + GHDL_TAB_STOP + 1;
}

/** GHDL's 1-based line and column of `offset`; GHDL counts a character's UTF-8 bytes. */
export function ghdlPosition(src: string, offset: number): { line: number; column: number } {
  const before = src.slice(0, offset);
  const line = before.split('\n').length;
  const lineStart = before.lastIndexOf('\n') + 1;
  const column = [...before.slice(lineStart)].reduce(ghdlColumnAfter, 1);
  return { line, column };
}
