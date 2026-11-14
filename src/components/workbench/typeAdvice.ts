// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * Advice on GHDL's type errors: a value of one type where another is needed. GHDL
 * names its own types (`can't match "count" with type array type
 * "STD_ULOGIC_VECTOR"`), reports a condition assigned to a `std_logic` as `no
 * function declarations for operator "="`, and never says which conversion to
 * write. The advice names the student's own types and shows the conversion.
 * Measured on GHDL 6.0.0 (docs/editor_diagnostics_range_and_type_advice.md). Pure.
 */

import type { Advice, Span } from './diagnosticAdvice';
import { typeText } from './diagnosticText';
import type { CheckedFile } from './rangeAdvice';
import { boundsOf, lengthOf, type DeclaredRange, type ObjectType } from './vhdlDeclarations';
import { assignmentOn, codeShape, namedParts, widthOf, type Assignment } from './vhdlExpression';
import { tokenizeVhdlLine, type Token } from './vhdlHighlight';

/** A port of an entity elsewhere in the project, for a port map's widths. */
export interface DeclaredPort {
  readonly bits?: number;
}

export type PortLookup = (entity: string, port: string) => DeclaredPort | undefined;

/** A GHDL type error at a column, in a file of the project. */
export interface TypeErrorPlace extends CheckedFile {
  readonly message: string;
  /** 1-based. */
  readonly line: number;
  readonly text: string;
  /** The character GHDL's column points at. */
  readonly caret: number;
  readonly ports: PortLookup;
}

type TypeRule = (place: TypeErrorPlace) => Advice | undefined;

// ------------------------------------------------------------ families of types

/** The types a beginner meets, grouped by what converts to what. */
type Family = 'logicVector' | 'unsigned' | 'signed' | 'integer' | 'logic' | 'bit' | 'bitVector' | 'boolean' | 'other';

const FAMILY_OF_NAME: Readonly<Record<string, Family>> = {
  std_logic_vector: 'logicVector',
  std_ulogic_vector: 'logicVector',
  unsigned: 'unsigned',
  unresolved_unsigned: 'unsigned',
  signed: 'signed',
  unresolved_signed: 'signed',
  integer: 'integer',
  natural: 'integer',
  positive: 'integer',
  std_logic: 'logic',
  std_ulogic: 'logic',
  bit: 'bit',
  bit_vector: 'bitVector',
  boolean: 'boolean',
};

/** How the advice names a family when the student's own name for the type is not known. */
const FAMILY_NAME: Readonly<Record<Family, string>> = {
  logicVector: 'std_logic_vector',
  unsigned: 'unsigned',
  signed: 'signed',
  integer: 'integer',
  logic: 'std_logic',
  bit: 'bit',
  bitVector: 'bit_vector',
  boolean: 'boolean',
  other: 'other type',
};

const VECTOR_FAMILIES: ReadonlySet<Family> = new Set(['logicVector', 'unsigned', 'signed', 'bitVector']);
const ONE_BIT_FAMILIES: ReadonlySet<Family> = new Set(['logic', 'bit']);

/** A type as the advice talks about it: its family and the name the student wrote. */
interface KnownType {
  readonly family: Family;
  readonly name: string;
  readonly range?: DeclaredRange;
}

function familyOfName(name: string): Family {
  return FAMILY_OF_NAME[name.toLowerCase()] ?? 'other';
}

function knownType(type: ObjectType | undefined): KnownType | undefined {
  if (type === undefined || type.kind === 'enumeration') return undefined;
  if (type.kind === 'number') return { family: 'integer', name: type.name, range: type.range };
  const family = familyOfName(type.name);
  if (type.kind === 'vector') return { family: family === 'other' ? 'logicVector' : family, name: type.name, range: type.range };
  return family === 'other' ? undefined : { family, name: type.name };
}

/** GHDL's name of the type it wanted: `array type "STD_ULOGIC_VECTOR"`, `enumeration subtype "STD_LOGIC"`, `integer`. */
function ghdlType(text: string): KnownType {
  const name = /"(?<name>[^"]+)"/.exec(text)?.groups?.name ?? text;
  const family = familyOfName(name);
  return { family, name: family === 'other' ? name.toLowerCase() : FAMILY_NAME[family] };
}

function typeOfName(name: string, place: TypeErrorPlace): KnownType | undefined {
  return /^\w+$/.test(name) ? knownType(place.declarations.typeAt(name, place.line)) : undefined;
}

// ------------------------------------------------------------ conversions

type Conversion = (value: string, width: string) => string;

const CONVERSIONS: Readonly<Record<string, Conversion | undefined>> = {
  'integer>logicVector': (v, w) => `std_logic_vector(to_unsigned(${v}, ${w}))`,
  'integer>unsigned': (v, w) => `to_unsigned(${v}, ${w})`,
  'integer>signed': (v, w) => `to_signed(${v}, ${w})`,
  'logicVector>integer': (v) => `to_integer(unsigned(${v}))`,
  'unsigned>integer': (v) => `to_integer(${v})`,
  'signed>integer': (v) => `to_integer(${v})`,
  'logicVector>unsigned': (v) => `unsigned(${v})`,
  'logicVector>signed': (v) => `signed(${v})`,
  'unsigned>logicVector': (v) => `std_logic_vector(${v})`,
  'signed>logicVector': (v) => `std_logic_vector(${v})`,
  'unsigned>signed': (v) => `signed(${v})`,
  'signed>unsigned': (v) => `unsigned(${v})`,
  'logic>bit': (v) => `to_bit(${v})`,
  'bit>logic': (v) => `to_stdulogic(${v})`,
  'bitVector>logicVector': (v) => `to_stdlogicvector(${v})`,
  'logicVector>bitVector': (v) => `to_bitvector(${v})`,
  'logic>boolean': (v) => `${v} = '1'`,
  'logic>integer': (v) => `1 when ${v} = '1' else 0`,
  'boolean>logic': (v) => `'1' when ${v} else '0'`,
};

function conversionBetween(from: Family, to: Family): Conversion | undefined {
  return CONVERSIONS[`${from}>${to}`];
}

/** Stands for the width in a conversion when no target says it: the student fills it in. */
const UNKNOWN_WIDTH = 'number_of_bits';

/** The width a conversion to the target needs: its number of bits, else `target'length`, else a name to replace. */
function widthText(assignment: Assignment | undefined, place: TypeErrorPlace): string {
  if (assignment === undefined) return UNKNOWN_WIDTH;
  const bits = widthOf(assignment.target.text, place.line, place.declarations);
  return bits === undefined ? `${assignment.targetName}'length` : String(bits);
}

/** The lowest index of a vector, for advice that picks one bit of it. */
function lowIndex(type: KnownType): number {
  return boundsOf(type.range)?.low ?? 0;
}

/** `5` in `bits` bits, `"00000101"`; undefined when it does not fit. */
function bitsOf(value: number, bits: number | undefined): string | undefined {
  if (bits === undefined || value < 0 || value >= 2 ** bits) return undefined;
  return value.toString(2).padStart(bits, '0');
}

/** The assignment on the line, when GHDL's caret is in its value: then its target is what needs the type. */
function assignmentAround(place: TypeErrorPlace): Assignment | undefined {
  const assignment = assignmentOn(place.text);
  const inValue = assignment !== undefined && assignment.value.start <= place.caret && place.caret < assignment.value.end;
  return inValue ? assignment : undefined;
}

// ------------------------------------------------------------ the caret's token

interface PlacedToken {
  readonly text: string;
  readonly type: Token['type'];
  readonly start: number;
  readonly end: number;
}

function tokensOf(text: string): PlacedToken[] {
  const placed: PlacedToken[] = [];
  let start = 0;
  for (const { text: token, type } of tokenizeVhdlLine(text)) {
    if (type !== 'whitespace') placed.push({ text: token, type, start, end: start + token.length });
    start += token.length;
  }
  return placed;
}

function tokenAt(tokens: readonly PlacedToken[], index: number): number {
  return tokens.findIndex((token) => token.start <= index && index < token.end);
}

function spanOf(token: { readonly start: number; readonly end: number }): Span {
  return { start: token.start, end: token.end };
}

// ------------------------------------------------------------ can't match

const CANT_MATCH =
  /^can't match (?:"(?<name>[^"]+)"|(?<literal>integer literal|character literal|string literal)(?: '.')?) with type (?<type>.+)$/;

/** A single bit assigned to a vector: one bit of it, or every bit. */
function bitToVector(value: string, wanted: KnownType, assignment: Assignment): Advice {
  const { target, operator } = assignment;
  const oneBit = `${target.text}(${lowIndex(wanted)}) ${operator} ${value};`;
  return { headline: typeText.bitToVector(value, target.text, oneBit, `${target.text} ${operator} (others => ${value});`) };
}

/** A one-bit value where a vector is needed, or the other way round. */
function bitWidthAdvice(value: string, from: KnownType, wanted: KnownType, assignment: Assignment | undefined): Advice | undefined {
  if (ONE_BIT_FAMILIES.has(from.family) && VECTOR_FAMILIES.has(wanted.family)) {
    return assignment === undefined ? undefined : bitToVector(value, wanted, assignment);
  }
  if (VECTOR_FAMILIES.has(from.family) && ONE_BIT_FAMILIES.has(wanted.family)) {
    return { headline: typeText.vectorToBit(value, assignment?.target.text, `${value}(${lowIndex(from)})`) };
  }
  return undefined;
}

function nameAdvice(name: string, wanted: KnownType, place: TypeErrorPlace): Advice | undefined {
  const from = typeOfName(name, place);
  if (from === undefined || from.family === wanted.family) return undefined;
  const assignment = assignmentAround(place);
  const target = assignment?.target.text;
  const targetType = typeOfName(assignment?.targetName ?? '', place);
  const shown = targetType?.family === wanted.family ? targetType : wanted;
  const width = bitWidthAdvice(name, from, shown, assignment);
  if (width !== undefined) return width;
  const conversion = conversionBetween(from.family, wanted.family);
  const widthArgument = widthText(assignment, place);
  if (conversion === undefined) return { headline: typeText.noConversion(name, from.name, target, shown.name) };
  return { headline: typeText.convert(name, from.name, target, shown.name, conversion(name, widthArgument)) };
}

function integerLiteralAdvice(literal: string, wanted: KnownType, place: TypeErrorPlace): Advice | undefined {
  const assignment = assignmentAround(place);
  if (ONE_BIT_FAMILIES.has(wanted.family)) {
    return { headline: /^[01]$/.test(literal) ? typeText.bitInQuotes(literal) : typeText.notABit(literal, assignment?.target.text) };
  }
  const conversion = conversionBetween('integer', wanted.family);
  if (conversion === undefined) return undefined;
  const bits = assignment && widthOf(assignment.target.text, place.line, place.declarations);
  const width = widthText(assignment, place);
  const written = bitsOf(Number(literal), bits);
  const targetType = typeOfName(assignment?.targetName ?? '', place);
  return { headline: typeText.numberToVector(targetType?.name ?? wanted.name, written, conversion(literal, width)) };
}

function characterLiteralAdvice(literal: string, wanted: KnownType, place: TypeErrorPlace): Advice | undefined {
  const assignment = assignmentAround(place);
  if (!VECTOR_FAMILIES.has(wanted.family) || assignment === undefined) return undefined;
  const bits = widthOf(assignment.target.text, place.line, place.declarations);
  const bit = literal.slice(1, -1);
  const written = bits === undefined || !/^[01]$/.test(bit) ? undefined : `${'0'.repeat(bits - 1)}${bit}`;
  return { headline: typeText.characterToVector(literal, assignment.target.text, bits, written) };
}

function stringLiteralAdvice(literal: string, wanted: KnownType): Advice | undefined {
  if (!ONE_BIT_FAMILIES.has(wanted.family)) return undefined;
  const single = /^"(?<bit>.)"$/.exec(literal)?.groups?.bit;
  return { headline: typeText.stringToBit(literal, single) };
}

const cantMatch: TypeRule = (place) => {
  const found = CANT_MATCH.exec(place.message)?.groups;
  if (found === undefined) return undefined;
  const wanted = ghdlType(found.type);
  if (found.name !== undefined) return nameAdvice(found.name, wanted, place);
  const tokens = tokensOf(place.text);
  const literal = tokens[tokenAt(tokens, place.caret)]?.text;
  if (literal === undefined) return undefined;
  if (found.literal === 'integer literal') return integerLiteralAdvice(literal, wanted, place);
  if (found.literal === 'character literal') return characterLiteralAdvice(literal, wanted, place);
  return stringLiteralAdvice(literal, wanted);
};

// ------------------------------------------------------------ operators

const NO_OPERATOR = /^no function declarations for operator "(?<operator>[^"]+)"$/;
const ARITHMETIC: ReadonlySet<string> = new Set(['+', '-', '*', '/']);
const RELATIONAL: ReadonlySet<string> = new Set(['=', '/=', '<', '<=', '>', '>=']);
const OPERAND_TYPES: ReadonlySet<Token['type']> = new Set(['identifier', 'type', 'number', 'string']);

/** The operator at GHDL's caret and the single tokens either side of it: `sw + 1`. */
function operandsAt(place: TypeErrorPlace): { readonly left: PlacedToken; readonly right: PlacedToken } | undefined {
  const tokens = tokensOf(place.text);
  const at = tokenAt(tokens, place.caret);
  const left = tokens[at - 1];
  const right = tokens[at + 1];
  if (left === undefined || right === undefined || !OPERAND_TYPES.has(left.type) || !OPERAND_TYPES.has(right.type)) return undefined;
  return { left, right };
}

const LOGIC_VECTOR_FAMILIES: ReadonlySet<Family> = new Set(['logicVector', 'bitVector']);

function vectorArithmetic(operator: string, place: TypeErrorPlace): Advice | undefined {
  const operands = operandsAt(place);
  if (operands === undefined) return undefined;
  const { left, right } = operands;
  const vector = [left, right].find((token) => LOGIC_VECTOR_FAMILIES.has(typeOfName(token.text, place)?.family ?? 'other'));
  if (vector === undefined) return undefined;
  const asUnsigned = (token: PlacedToken) => (token === vector ? `unsigned(${token.text})` : token.text);
  const expression = `${asUnsigned(left)} ${operator} ${asUnsigned(right)}`;
  const targetFamily = typeOfName(assignmentAround(place)?.targetName ?? '', place)?.family;
  const rewritten = targetFamily === 'unsigned' ? expression : `std_logic_vector(${expression})`;
  const type = typeOfName(vector.text, place)?.name ?? FAMILY_NAME.logicVector;
  return { headline: typeText.vectorArithmetic(vector.text, type, operator, rewritten), span: { start: left.start, end: right.end } };
}

/** `led <= (a = b);`: a condition where a `std_logic` is needed. */
function conditionAsBit(operator: string, place: TypeErrorPlace): Advice | undefined {
  const assignment = assignmentAround(place);
  const operands = operandsAt(place);
  const target = typeOfName(assignment?.targetName ?? '', place);
  if (assignment === undefined || operands === undefined || target?.family !== 'logic') return undefined;
  const condition = `${operands.left.text} ${operator} ${operands.right.text}`;
  const statement = `${assignment.target.text} ${assignment.operator} '1' when ${condition} else '0';`;
  return { headline: typeText.conditionAsBit(condition, target.name, statement), span: { start: operands.left.start, end: operands.right.end } };
}

/** `sw = 5`: a vector compared with a number. */
function vectorWithNumber(operator: string, place: TypeErrorPlace): Advice | undefined {
  const operands = operandsAt(place);
  if (operands === undefined) return undefined;
  const [vector, number] = operands.left.type === 'number' ? [operands.right, operands.left] : [operands.left, operands.right];
  const type = typeOfName(vector.text, place);
  if (number.type !== 'number' || type === undefined || !VECTOR_FAMILIES.has(type.family)) return undefined;
  const asNumber = `${type.family === 'logicVector' ? `unsigned(${vector.text})` : vector.text} ${operator} ${number.text}`;
  const bits = bitsOf(Number(number.text), lengthOf(type.range));
  const asBits = bits === undefined ? undefined : `${vector.text} ${operator} "${bits}"`;
  const span = { start: Math.min(vector.start, number.start), end: Math.max(vector.end, number.end) };
  return { headline: typeText.compareVectorWithNumber(vector.text, type.name, asNumber, asBits), span };
}

const noOperator: TypeRule = (place) => {
  const operator = NO_OPERATOR.exec(place.message)?.groups?.operator;
  if (operator === undefined) return undefined;
  if (ARITHMETIC.has(operator)) return vectorArithmetic(operator, place);
  if (RELATIONAL.has(operator)) return conditionAsBit(operator, place) ?? vectorWithNumber(operator, place);
  return undefined;
};

// ------------------------------------------------------------ calls and casts

const NO_OVERLOAD = /^no overloaded function found matching "(?<fn>\w+)"$/;
const CLOSELY_RELATED = 'conversion allowed only between closely related types';

/** The `name(…)` whose name or `(` GHDL's caret is on, with its one argument's type. */
function callAt(place: TypeErrorPlace, name?: string): { readonly name: string; readonly argument: string; readonly span: Span } | undefined {
  const part = namedParts(place.text).find(
    (p) => p.name.start <= place.caret && place.caret <= p.inside.start && (name === undefined || p.name.text.toLowerCase() === name),
  );
  return part && { name: part.name.text, argument: part.inside.text, span: spanOf(part.whole) };
}

const TO_INTEGER = 'to_integer';

const noOverload: TypeRule = (place) => {
  const fn = NO_OVERLOAD.exec(place.message)?.groups?.fn.toLowerCase();
  const call = fn === TO_INTEGER ? callAt(place, TO_INTEGER) : undefined;
  const type = call && typeOfName(call.argument, place);
  if (call === undefined || type === undefined || !LOGIC_VECTOR_FAMILIES.has(type.family)) return undefined;
  return { headline: typeText.needsNumericType(call.name, call.argument, type.name, `${call.name}(unsigned(${call.argument}))`), span: call.span };
};

const castNotAllowed: TypeRule = (place) => {
  const call = place.message === CLOSELY_RELATED ? callAt(place) : undefined;
  const from = call && typeOfName(call.argument, place);
  if (call === undefined || from === undefined) return undefined;
  const castFamily = familyOfName(call.name);
  const conversion = conversionBetween(from.family, castFamily);
  const width = widthText(assignmentAround(place), place);
  if (conversion === undefined) return undefined;
  return { headline: typeText.castNotAllowed(from.name, call.name, conversion(call.argument, width)), span: call.span };
};

// ------------------------------------------------------------ conditions and assignments

const NOT_BOOLEAN = /^cannot convert expression to boolean/;
const CONDITION = /\b(?:if|elsif|while|when|until)\s+(?<condition>.+?)\s*(?:\bthen\b|\bloop\b|\belse\b|;|$)/i;

const notACondition: TypeRule = (place) => {
  if (!NOT_BOOLEAN.test(place.message)) return undefined;
  const condition = CONDITION.exec(codeShape(place.text))?.groups?.condition;
  const type = condition === undefined ? undefined : typeOfName(condition, place);
  if (condition === undefined || type === undefined) return undefined;
  const bits = lengthOf(type.range);
  const start = place.text.indexOf(condition);
  const advice = (comparison: string, oneBit?: string): Advice => ({
    headline: typeText.notACondition(condition, type.name, comparison, oneBit),
    ...(start >= 0 && { span: { start, end: start + condition.length } }),
  });
  if (type.family === 'integer') return advice(`if ${condition} /= 0 then`);
  if (!VECTOR_FAMILIES.has(type.family)) return undefined;
  const zeros = bits === undefined ? `(others => '0')` : `"${'0'.repeat(bits)}"`;
  return advice(`if ${condition} /= ${zeros} then`, `if ${condition}(${lowIndex(type)}) = '1' then`);
};

const VARIABLE_TARGET = /^target \(variable "(?<name>\w+)"\) is not a signal$/;
const SIGNAL_TARGET = /^signal "(?<name>\w+)" is not a variable to be assigned$/;
const COLON_EQUALS_OUTSIDE_PROCESS = /^':=' not allowed in concurrent statement/;

const wrongAssignment: TypeRule = (place) => {
  const variable = VARIABLE_TARGET.exec(place.message)?.groups?.name;
  if (variable !== undefined) return { headline: typeText.variableWithArrow(variable) };
  const signal = SIGNAL_TARGET.exec(place.message)?.groups?.name;
  if (signal !== undefined) return { headline: typeText.signalWithColon(signal) };
  const target = COLON_EQUALS_OUTSIDE_PROCESS.test(place.message) ? assignmentOn(place.text)?.targetName : undefined;
  return target === undefined ? undefined : { headline: typeText.signalWithColon(target) };
};

// ------------------------------------------------------------ port maps

const PORT_CONSTRAINTS = "actual constraints don't match formal ones";
const INSTANCE = /\b\w+\s*:\s*(?:entity\s+\w+\.)?(?<entity>\w+)(?:\s*\(\w+\))?\s*(?:generic|port)\s+map\b/i;
/** Instances whose `port map` spreads over more lines than this are not looked up. */
const MAX_INSTANCE_LINES = 20;

function instanceEntity(place: TypeErrorPlace): string | undefined {
  for (let line = place.line; line >= Math.max(1, place.line - MAX_INSTANCE_LINES); line--) {
    const entity = INSTANCE.exec(codeShape(place.lines[line - 1]))?.groups?.entity;
    if (entity !== undefined) return entity;
  }
  return undefined;
}

/** The low bits of `actual`, as many as the port has, when it is a `downto` vector. */
function fittingSlice(actual: string, bits: number, place: TypeErrorPlace): string | undefined {
  const type = place.declarations.typeAt(actual, place.line);
  const range = type?.kind === 'vector' ? type.range : undefined;
  if (range?.direction !== 'downto' || range.right === undefined) return undefined;
  return `${actual}(${range.right + bits - 1} downto ${range.right})`;
}

const portWidth: TypeRule = (place) => {
  if (place.message !== PORT_CONSTRAINTS) return undefined;
  const formal = /(?<formal>\w+)\s*=>\s*$/.exec(place.text.slice(0, place.caret))?.groups?.formal;
  const actual = /^\w+/.exec(place.text.slice(place.caret))?.[0];
  const entity = instanceEntity(place);
  if (formal === undefined || actual === undefined || entity === undefined) return undefined;
  const portBits = place.ports(entity, formal)?.bits;
  const actualBits = widthOf(actual, place.line, place.declarations);
  if (portBits === undefined || actualBits === undefined || portBits === actualBits) return undefined;
  const slice = actualBits > portBits ? fittingSlice(actual, portBits, place) : undefined;
  return { headline: typeText.portWidth(actual, actualBits, formal, entity, portBits, slice) };
};

// ------------------------------------------------------------ public

const RULES: readonly TypeRule[] = [cantMatch, noOperator, noOverload, castNotAllowed, notACondition, wrongAssignment, portWidth];

export function adviseTypeError(place: TypeErrorPlace): Advice | undefined {
  for (const rule of RULES) {
    const advice = rule(place);
    if (advice !== undefined) return advice;
  }
  return undefined;
}
