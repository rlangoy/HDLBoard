// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * The value of a static VHDL integer expression as a range or width is written:
 * `7`, `N - 1`, `WIDTH*2 - 1`, `2**N`, `x'length - 1`. Names and attributes are
 * looked up by the caller; anything else (a function call, a real) gives
 * `undefined`. Pure.
 */

export interface StaticNames {
  /** The value of a constant or generic; undefined when it is not a known number. */
  readonly constant: (name: string) => number | undefined;
  /** `name'attribute` (attribute in lower case: `length`, `high` …). */
  readonly attribute: (name: string, attribute: string) => number | undefined;
}

const TOKEN = /\s*(\d[\d_]*|\w+'\w+|\w+|\*\*|[-+*/()])/y;
const NUMBER = /^\d[\d_]*$/;
const ATTRIBUTE = /^(?<name>\w+)'(?<attribute>\w+)$/;

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

type Operator = (a: number, b: number) => number;

const ADDING: Readonly<Record<string, Operator>> = { '+': (a, b) => a + b, '-': (a, b) => a - b };
const MULTIPLYING: Readonly<Record<string, Operator>> = {
  '*': (a, b) => a * b,
  '/': (a, b) => Math.trunc(a / b),
  mod: (a, b) => ((a % b) + b) % b,
  rem: (a, b) => a % b,
};

/** Recursive descent over VHDL's precedence: adding, multiplying, sign, `**`. */
class Evaluation {
  private at = 0;

  constructor(
    private readonly tokens: readonly string[],
    private readonly names: StaticNames,
  ) {}

  whole(): number | undefined {
    const value = this.adding();
    return this.at === this.tokens.length && value !== undefined && Number.isFinite(value) ? value : undefined;
  }

  private adding(): number | undefined {
    let value = this.signed();
    while (value !== undefined && this.tokens[this.at] in ADDING) {
      const operator = ADDING[this.tokens[this.at++]];
      const right = this.multiplying();
      value = right === undefined ? undefined : operator(value, right);
    }
    return value;
  }

  /** A sign applies to the first term only, as in VHDL: `-a * b` is `-(a * b)`. */
  private signed(): number | undefined {
    const sign = this.tokens[this.at];
    if (sign !== '-' && sign !== '+') return this.multiplying();
    this.at++;
    const value = this.multiplying();
    return value === undefined || sign === '+' ? value : -value;
  }

  private multiplying(): number | undefined {
    let value = this.power();
    while (value !== undefined && this.tokens[this.at] in MULTIPLYING) {
      const operator = MULTIPLYING[this.tokens[this.at++]];
      const right = this.power();
      value = right === undefined || right === 0 ? undefined : operator(value, right);
    }
    return value;
  }

  private power(): number | undefined {
    const base = this.primary();
    if (this.tokens[this.at] !== '**') return base;
    this.at++;
    const exponent = this.primary();
    return base === undefined || exponent === undefined ? undefined : base ** exponent;
  }

  private primary(): number | undefined {
    const token = this.tokens[this.at++];
    if (token === undefined) return undefined;
    if (token === '(') {
      const value = this.adding();
      return this.tokens[this.at++] === ')' ? value : undefined;
    }
    if (NUMBER.test(token)) return Number(token.replace(/_/g, ''));
    const attribute = ATTRIBUTE.exec(token)?.groups;
    if (attribute) return this.names.attribute(attribute.name, attribute.attribute);
    return /^\w+$/.test(token) ? this.names.constant(token) : undefined;
  }
}

export function evaluateStatic(text: string, names: StaticNames): number | undefined {
  const tokens = tokensOf(text);
  return tokens === undefined ? undefined : new Evaluation(tokens, names).whole();
}
