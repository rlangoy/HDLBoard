// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * VHDL scopes and declarations, found by walking tokens rather than by parsing.
 * Only language facts live here; resolving names is symbolIndex.ts's job.
 *
 * Scopes: entity, architecture (inside its entity, so ports are visible), package,
 * process, block, generate, component, configuration, function and procedure.
 * Each closes at an `end` that is not `end if` / `end case` / `end loop` / … .
 *
 * Declarations: signal, variable, constant, alias, type, subtype, enumeration
 * literals, and the names in port, generic and subprogram parameter lists.
 * VHDL is case-insensitive; symbolIndex.ts compares names in lower case.
 */

import {
  DeclarationMap,
  isIdentifier,
  matchingClose,
  ScopeTracker,
  type Analysis,
} from './analysis';
import type { SourceToken } from './sourceTokens';
import type { SymbolKind } from './types';

/** Keywords that open a scope (when they do not follow `end` or a label's `:`). */
const SCOPE_OPENERS: ReadonlySet<string> = new Set([
  'entity', 'architecture', 'package', 'process', 'block', 'generate', 'component', 'configuration',
]);
const SUBPROGRAMS: ReadonlySet<string> = new Set(['function', 'procedure']);
/** `end if`, `end loop`, …: these close a statement, never one of our scopes. */
const NON_SCOPE_ENDS: ReadonlySet<string> = new Set(['if', 'case', 'loop', 'record', 'units', 'protected', 'for']);
/** `u0 : entity work.counter`, `u1 : component counter`: an instance, not a declaration. */
const INSTANTIABLE: ReadonlySet<string> = new Set(['entity', 'component', 'configuration']);
/** `signal a, b : …` */
const OBJECT_DECLARATIONS: ReadonlyMap<string, SymbolKind> = new Map([
  ['signal', 'signal'],
  ['variable', 'variable'],
  ['constant', 'constant'],
]);
/** `port (…)`, `generic (…)` */
const INTERFACE_LISTS: ReadonlyMap<string, SymbolKind> = new Map([
  ['port', 'port'],
  ['generic', 'generic'],
]);
/** Words that may start an item of an interface list: `(signal x : out bit; constant n : integer)`. */
const INTERFACE_CLASS_WORDS: ReadonlySet<string> = new Set(['signal', 'variable', 'constant', 'file']);

export function analyzeVhdl(tokens: readonly SourceToken[]): Analysis {
  const scopes = new ScopeTracker();
  const declarations = new DeclarationMap();
  const ignored = new Set<number>();
  const tokenScopes: number[] = [];
  const entityScopes = new Map<string, number>();
  /** Subprogram scopes whose `is` has not been seen yet, with the bracket depth they opened at. */
  const pendingSubprograms = new Map<number, number>();
  let depth = 0;
  let inEndStatement = false;

  for (let i = 0; i < tokens.length; i++) {
    tokenScopes[i] = scopes.current;
    const token = tokens[i];
    const word = token.text.toLowerCase();

    if (token.text === '(') depth++;
    else if (token.text === ')') depth--;

    // `end process blink;`: the words up to the `;` close a scope; they declare and refer to nothing.
    if (inEndStatement) {
      if (token.text === ';') inEndStatement = false;
      else if (isIdentifier(token)) ignored.add(i);
      continue;
    }
    if (word === 'end') {
      if (!NON_SCOPE_ENDS.has(tokens[i + 1]?.text.toLowerCase() ?? '')) scopes.close();
      inEndStatement = true;
      continue;
    }

    // A function or procedure declared without a body (`function f (a : bit) return bit;`) ends at its `;`.
    const pendingAt = pendingSubprograms.get(scopes.current);
    if (pendingAt === depth && word === 'is') pendingSubprograms.delete(scopes.current);
    if (pendingAt === depth && token.text === ';') {
      pendingSubprograms.delete(scopes.current);
      scopes.close();
      continue;
    }

    const isInstance = tokens[i - 1]?.text === ':' && INSTANTIABLE.has(word);
    if (SCOPE_OPENERS.has(word) && !isInstance) openScope(tokens, i, word, scopes, entityScopes);

    if (SUBPROGRAMS.has(word)) {
      pendingSubprograms.set(scopes.open(), depth);
      const open = indexOfOpenBracket(tokens, i + 1);
      if (open !== undefined) declareAll(declarations, interfaceNames(tokens, open), 'parameter');
    }

    const listKind = INTERFACE_LISTS.get(word);
    if (listKind && tokens[i + 1]?.text === '(') declareAll(declarations, interfaceNames(tokens, i + 1), listKind);

    const objectKind = OBJECT_DECLARATIONS.get(word);
    if (objectKind) declareAll(declarations, namesBeforeColon(tokens, i + 1), objectKind);

    if (word === 'alias' && isIdentifier(tokens[i + 1])) declarations.add(i + 1, 'alias');
    if ((word === 'type' || word === 'subtype') && isIdentifier(tokens[i + 1])) declarations.add(i + 1, 'type');
    if (word === 'type') declareAll(declarations, enumerationLiterals(tokens, i), 'enum-literal');
    if (word === 'record') recordFieldNames(tokens, i).forEach((j) => ignored.add(j));
    if (word === 'map' && tokens[i + 1]?.text === '(') formalNames(tokens, i + 1).forEach((j) => ignored.add(j));

    // A label (`blink : process`) is a name followed by `:` that declares nothing.
    if (isIdentifier(token) && tokens[i + 1]?.text === ':' && !declarations.entries.has(i)) ignored.add(i);
  }

  return {
    scopeParents: scopes.scopeParents,
    tokenScopes,
    declarations: declarations.entries,
    ignored,
  };
}

/** Opens the scope a keyword starts. An architecture sits inside its entity so it sees the ports. */
function openScope(
  tokens: readonly SourceToken[],
  i: number,
  word: string,
  scopes: ScopeTracker,
  entityScopes: Map<string, number>,
): void {
  if (word === 'architecture') {
    const entityName = tokens[i + 2]?.text.toLowerCase() === 'of' ? tokens[i + 3]?.text.toLowerCase() : undefined;
    scopes.open(entityScopes.get(entityName ?? '') ?? scopes.current);
    return;
  }
  const scope = scopes.open();
  if (word === 'entity' && isIdentifier(tokens[i + 1])) entityScopes.set(tokens[i + 1].text.toLowerCase(), scope);
}

function declareAll(declarations: DeclarationMap, indices: readonly number[], kind: SymbolKind): void {
  for (const index of indices) declarations.add(index, kind);
}

/** The `(` that starts a subprogram's parameter list: `function f (` or `function "+" (` (the string is dropped). */
function indexOfOpenBracket(tokens: readonly SourceToken[], from: number): number | undefined {
  if (tokens[from]?.text === '(') return from;
  if (tokens[from + 1]?.text === '(') return from + 1;
  return undefined;
}

/** `a, b, c :` starting at `from`; nothing unless the list really ends in `:`. */
function namesBeforeColon(tokens: readonly SourceToken[], from: number): number[] {
  const names: number[] = [];
  let j = from;
  while (isIdentifier(tokens[j])) {
    names.push(j);
    if (tokens[j + 1]?.text !== ',') break;
    j += 2;
  }
  return tokens[j + 1]?.text === ':' ? names : [];
}

/**
 * The declared names of an interface list `( a, b : in bit; signal c : out bit )`:
 * at the start of each `;`-separated item, the identifiers before the `:`.
 */
function interfaceNames(tokens: readonly SourceToken[], open: number): number[] {
  const close = matchingClose(tokens, open);
  const names: number[] = [];
  let atItemStart = true;
  for (let j = open + 1; j < close; j++) {
    const token = tokens[j];
    if (token.text === '(') j = matchingClose(tokens, j); // `std_logic_vector(7 downto 0)`
    else if (token.text === ';') atItemStart = true;
    else if (!atItemStart || token.text === ',') continue;
    else if (INTERFACE_CLASS_WORDS.has(token.text.toLowerCase())) continue;
    else if (isIdentifier(token)) names.push(j);
    else atItemStart = false; // the `:` (or anything else) ends the item's names
  }
  return names;
}

/** `type state_t is (IDLE, RUN, DONE)`: the literals. */
function enumerationLiterals(tokens: readonly SourceToken[], typeIndex: number): number[] {
  const open = typeIndex + 3;
  if (tokens[typeIndex + 2]?.text.toLowerCase() !== 'is' || tokens[open]?.text !== '(') return [];
  const close = matchingClose(tokens, open);
  const literals: number[] = [];
  for (let j = open + 1; j < close; j++) if (isIdentifier(tokens[j])) literals.push(j);
  return literals;
}

/** `record a, b : bit; c : integer; end record`: the field names, which are not references. */
function recordFieldNames(tokens: readonly SourceToken[], recordIndex: number): number[] {
  const fields: number[] = [];
  for (let j = recordIndex + 1; j < tokens.length && tokens[j].text.toLowerCase() !== 'end'; j++) {
    const startsItem = tokens[j - 1].text === ';' || j === recordIndex + 1;
    if (startsItem) fields.push(...namesBeforeColon(tokens, j));
  }
  return fields;
}

/** `port map (clk => clk_50, q => leds)`: the formals left of `=>`. */
function formalNames(tokens: readonly SourceToken[], open: number): number[] {
  const close = matchingClose(tokens, open);
  const formals: number[] = [];
  for (let j = open + 1; j < close; j++) {
    if (tokens[j].text === '(') j = matchingClose(tokens, j);
    else if (isIdentifier(tokens[j]) && tokens[j + 1]?.text === '=>') formals.push(j);
  }
  return formals;
}
