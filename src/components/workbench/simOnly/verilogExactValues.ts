// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * The values of a Verilog module's constants exactly as Verilog computes them, or none
 * (docs/impl_sim_only_warnings.md § 3.4). Numbers (`10`, `2'b10`, `4'hF`, `4'sd3`), earlier
 * constants, `+ - * / %`, parentheses and `$clog2`, by Verilog's width and sign rules: an
 * expression is as wide as its widest operand (an unsized decimal number and an `integer`
 * are 32 bits) and signed only when every operand is, every step wrapping to that width.
 * `2'd1 + 2'd1` is 2, `4'hF + 4'h1` is 0 in 4 bits, `32'hffff_ffff + 32'd1` is 0, and
 * `$clog2(A + B)` adds two 4-bit constants in 4 bits. A declared `integer` type or
 * `[msb:lsb]` range makes the expression at least as wide as the type, as an assignment, and
 * cuts the value to it: `localparam [0:0] ON = 2` is 0, `localparam [8:0] P = 8'hFF + 8'h01`
 * is 256 (Quartus 25.1 Lite, measured 2026-11-27). Pure.
 */

import { aloneKey, clog2, unsignedKey, type Bindings } from './constantIndex';

/**
 * A constant's value, as a number of its kind (a 32-bit signed `integer`, or an `unsigned` or
 * `signed` one of a width of its own), and its width in bits.
 */
interface Exact {
  readonly value: bigint;
  readonly kind: 'integer' | 'unsigned' | 'signed';
  readonly width: number;
}

/** An `integer`, and an unsized decimal number, is 32 bits wide and signed. */
const INTEGER_WIDTH = 32;
const INT_MAX = BigInt(2) ** BigInt(INTEGER_WIDTH - 1) - BigInt(1);
const ZERO = BigInt(0);
/**
 * The widest operand computed. A value is at most a safe integer in the end, so a wider one
 * changes nothing a fixed constant keeps; one of absurd width (`[99999999999999999:0]`,
 * invalid HDL being edited) is not computed at all.
 */
const MAX_WIDTH = 64;

const TOKEN = /\d*\s*'[sS]?[bBoOdDhH]\s*[0-9a-fA-FxXzZ?_]+|\d[\d_]*|\$?[A-Za-z_]\w*|[-+*/%()]|\S/g;
const BASED = /^(\d*)\s*'([sS]?)([bBoOdDhH])\s*([0-9a-fA-F_]+)$/;
const VALID_DIGITS: Readonly<Record<string, RegExp>> = { b: /^[01]+$/, o: /^[0-7]+$/, d: /^\d+$/, h: /^[0-9a-f]+$/i };
const PREFIX: Readonly<Record<string, string>> = { b: '0b', o: '0o', d: '', h: '0x' };

/** An operand: its bits (`value` read unsigned, below 2^width), its width, and whether it is signed. */
interface Operand {
  readonly bits: bigint;
  readonly width: number;
  readonly signed: boolean;
}

/** An expression read: an operand, a negation, or two terms joined by an operator. */
type Term = { readonly operand: Operand } | { readonly negated: Term } | { readonly operator: string; readonly left: Term; readonly right: Term };

const OPERATION: Readonly<Record<string, (a: bigint, b: bigint) => bigint | undefined>> = {
  '+': (a, b) => a + b,
  '-': (a, b) => a - b,
  '*': (a, b) => a * b,
  // BigInt division truncates toward zero, and the remainder takes the dividend's sign, as in Verilog; by zero is x.
  '/': (a, b) => (b === ZERO ? undefined : a / b),
  '%': (a, b) => (b === ZERO ? undefined : a % b),
};

interface Reader {
  readonly tokens: readonly string[];
  at: number;
  readonly known: ReadonlyMap<string, Exact>;
}

/** Terms joined by the operators of one level, left to right. */
function chain(r: Reader, operators: string, operand: (r: Reader) => Term | undefined): Term | undefined {
  let term = operand(r);
  while (term !== undefined && operators.includes(r.tokens[r.at] ?? '#')) {
    const operator = r.tokens[r.at++];
    const right = operand(r);
    term = right === undefined ? undefined : { operator, left: term, right };
  }
  return term;
}

const sum = (r: Reader): Term | undefined => chain(r, '+-', product);
const product = (r: Reader): Term | undefined => chain(r, '*/%', factor);

/** `( … )` after its opening parenthesis: the term inside, and the closing one read. */
function parenthesized(r: Reader): Term | undefined {
  const term = sum(r);
  return r.tokens[r.at++] === ')' ? term : undefined;
}

/** `$clog2( … )` after its name: its argument an expression of its own width; its result an integer. */
function clog2Call(r: Reader): Term | undefined {
  if (r.tokens[r.at++] !== '(') return undefined;
  const argument = parenthesized(r);
  const value = argument && evaluate(argument);
  const bits = value === undefined ? undefined : clog2(Number(numberOf(value)));
  return bits === undefined ? undefined : { operand: integerOperand(BigInt(bits)) };
}

/** The factors that start with a token of their own: a negation, parentheses, `$clog2( … )`. */
const FACTOR_FORMS: ReadonlyMap<string, (r: Reader) => Term | undefined> = new Map([
  ['-', (r: Reader) => {
    const negated = factor(r);
    return negated && { negated };
  }],
  ['(', parenthesized],
  ['$clog2', clog2Call],
]);

const integerOperand = (value: bigint): Operand => ({ bits: BigInt.asUintN(INTEGER_WIDTH, value), width: INTEGER_WIDTH, signed: true });

/** A number as written: an unsized decimal (a 32-bit integer), or a based literal of its own width; none with x or z digits. */
function literal(token: string): Operand | undefined {
  if (!/^\d[\d_]*$/.test(token)) return basedLiteral(token);
  const value = BigInt(token.replace(/_/g, ''));
  return value <= INT_MAX ? integerOperand(value) : undefined;
}

/** `4'hF`, `2'b10`, `4'sd3`, `'hF` (at least 32 bits). */
function basedLiteral(token: string): Operand | undefined {
  const based = BASED.exec(token);
  if (!based) return undefined;
  const digits = based[4].replace(/_/g, '');
  const base = based[3].toLowerCase();
  if (!VALID_DIGITS[base].test(digits)) return undefined;
  const raw = BigInt(PREFIX[base] + digits);
  const width = based[1] ? Number(based[1]) : Math.max(INTEGER_WIDTH, raw.toString(2).length);
  return isWidth(width) ? { bits: BigInt.asUintN(width, raw), width, signed: based[2] !== '' } : undefined;
}

const isWidth = (width: number): boolean => Number.isSafeInteger(width) && width >= 1 && width <= MAX_WIDTH;

function factor(r: Reader): Term | undefined {
  const token = r.tokens[r.at++];
  if (token === undefined) return undefined;
  const form = FACTOR_FORMS.get(token);
  if (form) return form(r);
  const constant = r.known.get(token);
  const operand = constant ? { bits: BigInt.asUintN(constant.width, constant.value), width: constant.width, signed: constant.kind !== 'unsigned' } : literal(token);
  return operand && { operand };
}

/** The operands of a term, those inside `$clog2` not among them: they make an expression of their own. */
function operandsOf(term: Term): Operand[] {
  if ('operand' in term) return [term.operand];
  if ('negated' in term) return operandsOf(term.negated);
  return [...operandsOf(term.left), ...operandsOf(term.right)];
}

/** The value of `term` in an expression `width` bits wide, signed or not, every step wrapped to it. */
function valueIn(term: Term, width: number, signed: boolean): bigint | undefined {
  const wrap = (v: bigint) => (signed ? BigInt.asIntN(width, v) : BigInt.asUintN(width, v));
  if ('operand' in term) return signed ? BigInt.asIntN(term.operand.width, term.operand.bits) : term.operand.bits;
  if ('negated' in term) {
    const value = valueIn(term.negated, width, signed);
    return value === undefined ? undefined : wrap(-value);
  }
  const left = valueIn(term.left, width, signed);
  const right = valueIn(term.right, width, signed);
  const result = left === undefined || right === undefined ? undefined : OPERATION[term.operator](left, right);
  return result === undefined ? undefined : wrap(result);
}

/** An expression's value as Verilog has it, at least `atLeast` bits wide (an assignment's width). */
function evaluate(term: Term, atLeast = 0): Operand | undefined {
  const operands = operandsOf(term);
  const width = Math.max(atLeast, ...operands.map((o) => o.width));
  const signed = operands.every((o) => o.signed);
  const value = valueIn(term, width, signed);
  return value === undefined ? undefined : { bits: BigInt.asUintN(width, value), width, signed };
}

/** An operand as the number it is: signed ones may be negative. */
const numberOf = (o: Operand): bigint => (o.signed ? BigInt.asIntN(o.width, o.bits) : o.bits);

/** A value of its kind: a signed 32-bit one is an integer. */
const exactOf = (o: Operand): Exact => ({ value: numberOf(o), kind: o.signed ? (o.width === INTEGER_WIDTH ? 'integer' : 'signed') : 'unsigned', width: o.width });

const RANGE_TYPE = /^(signed|unsigned)?\s*\[\s*(\d+)\s*:\s*(\d+)\s*\]$/;

/** What a declared type makes of a value: `integer` 32-bit signed, `[1:0]` two bits, unsigned unless `signed`; none for another type. */
function typeOf(type: string): { readonly width: number; readonly signed: boolean } | undefined {
  const t = type.trim().replace(/\s+/g, ' ');
  if (t === 'integer') return { width: INTEGER_WIDTH, signed: true };
  const range = RANGE_TYPE.exec(t);
  if (!range) return undefined;
  const width = Math.abs(Number(range[2]) - Number(range[3])) + 1;
  return isWidth(width) ? { width, signed: range[1] === 'signed' } : undefined;
}

/**
 * The most tokens an expression computed has. Its terms nest as deep as it has operators,
 * and are walked recursively: a generated `localparam` of 10 000 additions would overflow
 * the stack and stop the whole check.
 */
const MAX_TOKENS = 1000;

/** A constant's expression read whole, or none. */
function parsed(text: string, known: ReadonlyMap<string, Exact>): Term | undefined {
  const tokens = text.trim().match(TOKEN) ?? [];
  if (tokens.length > MAX_TOKENS) return undefined;
  const reader: Reader = { tokens, at: 0, known };
  const term = sum(reader);
  return reader.at === tokens.length ? term : undefined;
}

/** The value of a constant's expression, cut to its declared type (see the module comment). */
function constantValue(text: string, type: string, known: ReadonlyMap<string, Exact>): Exact | undefined {
  const term = parsed(text, known);
  const alone = term && evaluate(term);
  if (term === undefined || alone === undefined) return undefined;
  return type.trim() === '' ? exactOf(alone) : typedValue(term, type);
}

/** A typed constant's value: its expression as wide as the type at least (as an assignment), cut to the type. */
function typedValue(term: Term, type: string): Exact | undefined {
  const declared = typeOf(type);
  const assigned = declared && evaluate(term, declared.width);
  if (declared === undefined || assigned === undefined) return undefined;
  return exactOf({ bits: BigInt.asUintN(declared.width, assigned.bits), width: declared.width, signed: declared.signed });
}

const KEY_OF: Readonly<Record<Exact['kind'], (name: string) => string>> = { integer: (name) => name, unsigned: unsignedKey, signed: aloneKey };

/**
 * The exact values of `items`, in declaration order (a later one may use an earlier one); the
 * others are absent. Each is kept under the key of its kind (`constantIndex.ts`): an integer
 * under its name, an unsigned constant for arithmetic beside an integer, a signed one alone.
 */
export function exactValues(items: readonly { name: string; value: string; type: string }[]): Bindings {
  const known = new Map<string, Exact>();
  for (const { name, value, type } of items) {
    if (known.has(name)) continue;
    const exact = constantValue(value, type, known);
    if (exact && Number.isSafeInteger(Number(exact.value))) known.set(name, exact);
  }
  return new Map([...known].map(([name, exact]) => [KEY_OF[exact.kind](name), Number(exact.value)]));
}
