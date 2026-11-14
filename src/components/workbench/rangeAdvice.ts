// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * Advice on GHDL's range checks. At run time GHDL says only `bound check
 * failure`, `index (4) out of bounds (3 downto 0)` or `overflow detected`, and a
 * line: never which object, which limit, or what to do. Analysis says `out of
 * bound expression` and `string length does not match that of anonymous integer
 * subtype`. The advice is read from the failing line and the declarations it
 * uses (vhdlDeclarations.ts), and points at the declaration that sets the limit.
 * Measured on GHDL 6.0.0 (docs/editor_diagnostics_range_and_type_advice.md). Pure.
 */

import type { Advice, Span } from './diagnosticAdvice';
import { rangeText } from './diagnosticText';
import {
  boundsOf,
  INTEGER_HIGH,
  lengthOf,
  type DeclaredObject,
  type DeclaredRange,
  type Direction,
  type VhdlDeclarations,
} from './vhdlDeclarations';
import {
  assignmentOn,
  codeShape,
  isRangeText,
  namedParts,
  namesIn,
  returnValueOn,
  widthOf,
  splitTopLevel,
  withoutOuterParentheses,
  type Assignment,
  type NamedPart,
  type Piece,
} from './vhdlExpression';

/** The file a check failed in, read once for all its errors. */
export interface CheckedFile {
  readonly lines: readonly string[];
  readonly declarations: VhdlDeclarations;
}

/** One failed check: GHDL's message and its 1-based line, in the file. */
interface FailedCheck extends CheckedFile {
  readonly message: string;
  readonly line: number;
  /** The text of `line`. */
  readonly text: string;
}

type CheckRule = (check: FailedCheck) => Advice | undefined;

const INDEX_OUT_OF_BOUNDS =
  /^index \((?<index>-?\d+)\) out of bounds \((?<left>-?\d+) (?<direction>to|downto) (?<right>-?\d+)\)$/;
const BOUND_CHECK = /^(?:bound check failure|overflow detected)$/;
const OVERFLOW = 'overflow detected';
const INITIAL_OUT_OF_RANGE = /^out of bound expression$/;
/** Analysis of `word(0 to 3)` when `word` is `7 downto 0`. */
const SLICE_DIRECTION = /^direction of the range mismatch$/;
const STRING_LENGTH = /^string length does not match /;

function spanOf(piece: Piece): Span {
  return { start: piece.start, end: piece.end };
}

/** The note on the declaration that sets the limit, when it is not the failing line itself. */
function declarationHint(object: DeclaredObject | undefined, check: FailedCheck): Partial<Advice> {
  if (object === undefined || object.line === check.line) return {};
  return { relatedLine: object.line, relatedNote: rangeText.declaredHere(object.name, object.typeText) };
}

function vectorRange(check: FailedCheck, name: string): DeclaredRange | undefined {
  const type = check.declarations.typeAt(name, check.line);
  return type?.kind === 'vector' ? type.range : undefined;
}

// ------------------------------------------------------------ indexes

function sameRange(a: DeclaredRange | undefined, b: DeclaredRange): boolean {
  return a !== undefined && a.left === b.left && a.right === b.right && a.direction === b.direction;
}

/** `bits(index_value)` on the line whose array has exactly GHDL's range. */
function indexedPart(check: FailedCheck, range: DeclaredRange): NamedPart | undefined {
  const indexes = namedParts(check.text).filter((part) => !isRangeText(part.inside.text));
  return indexes.find((part) => sameRange(vectorRange(check, part.name.text), range));
}

const TO_INTEGER_OF_NAME = /^to_integer\s*\(\s*(?<vector>\w+)\s*\)$/i;

/** `to_integer(addr)` of an unsigned with more values than the array has indexes: its width is the cause. */
function wideIndexVector(index: string, check: FailedCheck, range: DeclaredRange): { readonly vector: string; readonly bits: number } | undefined {
  const vector = TO_INTEGER_OF_NAME.exec(index)?.groups?.vector;
  const type = vector === undefined ? undefined : check.declarations.typeAt(vector, check.line);
  const bits = type?.kind === 'vector' ? lengthOf(type.range) : undefined;
  const high = boundsOf(range)?.high;
  if (vector === undefined || bits === undefined || high === undefined || 2 ** bits - 1 <= high) return undefined;
  return { vector, bits };
}

/** The loop variable an index is, when it is one: then the loop's range is the cause. */
function loopVariable(index: string, check: FailedCheck): DeclaredObject | undefined {
  const object = /^\w+$/.test(index) ? check.declarations.objectAt(index, check.line) : undefined;
  return object?.objectClass === 'loop' && object.line !== check.line ? object : undefined;
}

const indexOutOfBounds: CheckRule = (check) => {
  const found = INDEX_OUT_OF_BOUNDS.exec(check.message)?.groups;
  if (found === undefined) return undefined;
  const index = Number(found.index);
  const direction = found.direction as Direction;
  const range: DeclaredRange = { text: `${found.left} ${direction} ${found.right}`, direction, left: Number(found.left), right: Number(found.right) };
  const part = indexedPart(check, range);
  if (part === undefined) return { headline: rangeText.indexOutsideUnknownArray(index, range.text) };
  const array = part.name.text;
  const loop = loopVariable(part.inside.text, check);
  if (loop !== undefined) {
    const headline = rangeText.indexOutsideLoop(index, array, range.text, loop.name, loop.line);
    return { headline, span: spanOf(part.whole), relatedLine: loop.line, relatedNote: rangeText.loopHere(loop.name, loop.typeText) };
  }
  const hint = declarationHint(check.declarations.objectAt(array, check.line), check);
  const wide = wideIndexVector(part.inside.text, check, range);
  if (wide !== undefined) {
    const headline = rangeText.indexOutsideWideIndex(index, array, range.text, part.inside.text, wide.vector, wide.bits);
    return { headline, span: spanOf(part.whole), ...hint };
  }
  const bounds = boundsOf(range) ?? { low: index, high: index };
  return { headline: rangeText.indexOutside(index, array, range.text, bounds.low, bounds.high), span: spanOf(part.whole), ...hint };
};

// ------------------------------------------------------------ return values and enumerations

const FUNCTION_HEADER = /\b(?<kind>function|procedure)\s+(?<name>\w+)/i;
const RETURN_TYPE = /\breturn\s+(?<type>\w+(?:\s+range\s+[\s\S]+?)?)\s+is\b/i;

/** The function a `return` on `check.line` is in, and the type it returns. */
function enclosingFunction(check: FailedCheck): { readonly name: string; readonly returnType: string } | undefined {
  for (let line = check.line; line >= 1; line--) {
    const header = FUNCTION_HEADER.exec(codeShape(check.lines[line - 1]))?.groups;
    if (header === undefined) continue;
    if (header.kind.toLowerCase() === 'procedure') return undefined;
    const text = check.lines.slice(line - 1, check.line).map(codeShape).join('\n');
    const returnType = RETURN_TYPE.exec(text)?.groups?.type;
    return returnType === undefined ? undefined : { name: header.name, returnType };
  }
  return undefined;
}

const returnOutOfRange: CheckRule = (check) => {
  const value = returnValueOn(check.text);
  const fn = value && enclosingFunction(check);
  if (value === undefined || fn === undefined) return undefined;
  const type = check.declarations.typeOf(fn.returnType, check.line);
  if (type?.kind !== 'number' || type.range === undefined) return undefined;
  return { headline: rangeText.returnOutside(fn.name, type.name, type.range.text), span: spanOf(value) };
};

const ENUMERATION_STEP = /\b(?<type>\w+)'(?<attribute>succ|pred)\b/i;

/** `state_t'succ(s)` on the last value: there is no next one. */
const enumerationStep: CheckRule = (check) => {
  const match = ENUMERATION_STEP.exec(codeShape(check.text));
  if (!match?.groups) return undefined;
  const { type: typeName, attribute } = match.groups;
  const type = check.declarations.typeOf(typeName, check.line);
  if (type?.kind !== 'enumeration' || type.literals.length === 0) return undefined;
  const span = { start: match.index, end: match.index + match[0].length };
  const isSucc = attribute.toLowerCase() === 'succ';
  const headline = isSucc
    ? rangeText.stepPastLast(typeName, attribute, type.literals[type.literals.length - 1])
    : rangeText.stepBeforeFirst(typeName, attribute, type.literals[0]);
  return { headline, span };
};

// ------------------------------------------------------------ slices

const RANGE_ENDS = /^(?<left>.+?)\s+(?:to|downto)\s+(?<right>.+)$/is;

/** `v(0 to hi)` of a `downto` vector, written the way it is declared: `v(hi downto 0)`. */
function turnedAround(part: NamedPart, direction: Direction): string {
  const ends = RANGE_ENDS.exec(part.inside.text)?.groups;
  return ends === undefined ? part.whole.text : `${part.name.text}(${ends.right} ${direction} ${ends.left})`;
}

function isOutside(slice: DeclaredRange, declared: DeclaredRange): boolean | undefined {
  const inner = boundsOf(slice);
  const outer = boundsOf(declared);
  if (inner === undefined || outer === undefined) return undefined;
  return inner.low < outer.low || inner.high > outer.high;
}

/** The names in a slice's ends that change while the design runs (not constants). */
function changingNames(text: string, check: FailedCheck): string[] {
  const changes = (name: string) => {
    const objectClass = check.declarations.objectAt(name, check.line)?.objectClass;
    return objectClass !== undefined && objectClass !== 'constant' && objectClass !== 'generic';
  };
  return namesIn(text).filter(changes);
}

/**
 * How many bits the assignment's target needs, when the slice is its whole value:
 * a slice that is only part of the value (`a(i downto i - 3) & b`) need not have them.
 */
function bitsWanted(part: NamedPart, check: FailedCheck): { readonly bits?: number; readonly target?: string } {
  const assignment = assignmentOn(check.text);
  const isWholeValue = assignment?.value.start === part.whole.start && assignment.value.end === part.whole.end;
  if (assignment === undefined || !isWholeValue) return {};
  return { bits: widthOf(assignment.target.text, check.line, check.declarations), target: assignment.target.text };
}

/**
 * What a slice on the failing line may have done: certainly failed (the wrong
 * direction, or static ends outside its vector), or may have left its vector
 * (ends that change). A slice certainly inside its vector has no verdict.
 */
type SliceVerdict =
  | { readonly kind: 'failed'; readonly advice: Advice }
  | { readonly kind: 'mayLeave'; readonly advice: Advice; readonly part: NamedPart; readonly range: string; readonly names: readonly string[] };

function sliceVerdict(part: NamedPart, check: FailedCheck): SliceVerdict | undefined {
  const vector = part.name.text;
  const declared = vectorRange(check, vector);
  const slice = check.declarations.rangeOf(part.inside.text, check.line);
  if (declared === undefined || slice === undefined) return undefined;
  const advice = (headline: string): Advice => ({
    headline,
    span: spanOf(part.whole),
    ...declarationHint(check.declarations.objectAt(vector, check.line), check),
  });
  if (slice.direction !== declared.direction) {
    const turned = turnedAround(part, declared.direction);
    return { kind: 'failed', advice: advice(rangeText.sliceDirection(vector, declared.text, declared.direction, turned)) };
  }
  const outside = isOutside(slice, declared);
  if (outside !== undefined) {
    return outside ? { kind: 'failed', advice: advice(rangeText.sliceOutside(part.whole.text, vector, declared.text)) } : undefined;
  }
  const names = changingNames(part.inside.text, check);
  const { bits, target } = bitsWanted(part, check);
  const headline = rangeText.sliceMayLeave(part.whole.text, vector, declared.text, names, bits, target);
  return { kind: 'mayLeave', advice: advice(headline), part, range: declared.text, names };
}

/** The verdicts of the slices on the failing line, in order. */
function sliceVerdicts(check: FailedCheck): SliceVerdict[] {
  const slices = namedParts(check.text).filter((p) => isRangeText(p.inside.text));
  return slices.flatMap((part) => sliceVerdict(part, check) ?? []);
}

const sliceOutOfRange: CheckRule = (check) => sliceVerdicts(check)[0]?.advice;

// ------------------------------------------------------------ lengths

const RESIZABLE_TYPES: ReadonlySet<string> = new Set(['unsigned', 'signed']);

/** A statement that would fit, for the advice to show: the low bits of a wider vector, or `resize`. */
function fittingStatement(assignment: Assignment, targetBits: number, valueBits: number, check: FailedCheck): string | undefined {
  const { target, operator, value } = assignment;
  const type = check.declarations.typeAt(assignment.targetName, check.line);
  const range = /^\w+$/.test(value.text) ? vectorRange(check, value.text) : undefined;
  if (valueBits > targetBits && range?.direction === 'downto' && range.right !== undefined) {
    return `${target.text} ${operator} ${value.text}(${range.right + targetBits - 1} downto ${range.right});`;
  }
  if (type?.kind === 'vector' && RESIZABLE_TYPES.has(type.name.toLowerCase())) {
    return `${target.text} ${operator} resize(${withoutOuterParentheses(value.text)}, ${targetBits});`;
  }
  return undefined;
}

/** A whole vector or a slice of one: a target an assignment must fill bit for bit. */
function vectorTargetRange(assignment: Assignment, check: FailedCheck): string | undefined {
  const [part] = namedParts(assignment.target.text);
  if (part !== undefined && isRangeText(part.inside.text)) return part.inside.text;
  if (assignment.target.text !== assignment.targetName) return undefined;
  return vectorRange(check, assignment.targetName)?.text;
}

/** An assignment to a vector, with the bits its target has and its value has (when known). */
interface VectorAssignment {
  readonly assignment: Assignment;
  readonly range: string;
  readonly targetBits: number;
  readonly valueBits?: number;
}

function vectorAssignmentOn(check: FailedCheck): VectorAssignment | undefined {
  const assignment = assignmentOn(check.text);
  const range = assignment && vectorTargetRange(assignment, check);
  const targetBits = assignment && widthOf(assignment.target.text, check.line, check.declarations);
  if (assignment === undefined || range === undefined || targetBits === undefined) return undefined;
  return { assignment, range, targetBits, valueBits: widthOf(assignment.value.text, check.line, check.declarations) };
}

function lengthAdvice({ assignment }: VectorAssignment, check: FailedCheck, headline: string): Advice {
  const hint = declarationHint(check.declarations.objectAt(assignment.targetName, check.line), check);
  return { headline, span: spanOf(assignment.value), ...hint };
}

/**
 * Both widths are known and differ. GHDL evaluates a slice before it compares
 * widths, so the mismatch is the failed check only when every slice on the line
 * is certainly inside its vector. A slice that certainly failed is left to the
 * slice rule; one that may have left its vector is named next to the mismatch.
 */
const knownLengthMismatch: CheckRule = (check) => {
  const vector = vectorAssignmentOn(check);
  if (vector?.valueBits === undefined || vector.valueBits === vector.targetBits) return undefined;
  const slices = sliceVerdicts(check);
  if (slices.some((slice) => slice.kind === 'failed')) return undefined;
  const { assignment, targetBits, valueBits } = vector;
  const mayLeave = slices.find((slice) => slice.kind === 'mayLeave');
  const mismatch = (fitting?: string) => rangeText.lengthMismatch(assignment.target.text, targetBits, assignment.value.text, valueBits, fitting);
  if (mayLeave?.kind !== 'mayLeave') return lengthAdvice(vector, check, mismatch(fittingStatement(assignment, targetBits, valueBits, check)));
  const { part, range, names } = mayLeave;
  const alsoSlice = rangeText.sliceMustAlsoStayInside(part.whole.text, part.name.text, range, names);
  return lengthAdvice(vector, check, `${mismatch()} ${alsoSlice}`);
};

/** The value's width is not known: the target's is, and the student can count. */
const unknownValueLength: CheckRule = (check) => {
  const vector = vectorAssignmentOn(check);
  if (vector === undefined || vector.valueBits !== undefined) return undefined;
  return lengthAdvice(vector, check, rangeText.lengthUnknown(vector.assignment.target.text, vector.targetBits, vector.range));
};

// ------------------------------------------------------------ numbers

type Step = 'up' | 'down';

/**
 * Which way the value moved `target`: the sign of `value - target`, when algebra
 * proves it constant (staticInteger.ts reads the whole expression, left to right):
 * `count + 1` and `count - 1 + 2` step up, `count + STEP - 3` down. `count + delta`
 * says nothing: `delta` may be negative, and then the value left at the other end.
 */
function stepOf(value: string, target: string, check: FailedCheck): Step | undefined {
  const moved = check.declarations.constantDifference(value, target, check.line);
  if (moved === undefined || moved === 0) return undefined;
  return moved > 0 ? 'up' : 'down';
}

/**
 * The step of an overflow. GHDL checks every intermediate result, so
 * `i - 1 + 2` may fail at `i - 1` though it adds 1: only a value that is one
 * addition to or subtraction from `target` has a known direction.
 */
function overflowStepOf(value: string, target: string, check: FailedCheck): Step | undefined {
  const terms = splitTopLevel(withoutOuterParentheses(value), /[+-]/);
  const isOneStep = terms.length === 2 && terms[0].toLowerCase() === target.toLowerCase();
  return isOneStep ? stepOf(value, target, check) : undefined;
}

function numberHeadline(value: string, target: string, type: { readonly range: DeclaredRange; readonly name: string }, check: FailedCheck): string {
  const { range, name: typeName } = type;
  const bounds = boundsOf(range);
  const step = stepOf(value, target, check);
  if (bounds === undefined) return rangeText.numberOutside(value, target, range.text);
  const { low, high } = bounds;
  if (step === 'up' && high !== INTEGER_HIGH) return rangeText.numberAbove(value, target, low, high);
  if (step === 'down' && low === 0 && high === INTEGER_HIGH) return rangeText.naturalBelowZero(value, target, typeName);
  if (step === 'down') return rangeText.numberBelow(value, target, low, high);
  return rangeText.numberOutside(value, target, range.text);
}

const numberOutOfRange: CheckRule = (check) => {
  const assignment = assignmentOn(check.text);
  if (assignment === undefined || assignment.target.text !== assignment.targetName) return undefined;
  const type = check.declarations.typeAt(assignment.targetName, check.line);
  if (type?.kind !== 'number' || type.range === undefined) return undefined;
  const headline = numberHeadline(assignment.value.text, assignment.targetName, { range: type.range, name: type.name }, check);
  const hint = declarationHint(check.declarations.objectAt(assignment.targetName, check.line), check);
  return { headline, span: spanOf(assignment.value), ...hint };
};

const ARITHMETIC = /[-+*/]|\*\*/;

const integerOverflow: CheckRule = (check) => {
  const assignment = check.message === OVERFLOW ? assignmentOn(check.text) : undefined;
  if (assignment === undefined || !ARITHMETIC.test(codeShape(assignment.value.text))) return undefined;
  const value = assignment.value.text;
  const headline = {
    up: rangeText.integerAbove,
    down: rangeText.integerBelow,
    unknown: rangeText.integerOutside,
  }[overflowStepOf(value, assignment.targetName, check) ?? 'unknown'](value);
  return { headline, span: spanOf(assignment.value) };
};

const anyBound: CheckRule = () => ({ headline: rangeText.anyBound() });

// ------------------------------------------------------------ initial values

/** The object declared with a value on the failing line: `signal c : integer range 0 to 9 := 12;`. */
function initializedOn(check: FailedCheck): (DeclaredObject & { readonly initial: string }) | undefined {
  const object = check.declarations.declaredOn(check.line).find((o) => o.initial !== undefined);
  return object?.initial === undefined ? undefined : { ...object, initial: object.initial };
}

function initialSpan(check: FailedCheck, initial: string): Span | undefined {
  const start = check.text.lastIndexOf(initial);
  return start < 0 ? undefined : { start, end: start + initial.length };
}

const initialOutOfRange: CheckRule = (check) => {
  const object = initializedOn(check);
  const type = object && check.declarations.typeAt(object.name, check.line);
  if (object === undefined || type?.kind !== 'number' || type.range === undefined) return undefined;
  return { headline: rangeText.initialOutside(object.initial, object.name, type.range.text), span: initialSpan(check, object.initial) };
};

const initialLength: CheckRule = (check) => {
  const object = initializedOn(check);
  const range = object && vectorRange(check, object.name);
  const bits = lengthOf(range);
  const valueBits = object && widthOf(object.initial, check.line, check.declarations);
  if (object === undefined || range === undefined || bits === undefined || valueBits === undefined) return undefined;
  return { headline: rangeText.initialLength(object.initial, valueBits, object.name, bits, range.text), span: initialSpan(check, object.initial) };
};

// ------------------------------------------------------------ public

/** Each kind of message and its rules, tried in order; the first advice wins. */
const RULES_BY_MESSAGE: readonly (readonly [RegExp, readonly CheckRule[]])[] = [
  [INDEX_OUT_OF_BOUNDS, [indexOutOfBounds]],
  [
    BOUND_CHECK,
    [returnOutOfRange, enumerationStep, knownLengthMismatch, sliceOutOfRange, unknownValueLength, numberOutOfRange, integerOverflow, anyBound],
  ],
  [INITIAL_OUT_OF_RANGE, [initialOutOfRange, numberOutOfRange]],
  [STRING_LENGTH, [initialLength, knownLengthMismatch, unknownValueLength]],
  [SLICE_DIRECTION, [sliceOutOfRange]],
];

function rulesFor(message: string): readonly CheckRule[] | undefined {
  return RULES_BY_MESSAGE.find(([pattern]) => pattern.test(message))?.[1];
}

/** Whether `message` is a range check this module explains. */
export function isRangeCheck(message: string): boolean {
  return rulesFor(message) !== undefined;
}

/** Advice for a failed range check on 1-based `line` of `file`; undefined for any other message. */
export function adviseRangeCheck(message: string, line: number, file: CheckedFile): Advice | undefined {
  const text = file.lines[line - 1];
  if (text === undefined) return undefined;
  const check: FailedCheck = { ...file, message, line, text };
  for (const rule of rulesFor(message) ?? []) {
    const advice = rule(check);
    if (advice !== undefined) return advice;
  }
  return undefined;
}
