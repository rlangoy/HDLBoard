// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * The acceptance test of docs/editor_diagnostics_range_and_type_advice.md: every
 * measured capture (rangeAndType.corpus.ts) the way the browser receives it — a
 * run's output one LOG line at a time, a failed analysis as one ERROR frame —
 * through parse → locate → advise, compared with what the student should read.
 */

import { describe, expect, test } from 'vitest';
import { adviseDiagnostics, adviseLogDiagnostics, type AdvisedDiagnostic } from './diagnosticAdvice';
import { locateDiagnostics, type RunSnapshot } from './diagnosticLocation';
import { DiagnosticParser, parseDiagnostics } from './diagnostics';
import { RANGE_CORPUS, type RangeCorpusCase } from './rangeAndType.corpus';

const FILE_ID = 'corpus';

function snapshotOf(corpusCase: RangeCorpusCase): RunSnapshot {
  return { files: [{ id: FILE_ID, name: corpusCase.fileName, content: corpusCase.source }] };
}

/** A run's output arrives one LOG frame per line; everything else in one ERROR frame. */
function advise(corpusCase: RangeCorpusCase): AdvisedDiagnostic[] {
  const snapshot = snapshotOf(corpusCase);
  const locate = (text: string, parser = new DiagnosticParser()) =>
    locateDiagnostics(parser.parse(text), snapshot, snapshot.files);
  if (corpusCase.stage !== 'runtime') return adviseDiagnostics(locateDiagnostics(parseDiagnostics(corpusCase.output), snapshot, snapshot.files), snapshot);
  const parser = new DiagnosticParser();
  return corpusCase.output.split('\n').flatMap((line) => adviseLogDiagnostics(locate(line, parser), snapshot));
}

interface Outcome {
  readonly line: number;
  readonly headline: string | undefined;
  /** The underlined text, cut from the source. */
  readonly underlined?: string;
  readonly relatedLine?: number;
  readonly relatedNote?: string;
}

function outcome(corpusCase: RangeCorpusCase): Outcome | undefined {
  const [first] = advise(corpusCase).filter((d) => d.severity === 'error');
  if (first === undefined) return undefined;
  const { advice } = first;
  const text = corpusCase.source.split('\n')[first.line - 1];
  return {
    line: first.line,
    headline: advice?.headline,
    ...(advice?.span && { underlined: text.slice(advice.span.start, advice.span.end) }),
    ...(advice?.relatedLine !== undefined && { relatedLine: advice.relatedLine }),
    ...(advice?.relatedNote !== undefined && { relatedNote: advice.relatedNote }),
  };
}

/** What the student reads for each case: the first error, reviewed by hand. `undefined`: nothing is marked. */
const EXPECTED: Readonly<Record<string, Outcome | undefined>> = {
  integer_overflow: {
    line: 11,
    headline: "`value + 1` went above 3, the top of the range of `value` (0 to 3) — a range does not wrap around: set `value` back to 0 yourself before it passes 3.",
    underlined: "value + 1",
    relatedLine: 8,
    relatedNote: "value is declared here: integer range 0 to 3",
  },
  integer_underflow: {
    line: 11,
    headline: "`value - 1` went below -2, the bottom of the range of `value` (-2 to 2) — check `value` before you subtract.",
    underlined: "value - 1",
    relatedLine: 8,
    relatedNote: "value is declared here: integer range -2 to 2",
  },
  array_index: {
    line: 14,
    headline: "Index 4 is outside `bits`, which has indexes 3 downto 0 — an index of `bits` must be from 0 to 3.",
    underlined: "bits(index_value)",
    relatedLine: 8,
    relatedNote: "bits is declared here: bit_vector(3 downto 0)",
  },
  vector_length: {
    line: 12,
    headline: "`destination` has 4 bits but `source` has 5 bits — both sides of an assignment need the same number of bits. For example: `destination := source(3 downto 0);`",
    underlined: "source",
    relatedLine: 9,
    relatedNote: "destination is declared here: bit_vector(3 downto 0)",
  },
  slice_bounds: {
    line: 14,
    headline: "The slice `bits(high_index downto high_index - 3)` must stay inside `bits` (7 downto 0) and have 4 bits, like `result` — check the value of `high_index` here.",
    underlined: "bits(high_index downto high_index - 3)",
    relatedLine: 8,
    relatedNote: "bits is declared here: bit_vector(7 downto 0)",
  },
  counter_signal: {
    line: 15,
    headline: "`count + 1` went above 9, the top of the range of `count` (0 to 9) — a range does not wrap around: set `count` back to 0 yourself before it passes 9.",
    underlined: "count + 1",
    relatedLine: 9,
    relatedNote: "count is declared here: integer range 0 to 9",
  },
  natural_negative: {
    line: 14,
    headline: "`n - 1` went below 0, but `n` is a `natural` and cannot be negative — check it before you subtract.",
    underlined: "n - 1",
    relatedLine: 11,
    relatedNote: "n is declared here: natural",
  },
  signal_length: {
    line: 15,
    headline: "`y` has 4 bits but `a` has 8 bits — both sides of an assignment need the same number of bits. For example: `y <= a(3 downto 0);`",
    underlined: "a",
    relatedLine: 10,
    relatedNote: "y is declared here: std_logic_vector(3 downto 0)",
  },
  concurrent_length: {
    line: 12,
    headline: "`y` has 4 bits but `a` has 8 bits — both sides of an assignment need the same number of bits. For example: `y <= a(3 downto 0);`",
    underlined: "a",
    relatedLine: 10,
    relatedNote: "y is declared here: std_logic_vector(3 downto 0)",
  },
  to_integer_range: {
    line: 15,
    headline: "`to_integer(u)` gave `idx` a value outside its range 0 to 7 — keep the value within the range, or make the range wider.",
    underlined: "to_integer(u)",
    relatedLine: 12,
    relatedNote: "idx is declared here: integer range 0 to 7",
  },
  memory_index: {
    line: 17,
    headline: "Index 8 is outside `mem`, which has indexes 0 to 7 — `addr` has 4 bits, so `to_integer(addr)` can be up to 15.",
    underlined: "mem(to_integer(addr))",
    relatedLine: 10,
    relatedNote: "mem is declared here: mem_t",
  },
  integer_32_bits: {
    line: 15,
    headline: "`i * 2` is outside what an `integer` can hold (-2147483648 to 2147483647) — keep the numbers smaller, or use `signed` or `unsigned` for wider values.",
    underlined: "i * 2",
  },
  concatenation_length: {
    line: 15,
    headline: "`y` has 7 bits but `a & b` has 8 bits — both sides of an assignment need the same number of bits.",
    underlined: "a & b",
    relatedLine: 10,
    relatedNote: "y is declared here: std_logic_vector(6 downto 0)",
  },
  enumeration_succ: {
    line: 15,
    headline: "`done` is the last value of `state_t`, so `state_t'succ` has nothing after it — test for `state_t'high` first and go back to the first value yourself.",
    underlined: "state_t'succ",
  },
  loop_index: {
    line: 15,
    headline: "Index 8 is outside `v`, which has indexes 7 downto 0 — the loop on line 14 lets `i` reach 8.",
    underlined: "v(i)",
    relatedLine: 14,
    relatedNote: "This loop runs i through 0 to 8",
  },
  slice_below_zero: {
    line: 17,
    headline: "The slice `v(lo + 3 downto lo)` must stay inside `v` (7 downto 0) and have 4 bits, like `r` — check the value of `lo` here.",
    underlined: "v(lo + 3 downto lo)",
    relatedLine: 11,
    relatedNote: "v is declared here: std_logic_vector(7 downto 0)",
  },
  slice_direction: {
    line: 16,
    headline: "`v` is declared `7 downto 0`, so a slice of it must use `downto` too: `v(hi downto 0)`.",
    underlined: "v(0 to hi)",
    relatedLine: 11,
    relatedNote: "v is declared here: std_logic_vector(7 downto 0)",
  },
  slice_length: {
    line: 16,
    headline: "The slice `v(hi downto 2)` must stay inside `v` (7 downto 0) and have 4 bits, like `r` — check the value of `hi` here.",
    underlined: "v(hi downto 2)",
    relatedLine: 11,
    relatedNote: "v is declared here: std_logic_vector(7 downto 0)",
  },
  unsigned_sum_width: {
    line: 15,
    headline: "`s` has 4 bits but `u + 1` has 8 bits — both sides of an assignment need the same number of bits. For example: `s := resize(u + 1, 4);`",
    underlined: "u + 1",
    relatedLine: 12,
    relatedNote: "s is declared here: unsigned(3 downto 0)",
  },
  conversion_width: {
    line: 14,
    headline: "`y` has 4 bits but `std_logic_vector(to_unsigned(5, 8))` has 8 bits — both sides of an assignment need the same number of bits.",
    underlined: "std_logic_vector(to_unsigned(5, 8))",
    relatedLine: 9,
    relatedNote: "y is declared here: std_logic_vector(3 downto 0)",
  },
  function_return: {
    line: 12,
    headline: "`next_digit` returns a value outside `digit_t` (0 to 9) — the value after `return` must stay within 0 to 9.",
    underlined: "d + 1",
  },
  generic_width: {
    line: 16,
    headline: "`y` has 6 bits but `a` has 8 bits — both sides of an assignment need the same number of bits. For example: `y <= a(5 downto 0);`",
    underlined: "a",
    relatedLine: 11,
    relatedNote: "y is declared here: std_logic_vector(WIDTH - 1 downto 0)",
  },
  division_by_zero: undefined,
  static_slice: {
    line: 12,
    headline: "`a(7 downto 4)` reaches outside `a`, which only has indexes 3 downto 0.",
    underlined: "a(7 downto 4)",
    relatedLine: 9,
    relatedNote: "a is declared here: std_logic_vector(3 downto 0)",
  },
  static_slice_length: {
    line: 12,
    headline: "`y` has 4 bits but `a(7 downto 2)` has 6 bits — both sides of an assignment need the same number of bits.",
    underlined: "a(7 downto 2)",
    relatedLine: 10,
    relatedNote: "y is declared here: std_logic_vector(3 downto 0)",
  },
  integer_to_vector: {
    line: 12,
    headline: "`count` is an `integer`, but `leds` is a `std_logic_vector` — convert it: `std_logic_vector(to_unsigned(count, 8))`.",
    underlined: "count",
  },
  vector_to_integer: {
    line: 12,
    headline: "`sw` is a `std_logic_vector`, but `count` is an `integer` — convert it: `to_integer(unsigned(sw))`.",
    underlined: "sw",
  },
  vector_to_unsigned: {
    line: 12,
    headline: "`sw` is a `std_logic_vector`, but `cnt` is an `unsigned` — convert it: `unsigned(sw)`.",
    underlined: "sw",
  },
  unsigned_to_vector: {
    line: 12,
    headline: "`cnt` is an `unsigned`, but `leds` is a `std_logic_vector` — convert it: `std_logic_vector(cnt)`.",
    underlined: "cnt",
  },
  integer_to_unsigned: {
    line: 12,
    headline: "`n` is an `integer`, but `cnt` is an `unsigned` — convert it: `to_unsigned(n, 8)`.",
    underlined: "n",
  },
  unsigned_to_integer: {
    line: 12,
    headline: "`cnt` is an `unsigned`, but `n` is an `integer` — convert it: `to_integer(cnt)`.",
    underlined: "cnt",
  },
  string_to_bit: {
    line: 11,
    headline: "`\"1\"` in double quotes is a vector — a single bit is written in single quotes: `'1'`.",
    underlined: "\"1\"",
  },
  character_to_vector: {
    line: 11,
    headline: "`'1'` is a single bit, but `leds` is a vector — write all 8 bits, `\"00000001\"`, or set every bit to it with `(others => '1')`.",
    underlined: "'1'",
  },
  number_to_vector: {
    line: 11,
    headline: "A `std_logic_vector` is not a number — write its bits, `\"00000101\"`, or convert: `std_logic_vector(to_unsigned(5, 8))`.",
    underlined: "5",
  },
  number_to_unsigned: {
    line: 11,
    headline: "An `unsigned` is not a number — write its bits, `\"00000101\"`, or convert: `to_unsigned(5, 8)`.",
    underlined: "5",
  },
  number_to_bit: {
    line: 11,
    headline: "A single bit is written in single quotes: `'1'`, not `1`.",
    underlined: "1",
  },
  vector_plus: {
    line: 11,
    headline: "`sw` is a `std_logic_vector`, which has no `+` — calculate with `unsigned`: `std_logic_vector(unsigned(sw) + 1)`.",
    underlined: "sw + 1",
  },
  condition_to_bit: {
    line: 12,
    headline: "`a = b` is a condition (true or false), not a `std_logic` — write it as `led <= '1' when a = b else '0';`.",
    underlined: "a = b",
  },
  bit_to_vector: {
    line: 12,
    headline: "`led` is a single bit, but `leds` is a vector — assign it to one bit, `leds(0) <= led;`, or to every bit, `leds <= (others => led);`.",
    underlined: "led",
  },
  vector_to_bit: {
    line: 12,
    headline: "`sw` is a vector, but `led` is a single bit — pick one bit of it, for example `sw(0)`.",
    underlined: "sw",
  },
  std_logic_to_bit: {
    line: 12,
    headline: "`s` is a `std_logic`, but `b` is a `bit` — convert it: `to_bit(s)`.",
    underlined: "s",
  },
  std_logic_to_integer: {
    line: 12,
    headline: "`s` is a `std_logic`, but `n` is an `integer` — convert it: `1 when s = '1' else 0`.",
    underlined: "s",
  },
  vector_equals_number: {
    line: 12,
    headline: "`sw` is a `std_logic_vector`, not a number — compare it as a number, `unsigned(sw) = 5`, or with bits, `sw = \"0101\"`.",
    underlined: "sw = 5",
  },
  vector_as_condition: {
    line: 14,
    headline: "`sw` is a `std_logic_vector`, not a condition — compare it, for example `if sw /= \"0000\" then`, or test one bit: `if sw(0) = '1' then`.",
    underlined: "sw",
  },
  to_integer_of_vector: {
    line: 12,
    headline: "`to_integer` takes an `unsigned` or a `signed`, not a `std_logic_vector` — say which `sw` is: `to_integer(unsigned(sw))`.",
    underlined: "to_integer(sw)",
  },
  cast_integer_to_vector: {
    line: 12,
    headline: "An `integer` cannot be cast to `std_logic_vector` — convert it: `std_logic_vector(to_unsigned(n, 8))`.",
    underlined: "std_logic_vector(n)",
  },
  cast_vector_to_integer: {
    line: 12,
    headline: "A `std_logic_vector` cannot be cast to `integer` — convert it: `to_integer(unsigned(sw))`.",
    underlined: "integer(sw)",
  },
  variable_with_arrow: {
    line: 14,
    headline: "`v` is a variable: assign it with `:=`, not `<=`.",
    underlined: "v",
  },
  signal_with_colon: {
    line: 13,
    headline: "`led` is a signal: assign it with `<=` — `:=` is only for variables.",
    underlined: "led",
  },
  signal_with_colon_outside: {
    line: 11,
    headline: "`led` is a signal: assign it with `<=` — `:=` is only for variables.",
    underlined: ":=",
  },
  initial_too_long: {
    line: 9,
    headline: "The start value `\"10101\"` has 5 bits, but `a` has 4 bits (3 downto 0) — write exactly 4 bits.",
    underlined: "\"10101\"",
  },
  initial_out_of_range: {
    line: 9,
    headline: "The start value `12` is outside the range of `c` (0 to 9).",
    underlined: "12",
  },
  static_index: {
    line: 12,
    headline: "Index 8 is outside `a`, which has indexes 7 downto 0 — an index of `a` must be from 0 to 7.",
    underlined: "a(8)",
    relatedLine: 9,
    relatedNote: "a is declared here: std_logic_vector(7 downto 0)",
  },
  static_slice_direction: {
    line: 12,
    headline: "`a` is declared `7 downto 0`, so a slice of it must use `downto` too: `a(3 downto 0)`.",
    underlined: "a(0 to 3)",
    relatedLine: 9,
    relatedNote: "a is declared here: std_logic_vector(7 downto 0)",
  },
  port_map_width: {
    line: 21,
    headline: "`big` has 8 bits, but port `a` of `sub` has 4 bits — connect 4 bits, for example `big(3 downto 0)`.",
    underlined: "big",
  },
};

describe('range and type corpus', () => {
  test('every case has an expectation, and every expectation a case', () => {
    expect(RANGE_CORPUS.map((c) => c.id).sort()).toEqual(Object.keys(EXPECTED).sort());
  });

  test.each(RANGE_CORPUS.map((c) => [c.id, c] as const))('%s', (id, corpusCase) => {
    expect(outcome(corpusCase)).toEqual(EXPECTED[id]);
  });

  test('the student examples keep their hint comments, which the advice reads past', () => {
    const examples = RANGE_CORPUS.filter((c) => c.source.startsWith('--'));
    expect(examples.map((c) => outcome(c)?.line)).toEqual([11, 11, 14, 12, 14]);
  });
});
