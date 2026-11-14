// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * Every piece of text the student reads about a diagnostic — kept apart from
 * parsing and storage so the wording can change without touching them
 * (docs/editor_diagnostics_implementation_plan.md § 4.5, and the advice of
 * docs/editor_diagnostics_improvement_plan.md § 4.9). Pure.
 */

import {
  byDisplayOrder,
  countSeverities,
  isMuted,
  isMutedLine,
  quickFixOf,
  type LineDiagnostic,
  type LineMessage,
} from './diagnosticStore';
import type { QuickFix } from './diagnosticAdvice';
import { packagePath, useClauseText, type VhdlPackage } from './vhdlPackages';
import { code } from './codeMarkup';

export const INLINE_MESSAGE_MAX_CHARS = 120;
const ELLIPSIS = '…';
const DETAIL_INDENT = '  ';
export const CLEAR_HINT = 'Click or type in the file to clear the markers.';
/** Names the compiler in front of its own sentence when advice is the headline; GHDL's advice was the first and names none. */
const DEFAULT_COMPILER = 'GHDL';
const DEFAULT_LANGUAGE = 'VHDL';
const ENDS_A_SENTENCE = /[.?!]$/;

/** `begin` in code font: the advice on misplaced declarations names it often. */
const BEGIN = code('begin');

/**
 * The advice headlines (improvement plan § 4.9): the student's own word in code
 * font, one sentence, a question only for a guess, "Probably" where a rule
 * infers a cause, and none of the compiler's vocabulary.
 */
export const adviceText = {
  /** Rule B. */
  keywordTypo: (word: string, keyword: string, language = DEFAULT_LANGUAGE): string =>
    `${code(word)} is not a ${language} keyword — did you mean ${code(keyword)}?`,
  /** Rule B for Icarus, which often reports a misspelled keyword on the next line of code. */
  keywordTypoOnLine: (word: string, line: number, keyword: string, language: string): string =>
    `${code(word)} (line ${line}) is not a ${language} keyword — did you mean ${code(keyword)}?`,
  /** The missing package, offered as a Quick Fix. */
  missingPackage: (word: string, pkg: VhdlPackage): string =>
    `${code(word)} comes from the package ${code(packagePath(pkg))}, which this file does not use yet.`,
  /** The missing package, when the file uses one that cannot be used with it. */
  packageClash: (word: string, pkg: VhdlPackage, clash: VhdlPackage): string =>
    `${code(word)} comes from ${code(packagePath(pkg))}, but this file uses ${code(packagePath(clash))}, which clashes with it — use only one of them.`,
  /** Rule C. */
  undeclared: (word: string, suggestion: string): string =>
    `${code(word)} is not declared — did you mean ${code(suggestion)}?`,
  /** Rule D, when GHDL names what it expected. */
  missingAtEnd: (symbol: string, line: number): string => `Probably a missing ${code(symbol)} at the end of line ${line}.`,
  /** Rule D otherwise. */
  checkEndOfLine: (line: number): string =>
    `GHDL noticed this at the start of the line — check the end of line ${line}.`,
  /** Rule E: `end if` is two words, `elsif` one. */
  joinedKeyword: (word: string, line: number, wanted: string, language = DEFAULT_LANGUAGE): string =>
    wanted.includes(' ')
      ? `${code(word)} (line ${line}) must be two words in ${language}: ${code(wanted)}.`
      : `${code(word)} (line ${line}) is written ${code(wanted)} in ${language}.`,
  /** Rule G (Icarus): a misspelled name on the left of `assign` is not an error, only a new wire. */
  implicitWire: (word: string, suggestion: string): string =>
    `${code(word)} is not declared — did you mean ${code(suggestion)}? Verilog made a new, unconnected wire.`,
  /** Rule H (Icarus): `assign` to a `reg`, where Icarus's own note points at SystemVerilog. */
  regDrivenByAssign: (name: string): string =>
    `${code(name)} is a ${code('reg')}: drive it inside an ${code('always')} block, or declare it as ${code('wire')}.`,
  /** Rule H (Icarus): a `wire` assigned inside an `always` block. */
  wireAssignedInAlways: (name: string): string =>
    `${code(name)} is a ${code('wire')}: only a ${code('reg')} can be assigned inside an ${code('always')} block — declare it as ${code('reg')}.`,
  /**
   * A declaration written after `begin`: it belongs between `opener` (`is`,
   * `process`) and `begin`, and above the `begin` on `beginLine` when known.
   */
  declarationAfterBegin: (word: string, opener: string, beginLine?: number): string =>
    beginLine === undefined
      ? `${code(word)} declarations go between ${code(opener)} and ${BEGIN}, not after ${BEGIN}.`
      : `${code(word)} declarations go between ${code(opener)} and ${BEGIN} — move this line above the ${BEGIN} on line ${beginLine}.`,
  /** A `variable` among an architecture's statements: only a process (or subprogram) has variables. */
  variableInArchitecture: (): string =>
    `A ${code('variable')} can only be declared in a process, between ${code('process')} and ${BEGIN} — in the architecture, use a ${code('signal')}.`,
  /** A `signal` in a process: signals belong to the architecture. */
  signalInProcess: (architectureBeginLine?: number): string =>
    architectureBeginLine === undefined
      ? `A ${code('signal')} cannot be declared in a process — declare it in the architecture, between ${code('is')} and ${BEGIN}.`
      : `A ${code('signal')} cannot be declared in a process — declare it in the architecture, above the ${BEGIN} on line ${architectureBeginLine}.`,
  /** `architecture rtl2 of …` (or an entity, package …) started before the open architecture `outer` was ended. */
  unitInsideArchitecture: (unit: string, outer?: string): string => {
    const what = unit === 'architecture' ? 'An architecture' : `${unit === 'entity' ? 'An' : 'A'} ${unit}`;
    const where = unit === 'architecture' ? 'another architecture' : 'an architecture';
    const end = outer === undefined ? 'end the one above' : `end ${code(outer)}`;
    return `${what} cannot be placed inside ${where} — ${end} with ${code('end architecture;')} before this line.`;
  },
  /** `architecture rtl of X` where no file declares entity `X`; the suggestion's line when in the same file. */
  unknownEntity: (name: string, suggestion?: string, line?: number): string => {
    if (suggestion === undefined) return `Unknown entity ${code(name)} — no file in the project declares an entity with that name.`;
    const where = line === undefined ? '' : ` (line ${line})`;
    return `Unknown entity ${code(name)} — did you mean ${code(suggestion)}${where}?`;
  },
  /** On the outer architecture's header. Plain words: it is drawn without code font. */
  alreadyInsideArchitecture: (): string => 'You are already inside this architecture.',
  /** An `end` after the design unit was already closed. */
  extraEnd: (closedLine: number, kind = 'design unit'): string =>
    `Extra ${code('end')} — line ${closedLine} already closed the ${kind}. Delete this line.`,
  /** An architecture's statements started without `begin`: `statement` names the first (`assignment`, `process` …). */
  missingBegin: (statement: string): string => `Missing ${BEGIN} — insert ${BEGIN} before this ${statement}.`,
  /** The word written where the architecture's `begin` belongs (`begisasa`). */
  misspelledBegin: (word: string): string => `Missing ${BEGIN} — ${code(word)} is probably a misspelled ${BEGIN}.`,
  /** Rule F. */
  followOn: (line: number): string => `Probably caused by the error on line ${line} — fix that one first and run again.`,
  /** Rule F, on the line of the first error itself. */
  followOnSameLine: (): string => 'Probably caused by the first error on this line — fix that one first and run again.',
};

/** `an \`integer\``, `a \`std_logic_vector\``: a type named in a sentence. */
export function typeWithArticle(typeName: string): string {
  return `${/^[aeiou]/i.test(typeName) ? 'an' : 'a'} ${code(typeName)}`;
}

function capitalized(text: string): string {
  return `${text.charAt(0).toUpperCase()}${text.slice(1)}`;
}

function bitCount(n: number): string {
  return `${n} bit${n === 1 ? '' : 's'}`;
}

/**
 * The advice on GHDL's run-time checks (rangeAdvice.ts), which name a line but
 * never the object, its limit or the value. Each says what went outside what, then
 * what to do.
 */
export const rangeText = {
  indexOutside: (index: number, array: string, range: string, low: number, high: number): string =>
    `Index ${index} is outside ${code(array)}, which has indexes ${range} — an index of ${code(array)} must be from ${low} to ${high}.`,
  indexOutsideLoop: (index: number, array: string, range: string, loopVariable: string, loopLine: number): string =>
    `Index ${index} is outside ${code(array)}, which has indexes ${range} — the loop on line ${loopLine} lets ${code(loopVariable)} reach ${index}.`,
  /** The index is `to_integer` of a vector that can hold more values than the array has. */
  indexOutsideWideIndex: (index: number, array: string, range: string, indexText: string, vector: string, bits: number): string =>
    `Index ${index} is outside ${code(array)}, which has indexes ${range} — ${code(vector)} has ${bitCount(bits)}, so ${code(indexText)} can be up to ${2 ** bits - 1}.`,
  indexOutsideUnknownArray: (index: number, range: string): string =>
    `Index ${index} is outside the indexes ${range} of the array on this line.`,
  returnOutside: (fn: string, type: string, range: string): string =>
    `${code(fn)} returns a value outside ${code(type)} (${range}) — the value after ${code('return')} must stay within ${range}.`,
  stepPastLast: (type: string, attribute: string, last: string): string =>
    `${code(last)} is the last value of ${code(type)}, so ${code(`${type}'${attribute}`)} has nothing after it — test for ${code(`${type}'high`)} first and go back to the first value yourself.`,
  stepBeforeFirst: (type: string, attribute: string, first: string): string =>
    `${code(first)} is the first value of ${code(type)}, so ${code(`${type}'${attribute}`)} has nothing before it — test for ${code(`${type}'low`)} first.`,
  sliceDirection: (vector: string, range: string, direction: string, suggestion: string): string =>
    `${code(vector)} is declared ${code(range)}, so a slice of it must use ${code(direction)} too: ${code(suggestion)}.`,
  sliceOutside: (slice: string, vector: string, range: string): string =>
    `${code(slice)} reaches outside ${code(vector)}, which only has indexes ${range}.`,
  sliceMayLeave: (slice: string, vector: string, range: string, names: readonly string[], bits?: number, target?: string): string => {
    const fit = bits === undefined || target === undefined ? '' : ` and have ${bitCount(bits)}, like ${code(target)}`;
    const check = names.length === 0 ? '' : ` — check the value of ${names.map(code).join(' and ')} here`;
    return `The slice ${code(slice)} must stay inside ${code(vector)} (${range})${fit}${check}.`;
  },
  /** `fitting`: a statement that would fit, shown as the example. */
  lengthMismatch: (target: string, targetBits: number, value: string, valueBits: number, fitting?: string): string => {
    const mismatch = `${code(target)} has ${bitCount(targetBits)} but ${code(value)} has ${bitCount(valueBits)} — both sides of an assignment need the same number of bits.`;
    return fitting === undefined ? mismatch : `${mismatch} For example: ${code(fitting)}`;
  },
  lengthUnknown: (target: string, bits: number, range: string): string =>
    `${code(target)} has ${bitCount(bits)} (${range}), so the value assigned to it must have exactly ${bitCount(bits)} too.`,
  numberAbove: (value: string, target: string, low: number, high: number): string =>
    `${code(value)} went above ${high}, the top of the range of ${code(target)} (${low} to ${high}) — a range does not wrap around: set ${code(target)} back to ${low} yourself before it passes ${high}.`,
  numberBelow: (value: string, target: string, low: number, high: number): string =>
    `${code(value)} went below ${low}, the bottom of the range of ${code(target)} (${low} to ${high}) — check ${code(target)} before you subtract.`,
  naturalBelowZero: (value: string, target: string, type: string): string =>
    `${code(value)} went below 0, but ${code(target)} is ${typeWithArticle(type)} and cannot be negative — check it before you subtract.`,
  numberOutside: (value: string, target: string, range: string): string =>
    `${code(value)} gave ${code(target)} a value outside its range ${range} — keep the value within the range, or make the range wider.`,
  integerOverflow: (value: string): string =>
    `${code(value)} is too large for an ${code('integer')}, which goes up to 2147483647 — keep the number smaller, or use ${code('unsigned')} for wide values.`,
  initialOutside: (value: string, name: string, range: string): string =>
    `The start value ${code(value)} is outside the range of ${code(name)} (${range}).`,
  initialLength: (value: string, valueBits: number, name: string, bits: number, range: string): string =>
    `The start value ${code(value)} has ${bitCount(valueBits)}, but ${code(name)} has ${bitCount(bits)} (${range}) — write exactly ${bitCount(bits)}.`,
  anyBound: (): string =>
    'A value on this line is outside what its type allows — check each number against its range, and that both sides of each assignment have the same number of bits.',
  /** On the declaration the advice points at: plain words, drawn without code font. */
  declaredHere: (name: string, typeText: string): string => `${name} is declared here: ${typeText}`,
  loopHere: (variable: string, range: string): string => `This loop runs ${variable} through ${range}`,
};

/** Who needs the value: the target's name (`leds`), or `undefined` when it is not an assignment. */
function needs(target: string | undefined, type: string): string {
  return target === undefined ? `${typeWithArticle(type)} is needed here` : `${code(target)} is ${typeWithArticle(type)}`;
}

/**
 * The advice on GHDL's type errors (typeAdvice.ts): GHDL names its own types
 * (`STD_ULOGIC_VECTOR`, `UNRESOLVED_UNSIGNED`), never the conversion to write.
 */
export const typeText = {
  convert: (value: string, valueType: string, target: string | undefined, targetType: string, conversion: string): string =>
    `${code(value)} is ${typeWithArticle(valueType)}, but ${needs(target, targetType)} — convert it: ${code(conversion)}.`,
  noConversion: (value: string, valueType: string, target: string | undefined, targetType: string): string =>
    `${code(value)} is ${typeWithArticle(valueType)}, but ${needs(target, targetType)} — VHDL never converts between types by itself.`,
  bitToVector: (value: string, target: string, oneBit: string, everyBit: string): string =>
    `${code(value)} is a single bit, but ${code(target)} is a vector — assign it to one bit, ${code(oneBit)}, or to every bit, ${code(everyBit)}.`,
  vectorToBit: (value: string, target: string | undefined, oneBit: string): string =>
    `${code(value)} is a vector, but ${target === undefined ? 'a single bit is needed here' : `${code(target)} is a single bit`} — pick one bit of it, for example ${code(oneBit)}.`,
  bitInQuotes: (literal: string): string => `A single bit is written in single quotes: ${code(`'${literal}'`)}, not ${code(literal)}.`,
  notABit: (literal: string, target: string | undefined): string =>
    `${target === undefined ? 'A single bit' : code(target)} can only be ${code("'0'")} or ${code("'1'")} — ${code(literal)} is a number.`,
  numberToVector: (type: string, bits: string | undefined, conversion: string): string => {
    const written = bits === undefined ? '' : `write its bits, ${code(`"${bits}"`)}, or `;
    return `${capitalized(typeWithArticle(type))} is not a number — ${written}convert: ${code(conversion)}.`;
  },
  characterToVector: (literal: string, target: string, bits: number | undefined, written: string | undefined): string => {
    const all = bits === undefined || written === undefined ? 'write all of its bits' : `write all ${bits} bits, ${code(`"${written}"`)}`;
    return `${code(literal)} is a single bit, but ${code(target)} is a vector — ${all}, or set every bit to it with ${code(`(others => ${literal})`)}.`;
  },
  stringToBit: (literal: string, bit: string | undefined): string =>
    bit === undefined
      ? `${code(literal)} is a vector (double quotes), but a single bit is needed here.`
      : `${code(literal)} in double quotes is a vector — a single bit is written in single quotes: ${code(`'${bit}'`)}.`,
  vectorArithmetic: (name: string, type: string, operator: string, rewritten: string): string =>
    `${code(name)} is ${typeWithArticle(type)}, which has no ${code(operator)} — calculate with ${code('unsigned')}: ${code(rewritten)}.`,
  conditionAsBit: (condition: string, type: string, statement: string): string =>
    `${code(condition)} is a condition (true or false), not ${typeWithArticle(type)} — write it as ${code(statement)}.`,
  compareVectorWithNumber: (name: string, type: string, asNumber: string, asBits: string | undefined): string => {
    const bits = asBits === undefined ? '' : `, or with bits, ${code(asBits)}`;
    return `${code(name)} is ${typeWithArticle(type)}, not a number — compare it as a number, ${code(asNumber)}${bits}.`;
  },
  needsNumericType: (fn: string, argument: string, type: string, rewritten: string): string =>
    `${code(fn)} takes an ${code('unsigned')} or a ${code('signed')}, not ${typeWithArticle(type)} — say which ${code(argument)} is: ${code(rewritten)}.`,
  castNotAllowed: (valueType: string, castType: string, conversion: string): string =>
    `${capitalized(typeWithArticle(valueType))} cannot be cast to ${code(castType)} — convert it: ${code(conversion)}.`,
  notACondition: (name: string, type: string, comparison: string, oneBit: string | undefined): string => {
    const bit = oneBit === undefined ? '' : `, or test one bit: ${code(oneBit)}`;
    return `${code(name)} is ${typeWithArticle(type)}, not a condition — compare it, for example ${code(comparison)}${bit}.`;
  },
  variableWithArrow: (name: string): string => `${code(name)} is a variable: assign it with ${code(':=')}, not ${code('<=')}.`,
  signalWithColon: (name: string): string =>
    `${code(name)} is a signal: assign it with ${code('<=')} — ${code(':=')} is only for variables.`,
  portWidth: (actual: string, actualBits: number, port: string, entity: string, portBits: number, slice: string | undefined): string => {
    const fix = slice === undefined ? `connect ${bitCount(portBits)}` : `connect ${bitCount(portBits)}, for example ${code(slice)}`;
    return `${code(actual)} has ${bitCount(actualBits)}, but port ${code(port)} of ${code(entity)} has ${bitCount(portBits)} — ${fix}.`;
  },
};

/** Where an earlier declaration is: a line of the same file, or of `fileName`. */
export interface EarlierPlace {
  readonly line: number;
  readonly fileName?: string;
}

/**
 * HDLBoard's own warnings about the project, checked at Start. Written as the
 * compiler's message, which the console and the code window show as GHDL's.
 */
export const projectCheckText = {
  /** Two architectures of one entity with one name: the later replaces the earlier in the library. */
  duplicateArchitecture: (name: string, entity: string, earlier: EarlierPlace): string => {
    const architecture = `architecture "${name}" of "${entity}"`;
    const advice = 'give each architecture its own name.';
    return earlier.fileName === undefined
      ? `${architecture} is already defined on line ${earlier.line}, and this one replaces it – ${advice}`
      : `${architecture} is already defined in ${earlier.fileName} (line ${earlier.line}), and only one of them is used – ${advice}`;
  },
};

/** The Quick Fix button: what it will add. */
export function quickFixTitle(fix: QuickFix): string {
  switch (fix.kind) {
    case 'addUseClause':
      return `Add ${code(useClauseText(fix.pkg))}`;
    case 'insertBegin':
      return `Insert ${BEGIN}`;
    case 'replaceWithBegin':
      return `Replace with ${BEGIN}`;
    case 'replaceEntityName':
      return `Replace with ${code(fix.entity)}`;
  }
}

/** The keyboard shortcut of the Quick Fix, as VS Code has it. */
export const QUICK_FIX_SHORTCUT = 'Ctrl+.';

function inDisplayOrder(line: LineDiagnostic): LineMessage[] {
  return [...line.messages].sort(byDisplayOrder);
}

function visibleInDisplayOrder(line: LineDiagnostic): LineMessage[] {
  return inDisplayOrder(line).filter((m) => !isMuted(m));
}

/** What the student reads first about a message: the advice when there is one, else the compiler's text. */
function headlineOf(message: LineMessage): string {
  return message.advice?.headline ?? message.message;
}

function truncate(text: string): string {
  return text.length <= INLINE_MESSAGE_MAX_CHARS ? text : `${text.slice(0, INLINE_MESSAGE_MAX_CHARS - 1)}${ELLIPSIS}`;
}

function describeMessage(m: LineMessage): string {
  const details = m.details.map((d) => `${DETAIL_INDENT}${d}`);
  const headline = m.advice?.headline;
  if (headline === undefined) return [`${m.severity}: ${m.message}`, ...details].join('\n');
  const compiler = m.advice?.compiler ?? DEFAULT_COMPILER;
  return [`${m.severity}: ${headline}`, '', `${compiler}: ${m.message}`, ...details].join('\n');
}

/**
 * The tooltip: every kept message, errors first, each detail on its own indented
 * line. With advice, the headline comes first and the compiler's own sentence
 * follows after a blank line, prefixed with its name (`GHDL:`, `Icarus:`); a
 * blank line then also separates the messages.
 */
export function describeLine(line: LineDiagnostic): string {
  const hasAdvice = line.messages.some((m) => m.advice?.headline !== undefined);
  return inDisplayOrder(line).map(describeMessage).join(hasAdvice ? '\n\n' : '\n');
}

/** The note a visible message of `from` puts on `line`, the line it points at (`relatedNote`). */
export function hintNote(from: LineDiagnostic, line: number): string | undefined {
  const pointing = visibleInDisplayOrder(from).find((m) => m.advice?.relatedLine === line && m.advice.relatedNote);
  return pointing?.advice?.relatedNote;
}

/** The tooltip of `line`, which a message on `from` points at: its note, if any, then that message. */
export function describeHint(from: LineDiagnostic, line: number): string {
  const [first] = visibleInDisplayOrder(from);
  if (first === undefined) return '';
  const note = hintNote(from, line);
  const pointer = `Line ${from.line}: ${headlineOf(first)}`;
  return note === undefined ? pointer : `${note}\n\n${pointer}`;
}

/**
 * The text after the line's code: the first message (its advice headline when
 * there is one), truncated, plus how many more there are. Muted follow-ons are
 * not counted, and a line of only muted follow-ons has no inline text.
 */
export function inlineText(line: LineDiagnostic): string {
  return messageText(line, truncate);
}

/** The line's first visible message, shaped by `shape`, and how many more there are. */
function messageText(line: LineDiagnostic, shape: (headline: string) => string): string {
  const [first, ...others] = visibleInDisplayOrder(line);
  if (first === undefined) return '';
  return `${shape(headlineOf(first))}${others.length > 0 ? ` (+${others.length} more)` : ''}`;
}

/**
 * The text of a line's message drawn on rows of its own: as the inline text, but
 * whole, because it is wrapped instead of cut.
 */
export function fullMessageText(line: LineDiagnostic): string {
  return messageText(line, (headline) => headline);
}

function count(n: number, noun: string): string {
  return `${n} ${noun}${n === 1 ? '' : 's'}`;
}

function asSentence(text: string): string {
  return ENDS_A_SENTENCE.test(text) ? text : `${text}.`;
}

/** The screen-reader and status summary of one file; `''` when nothing is marked. */
export function summarize(fileName: string, lines: readonly LineDiagnostic[]): string {
  const shown = lines.filter((line) => !isMutedLine(line));
  if (shown.length === 0) return '';
  const first = [...shown].sort((a, b) => a.line - b.line)[0];
  const [message] = visibleInDisplayOrder(first);
  const fix = quickFixOf(first);
  const offer = fix ? ` Quick Fix, ${QUICK_FIX_SHORTCUT}: ${quickFixTitle(fix)}.` : '';
  return `${fileName}: ${problemCountText(countSeverities(lines))}. First on line ${first.line}: ${asSentence(headlineOf(message))}${offer} ${CLEAR_HINT}`;
}

/** "2 errors, 1 warning" — the counts a file's problem mark stands for; `''` for none. */
export function problemCountText({ errors, warnings }: { errors: number; warnings: number }): string {
  return [errors > 0 && count(errors, 'error'), warnings > 0 && count(warnings, 'warning')].filter(Boolean).join(', ');
}
