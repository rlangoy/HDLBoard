// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * VHDL integer expressions as ranges and widths are written: `7`, `N - 1`,
 * `WIDTH*2 - 1`, `2**N`, `x'length - 1`. One parser, two algebras: numbers give
 * the value of a static expression; linear forms prove that two ends of a moving
 * slice differ by a constant (`i - (i - 3)` is 3 whatever `i` is). Names and
 * attributes are looked up by the caller; anything else (a function call, a real,
 * a division of a name that changes) gives `undefined`. Pure.
 */

export interface StaticNames {
  /** The value of a constant or generic; undefined when it is not a known number. */
  readonly constant: (name: string) => number | undefined;
  /** `name'attribute` (attribute in lower case: `length`, `high` …). */
  readonly attribute: (name: string, attribute: string) => number | undefined;
}

/** For the difference of two ends: also which names change while the design runs. */
export interface ChangingNames extends StaticNames {
  readonly changes: (name: string) => boolean;
}

const TOKEN = /\s*(\d[\d_]*|\w+'\w+|\w+|\*\*|[-+*/()])/y;
const NUMBER = /^\d[\d_]*$/;
const ATTRIBUTE = /^(?<name>\w+)'(?<attribute>\w+)$/;
const ADDING_OPERATORS: ReadonlySet<string> = new Set(['+', '-']);
const MULTIPLYING_OPERATORS: ReadonlySet<string> = new Set(['*', '/', 'mod', 'rem']);
const POWER = '**';

function tokensOf(text: string): string[] | undefined {
  const tokens: string[] = [];
  let consumed = 0;
  TOKEN.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = TOKEN.exec(text)) !== null) {
    tokens.push(match[1].toLowerCase());
    consumed = TOKEN.lastIndex;
  }
  return text.slice(consumed).trim() === '' ? tokens : undefined;
}

/** What numbers, names and operators mean in one kind of evaluation. */
interface Algebra<T> {
  number(value: number): T;
  name(name: string): T | undefined;
  attribute(name: string, attribute: string): T | undefined;
  /** `+ - * / mod rem **`; undefined when the result is not one this algebra can hold. */
  apply(operator: string, left: T, right: T): T | undefined;
  negate(value: T): T;
}

type Operator = (a: number, b: number) => number | undefined;

/** VHDL's integer operators; a division by zero has no value. */
const OPERATORS: Readonly<Record<string, Operator>> = {
  '+': (a, b) => a + b,
  '-': (a, b) => a - b,
  '*': (a, b) => a * b,
  '/': (a, b) => (b === 0 ? undefined : Math.trunc(a / b)),
  mod: (a, b) => (b === 0 ? undefined : ((a % b) + b) % b),
  rem: (a, b) => (b === 0 ? undefined : a % b),
  '**': (a, b) => a ** b,
};

function finite(value: number | undefined): number | undefined {
  return value !== undefined && Number.isFinite(value) ? value : undefined;
}

function numbers(names: StaticNames): Algebra<number> {
  return {
    number: (value) => value,
    name: (name) => names.constant(name),
    attribute: (name, attribute) => names.attribute(name, attribute),
    apply: (operator, left, right) => finite(OPERATORS[operator]?.(left, right)),
    negate: (value) => -value,
  };
}

/** `constant + Σ coefficient × name`, over the names that change. */
interface Linear {
  readonly constant: number;
  readonly terms: ReadonlyMap<string, number>;
}

const constantOf = (value: number): Linear => ({ constant: value, terms: new Map() });

function isConstant(value: Linear): boolean {
  return [...value.terms.values()].every((coefficient) => coefficient === 0);
}

function combined(left: Linear, right: Linear, sign: 1 | -1): Linear {
  const terms = new Map(left.terms);
  for (const [name, coefficient] of right.terms) terms.set(name, (terms.get(name) ?? 0) + sign * coefficient);
  return { constant: left.constant + sign * right.constant, terms };
}

function scaled(value: Linear, factor: number): Linear {
  return { constant: value.constant * factor, terms: new Map([...value.terms].map(([name, c]) => [name, c * factor])) };
}

/** A product with a changing name on both sides, or a division of one, is not linear: no value. */
function linearApply(operator: string, left: Linear, right: Linear): Linear | undefined {
  if (operator === '+') return combined(left, right, 1);
  if (operator === '-') return combined(left, right, -1);
  if (operator === '*' && isConstant(left)) return scaled(right, left.constant);
  if (operator === '*' && isConstant(right)) return scaled(left, right.constant);
  if (!isConstant(left) || !isConstant(right)) return undefined;
  const value = finite(OPERATORS[operator]?.(left.constant, right.constant));
  return value === undefined ? undefined : constantOf(value);
}

function linearForms(names: ChangingNames): Algebra<Linear> {
  return {
    number: constantOf,
    name: (name) => {
      const value = names.constant(name);
      if (value !== undefined) return constantOf(value);
      return names.changes(name) ? { constant: 0, terms: new Map([[name, 1]]) } : undefined;
    },
    attribute: (name, attribute) => {
      const value = names.attribute(name, attribute);
      return value === undefined ? undefined : constantOf(value);
    },
    apply: linearApply,
    negate: (value) => scaled(value, -1),
  };
}

/** Recursive descent over VHDL's precedence: adding, multiplying, sign, `**`. */
class Evaluation<T> {
  private at = 0;

  constructor(
    private readonly tokens: readonly string[],
    private readonly algebra: Algebra<T>,
  ) {}

  whole(): T | undefined {
    const value = this.adding();
    return this.at === this.tokens.length ? value : undefined;
  }

  private adding(): T | undefined {
    let value = this.signed();
    while (value !== undefined && ADDING_OPERATORS.has(this.tokens[this.at])) {
      value = this.applied(value, this.tokens[this.at++], this.multiplying());
    }
    return value;
  }

  /** A sign applies to the first term only, as in VHDL: `-a * b` is `-(a * b)`. */
  private signed(): T | undefined {
    const sign = this.tokens[this.at];
    if (sign !== '-' && sign !== '+') return this.multiplying();
    this.at++;
    const value = this.multiplying();
    return value === undefined || sign === '+' ? value : this.algebra.negate(value);
  }

  private multiplying(): T | undefined {
    let value = this.power();
    while (value !== undefined && MULTIPLYING_OPERATORS.has(this.tokens[this.at])) {
      value = this.applied(value, this.tokens[this.at++], this.power());
    }
    return value;
  }

  private power(): T | undefined {
    const base = this.primary();
    if (this.tokens[this.at] !== POWER) return base;
    this.at++;
    return base === undefined ? undefined : this.applied(base, POWER, this.primary());
  }

  private applied(left: T, operator: string, right: T | undefined): T | undefined {
    return right === undefined ? undefined : this.algebra.apply(operator, left, right);
  }

  private primary(): T | undefined {
    const token = this.tokens[this.at++];
    if (token === undefined) return undefined;
    if (token === '(') {
      const value = this.adding();
      return this.tokens[this.at++] === ')' ? value : undefined;
    }
    if (NUMBER.test(token)) return this.algebra.number(Number(token.replace(/_/g, '')));
    const attribute = ATTRIBUTE.exec(token)?.groups;
    if (attribute) return this.algebra.attribute(attribute.name, attribute.attribute);
    return /^\w+$/.test(token) ? this.algebra.name(token) : undefined;
  }
}

function evaluate<T>(text: string, algebra: Algebra<T>): T | undefined {
  const tokens = tokensOf(text);
  return tokens === undefined ? undefined : new Evaluation(tokens, algebra).whole();
}

export function evaluateStatic(text: string, names: StaticNames): number | undefined {
  return evaluate(text, numbers(names));
}

/**
 * `left - right` when it is the same whatever the changing names hold, proved
 * by algebra: `i - (i - 3)` is 3. `i - j`, `2 * i - i` and `i / 1024 + 3 - 0`
 * are not, or cannot be shown to be: undefined.
 */
export function constantDifference(left: string, right: string, names: ChangingNames): number | undefined {
  const difference = evaluate(`(${left}) - (${right})`, linearForms(names));
  return difference !== undefined && isConstant(difference) ? difference.constant : undefined;
}
