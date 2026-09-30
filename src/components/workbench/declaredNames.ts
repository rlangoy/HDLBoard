// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * The names a VHDL file declares, found by pattern rather than by parsing
 * (docs/editor_diagnostics_improvement_plan.md § 4.5). Rule B uses them to leave a
 * student's own names alone; Rule C offers them as suggestions. Comments and
 * strings are skipped. Pure.
 *
 * The patterns may find a little more than VHDL would (a name after `end
 * architecture`, a signal named in an attribute specification). That is the safe
 * direction: an extra name can only keep Rule B quiet, and every name found here
 * is one the student wrote.
 */

import { tokenizeVhdlLine, type Token } from './vhdlHighlight';
import { isReservedWord } from './vhdlWords';

/** The next word after each of these is the name it declares: `signal counter`, `architecture rtl`. */
const DECLARING_KEYWORDS: ReadonlySet<string> = new Set([
  'signal', 'constant', 'variable', 'entity', 'architecture', 'component', 'type', 'subtype',
  'function', 'procedure', 'package', 'alias', 'file',
]);
/** `package body pkg is`: the name comes one word later. */
const BODY = 'body';

type Significant = Pick<Token, 'text' | 'type'>;

/** Every name the file declares, as first written, once each whatever its case. */
export function declaredNames(source: string): string[] {
  const tokens = significantTokens(source);
  const names = [
    ...tokens.flatMap((_, i) => nameAfterKeyword(tokens, i)),
    ...tokens.flatMap((_, i) => namesBeforeColon(tokens, i)),
    ...tokens.flatMap((_, i) => enumerationLiterals(tokens, i)),
  ];
  return uniqueIgnoringCase(names.filter((name) => !isReservedWord(name)));
}

/** The tokens of the whole file, without whitespace and comments. */
function significantTokens(source: string): Significant[] {
  return source
    .split('\n')
    .flatMap((line) => tokenizeVhdlLine(line))
    .filter((token) => token.type !== 'whitespace' && token.type !== 'comment');
}

const WORD_TYPES: ReadonlySet<Token['type']> = new Set(['keyword', 'type', 'identifier']);

function isWord(token: Significant | undefined): token is Significant {
  return token !== undefined && WORD_TYPES.has(token.type);
}

/** `signal counter`, `architecture rtl`, `package body pkg`. */
function nameAfterKeyword(tokens: readonly Significant[], i: number): string[] {
  if (!DECLARING_KEYWORDS.has(tokens[i].text.toLowerCase())) return [];
  const next = tokens[i + 1];
  const name = next?.text.toLowerCase() === BODY ? tokens[i + 2] : next;
  return isWord(name) ? [name.text] : [];
}

/**
 * `a, b : std_logic` in a declaration, a port or generic list, a record or a
 * parameter list; `blink : process` and `u0 : counter` for labels. Every one of
 * them is a list of names in front of a lone `:` (`:=` is an assignment).
 */
function namesBeforeColon(tokens: readonly Significant[], i: number): string[] {
  const { text } = tokens[i];
  if (!text.startsWith(':') || text.startsWith(':=')) return [];
  const names: string[] = [];
  for (let j = i - 1; isWord(tokens[j]); j -= 2) {
    names.push(tokens[j].text);
    if (tokens[j - 1]?.text !== ',') break;
  }
  return names.reverse(); // found walking backwards; report them as written
}

/** Stands for the type's name in ENUMERATION_START. */
const ANY_NAME = '';
/** `type state_t is (`: an enumeration's literals follow. */
const ENUMERATION_START: readonly string[] = ['type', ANY_NAME, 'is', '('];

function startsEnumeration(tokens: readonly Significant[], i: number): boolean {
  return ENUMERATION_START.every(
    (text, k) => tokens[i + k] !== undefined && (text === ANY_NAME || tokens[i + k].text.toLowerCase() === text),
  );
}

/** `type state_t is (IDLE, RUN, DONE)`: the literals are declared names too. */
function enumerationLiterals(tokens: readonly Significant[], i: number): string[] {
  if (!startsEnumeration(tokens, i)) return [];
  const literals: string[] = [];
  for (let j = i + ENUMERATION_START.length; j < tokens.length && !tokens[j].text.includes(')'); j++) {
    if (isWord(tokens[j])) literals.push(tokens[j].text);
  }
  return literals;
}

function uniqueIgnoringCase(names: readonly string[]): string[] {
  const seen = new Map<string, string>();
  for (const name of names) if (!seen.has(name.toLowerCase())) seen.set(name.toLowerCase(), name);
  return [...seen.values()];
}
