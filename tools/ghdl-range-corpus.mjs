// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * The measurement behind docs/editor_diagnostics_range_and_type_advice.md: small
 * designs with one range or type mistake each, run the way the backend runs a
 * portless design (`ghdl -a`, `-e`, `-r`, all with `--std=08`, bare file name,
 * the file's directory as cwd). Only the stderr of the step that failed is kept:
 * that is the text the browser gets in the ERROR frame of that stage. A
 * successful `-a` prints its warnings to nobody.
 *
 *   capture  — run one GHDL over the cases and print the captures as JSON:
 *
 *       node tools/ghdl-range-corpus.mjs capture --ghdl ghdl > ghdl-6.json
 *
 *   generate — check that every capture file agrees and write
 *     src/components/workbench/rangeAndType.corpus.ts; with --check, only report
 *     whether the committed file is up to date (exit 1 if not):
 *
 *       node tools/ghdl-range-corpus.mjs generate ghdl-6.json
 *
 * Standalone on purpose (no build step, no dependencies), like ghdl-typo-corpus.mjs.
 */

import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const CORPUS_TS = join(root, 'src', 'components', 'workbench', 'rangeAndType.corpus.ts');
const STANDARD = '--std=08';
/** Every case fails at 1 ns; a run that does not is stopped long after. */
const STOP_TIME = '--stop-time=1us';

const IEEE = 'library ieee;\nuse ieee.std_logic_1164.all;\nuse ieee.numeric_std.all;\n\n';

/** A design `name` with `declarations` in its architecture and `body` as its statements. */
function design(name, body, declarations = '') {
  return `${IEEE}entity ${name} is\nend entity;\n\narchitecture rtl of ${name} is\n${declarations}begin\n${body}end architecture;\n`;
}

/** A process that waits 1 ns, then runs `statements` once. */
function waitThen(variables, statements) {
  return `  process\n${variables}  begin\n    wait for 1 ns;\n${statements}    wait;\n  end process;\n`;
}

/** The five designs of GHDL-tests/range-checks.hdlboard.json, as the student wrote them. */
const STUDENT_EXAMPLES = {
  integer_overflow: `-- Integer exceeds a constrained subtype. Run integer_overflow as the top-level entity.
entity integer_overflow is
end entity;

architecture test of integer_overflow is
begin
  process
    variable value : integer range 0 to 3 := 3;
  begin
    wait for 1 ns;
    value := value + 1; -- 4 is outside 0 to 3.
    wait;
  end process;
end architecture;
`,
  integer_underflow: `-- Integer falls below a constrained subtype. Run integer_underflow as the top-level entity.
entity integer_underflow is
end entity;

architecture test of integer_underflow is
begin
  process
    variable value : integer range -2 to 2 := -2;
  begin
    wait for 1 ns;
    value := value - 1; -- -3 is outside -2 to 2.
    wait;
  end process;
end architecture;
`,
  array_index: `-- Array index exceeds its bounds. Run array_index as the top-level entity.
entity array_index is
end entity;

architecture test of array_index is
begin
  process
    variable bits : bit_vector(3 downto 0) := "1010";
    variable index_value : integer := 3;
    variable result : bit;
  begin
    wait for 1 ns;
    index_value := index_value + 1;
    result := bits(index_value); -- index 4 is outside 3 downto 0.
    wait;
  end process;
end architecture;
`,
  vector_length: `-- Assignment between vectors of different lengths. Run vector_length as the top-level entity.
entity vector_length is
end entity;

architecture test of vector_length is
begin
  process
    variable source : bit_vector(4 downto 0) := "10101";
    variable destination : bit_vector(3 downto 0);
  begin
    wait for 1 ns;
    destination := source; -- Five elements do not fit in four.
    wait;
  end process;
end architecture;
`,
  slice_bounds: `-- Slice extends past the source vector. Run slice_bounds as the top-level entity.
entity slice_bounds is
end entity;

architecture test of slice_bounds is
begin
  process
    variable bits : bit_vector(7 downto 0) := "10101010";
    variable high_index : integer := 7;
    variable result : bit_vector(3 downto 0);
  begin
    wait for 1 ns;
    high_index := high_index + 1;
    result := bits(high_index downto high_index - 3); -- 8 downto 5 exceeds the source bounds.
    wait;
  end process;
end architecture;
`,
};

const SLV8 = 'std_logic_vector(7 downto 0)';

/** Mistakes found while the design runs. */
const RUN_CASES = {
  counter_signal: design('counter_signal', '  process\n  begin\n    for i in 0 to 20 loop\n      wait for 1 ns;\n      count <= count + 1;\n    end loop;\n    wait;\n  end process;\n', '  signal count : integer range 0 to 9 := 0;\n'),
  natural_negative: design('natural_negative', waitThen('    variable n : natural := 0;\n', '    n := n - 1;\n')),
  signal_length: design('signal_length', waitThen('', '    y <= a;\n'), `  signal a : ${SLV8} := x"AA";\n  signal y : std_logic_vector(3 downto 0);\n`),
  concurrent_length: design('concurrent_length', '  y <= a;\n', `  signal a : ${SLV8} := x"AA";\n  signal y : std_logic_vector(3 downto 0);\n`),
  to_integer_range: design('to_integer_range', waitThen('    variable u : unsigned(3 downto 0) := "1000";\n    variable idx : integer range 0 to 7;\n', '    idx := to_integer(u);\n')),
  memory_index: design('memory_index', waitThen('    variable addr : unsigned(3 downto 0) := "1000";\n', '    data <= mem(to_integer(addr));\n'), `  type mem_t is array (0 to 7) of ${SLV8};\n  signal mem : mem_t := (others => x"00");\n  signal data : ${SLV8};\n`),
  integer_32_bits: design('integer_32_bits', waitThen('    variable i : integer := 1;\n', '    for k in 0 to 40 loop\n      i := i * 2;\n    end loop;\n')),
  concatenation_length: design('concatenation_length', waitThen('', '    y <= a & b;\n'), '  signal a, b : std_logic_vector(3 downto 0) := x"5";\n  signal y : std_logic_vector(6 downto 0);\n'),
  enumeration_succ: design('enumeration_succ', waitThen('    variable s : state_t := done;\n', '    s := state_t\'succ(s);\n'), '  type state_t is (idle, run, done);\n'),
  loop_index: design('loop_index', waitThen(`    variable v : ${SLV8} := x"00";\n`, "    for i in 0 to 8 loop\n      v(i) := '1';\n    end loop;\n")),
  slice_below_zero: design('slice_below_zero', waitThen(`    variable v : ${SLV8} := x"00";\n    variable lo : integer := 0;\n    variable r : std_logic_vector(3 downto 0);\n`, '    lo := lo - 1;\n    r := v(lo + 3 downto lo);\n')),
  slice_direction: design('slice_direction', waitThen(`    variable v : ${SLV8} := x"00";\n    variable r : std_logic_vector(3 downto 0);\n    variable hi : integer := 3;\n`, '    r := v(0 to hi);\n')),
  slice_length: design('slice_length', waitThen(`    variable v : ${SLV8} := x"AA";\n    variable hi : integer := 7;\n    variable r : std_logic_vector(3 downto 0);\n`, '    r := v(hi downto 2);\n')),
  unsigned_sum_width: design('unsigned_sum_width', waitThen('    variable u : unsigned(7 downto 0) := x"10";\n    variable s : unsigned(3 downto 0);\n', '    s := u + 1;\n')),
  conversion_width: design('conversion_width', waitThen('', '    y <= std_logic_vector(to_unsigned(5, 8));\n'), '  signal y : std_logic_vector(3 downto 0);\n'),
  function_return: design('function_return', waitThen('    variable d : digit_t;\n', '    d := next_digit(9);\n'), '  subtype digit_t is integer range 0 to 9;\n  function next_digit(d : digit_t) return digit_t is\n  begin\n    return d + 1;\n  end function;\n'),
  generic_width: design('generic_width', waitThen('', '    y <= a;\n'), `  constant WIDTH : integer := 6;\n  signal a : ${SLV8} := x"AA";\n  signal y : std_logic_vector(WIDTH - 1 downto 0);\n`),
  division_by_zero: design('division_by_zero', waitThen('    variable a : integer := 10;\n    variable b : integer := 0;\n', '    a := a / b;\n')),
  static_slice: design('static_slice', '  y <= a(7 downto 4);\n', '  signal a : std_logic_vector(3 downto 0);\n  signal y : std_logic_vector(3 downto 0);\n'),
  static_slice_length: design('static_slice_length', '  y <= a(7 downto 2);\n', `  signal a : ${SLV8};\n  signal y : std_logic_vector(3 downto 0);\n`),
};

/** Mistakes analysis finds: a value of the wrong type, or a static value out of range. */
const ANALYSIS_CASES = {
  integer_to_vector: design('integer_to_vector', '  leds <= count;\n', `  signal count : integer := 0;\n  signal leds : ${SLV8};\n`),
  vector_to_integer: design('vector_to_integer', '  count <= sw;\n', `  signal count : integer := 0;\n  signal sw : ${SLV8};\n`),
  vector_to_unsigned: design('vector_to_unsigned', '  cnt <= sw;\n', `  signal cnt : unsigned(7 downto 0);\n  signal sw : ${SLV8};\n`),
  unsigned_to_vector: design('unsigned_to_vector', '  leds <= cnt;\n', `  signal cnt : unsigned(7 downto 0);\n  signal leds : ${SLV8};\n`),
  integer_to_unsigned: design('integer_to_unsigned', '  cnt <= n;\n', '  signal cnt : unsigned(7 downto 0);\n  signal n : integer;\n'),
  unsigned_to_integer: design('unsigned_to_integer', '  n <= cnt;\n', '  signal cnt : unsigned(7 downto 0);\n  signal n : integer;\n'),
  string_to_bit: design('string_to_bit', '  led <= "1";\n', '  signal led : std_logic;\n'),
  character_to_vector: design('character_to_vector', "  leds <= '1';\n", `  signal leds : ${SLV8};\n`),
  number_to_vector: design('number_to_vector', '  leds <= 5;\n', `  signal leds : ${SLV8};\n`),
  number_to_unsigned: design('number_to_unsigned', '  cnt <= 5;\n', '  signal cnt : unsigned(7 downto 0);\n'),
  number_to_bit: design('number_to_bit', '  led <= 1;\n', '  signal led : std_logic;\n'),
  vector_plus: design('vector_plus', '  leds <= sw + 1;\n', `  signal sw, leds : ${SLV8};\n`),
  condition_to_bit: design('condition_to_bit', '  led <= (a = b);\n', '  signal a, b : std_logic_vector(3 downto 0);\n  signal led : std_logic;\n'),
  bit_to_vector: design('bit_to_vector', '  leds <= led;\n', `  signal led : std_logic;\n  signal leds : ${SLV8};\n`),
  vector_to_bit: design('vector_to_bit', '  led <= sw;\n', `  signal led : std_logic;\n  signal sw : ${SLV8};\n`),
  std_logic_to_bit: design('std_logic_to_bit', '  b <= s;\n', '  signal b : bit;\n  signal s : std_logic;\n'),
  std_logic_to_integer: design('std_logic_to_integer', '  n <= s;\n', '  signal n : integer;\n  signal s : std_logic;\n'),
  vector_equals_number: design('vector_equals_number', "  led <= '1' when sw = 5 else '0';\n", '  signal sw : std_logic_vector(3 downto 0);\n  signal led : std_logic;\n'),
  vector_as_condition: design('vector_as_condition', "  process(sw)\n  begin\n    if sw then\n      led <= '1';\n    end if;\n  end process;\n", '  signal sw : std_logic_vector(3 downto 0);\n  signal led : std_logic;\n'),
  to_integer_of_vector: design('to_integer_of_vector', '  n <= to_integer(sw);\n', `  signal n : integer;\n  signal sw : ${SLV8};\n`),
  cast_integer_to_vector: design('cast_integer_to_vector', '  leds <= std_logic_vector(n);\n', `  signal n : integer;\n  signal leds : ${SLV8};\n`),
  cast_vector_to_integer: design('cast_vector_to_integer', '  n <= integer(sw);\n', `  signal n : integer;\n  signal sw : ${SLV8};\n`),
  variable_with_arrow: design('variable_with_arrow', waitThen('    variable v : integer;\n', '    v <= 1;\n')),
  signal_with_colon: design('signal_with_colon', "  process\n  begin\n    led := '1';\n    wait;\n  end process;\n", '  signal led : std_logic;\n'),
  signal_with_colon_outside: design('signal_with_colon_outside', "  led := '1';\n", '  signal led : std_logic;\n'),
  initial_too_long: design('initial_too_long', '', '  signal a : std_logic_vector(3 downto 0) := "10101";\n'),
  initial_out_of_range: design('initial_out_of_range', '', '  signal c : integer range 0 to 9 := 12;\n'),
  static_index: design('static_index', '  y <= a(8);\n', `  signal a : ${SLV8};\n  signal y : std_logic;\n`),
  static_slice_direction: design('static_slice_direction', '  y <= a(0 to 3);\n', `  signal a : ${SLV8};\n  signal y : std_logic_vector(3 downto 0);\n`),
  port_map_width: `${IEEE}entity sub is\n  port (a : in std_logic_vector(3 downto 0); y : out std_logic_vector(3 downto 0));\nend entity;\narchitecture rtl of sub is\nbegin\n  y <= a;\nend architecture;\n\nlibrary ieee;\nuse ieee.std_logic_1164.all;\nentity port_map_width is\nend entity;\narchitecture rtl of port_map_width is\n  signal big : ${SLV8};\n  signal y : std_logic_vector(3 downto 0);\nbegin\n  u1 : entity work.sub port map (a => big, y => y);\nend architecture;\n`,
};

const CASES = Object.entries({ ...STUDENT_EXAMPLES, ...RUN_CASES, ...ANALYSIS_CASES }).map(([id, source]) => ({ id, source }));

function usage() {
  console.error('usage: ghdl-range-corpus.mjs capture --ghdl <exe>\n       ghdl-range-corpus.mjs generate [--check] <capture.json>...');
  process.exit(2);
}

function optionValue(args, name) {
  const at = args.indexOf(name);
  return at < 0 ? undefined : args[at + 1];
}

const withoutCarriageReturns = (text) => `${text ?? ''}`.replace(/\r\n/g, '\n');

/** Runs one step; returns its exit code, stdout and stderr with Windows line endings removed. */
function step(ghdl, args, cwd) {
  const result = spawnSync(ghdl, args, { cwd, encoding: 'utf8' });
  return { code: result.status ?? -1, out: withoutCarriageReturns(result.stdout), err: withoutCarriageReturns(result.stderr) };
}

/**
 * The stage that failed and the text the browser gets about it: for analysis and
 * elaboration the stderr (the ERROR frame), for the run its stdout, where GHDL
 * prints a failed check and which the backend sends one LOG frame per line.
 */
function captureOne(ghdl, { id, source }) {
  const dir = mkdtempSync(join(tmpdir(), 'ghdl-range-'));
  try {
    const fileName = `${id}.vhd`;
    writeFileSync(join(dir, fileName), source);
    const steps = [
      ['analyze', ['-a', STANDARD, fileName]],
      ['elaborate', ['-e', STANDARD, id]],
      ['runtime', ['-r', STANDARD, id, STOP_TIME]],
    ];
    for (const [stage, args] of steps) {
      const { code, out, err } = step(ghdl, args, dir);
      if (code !== 0) return { id, fileName, stage, exitCode: code, output: stage === 'runtime' ? out : err };
    }
    return { id, fileName, stage: 'none', exitCode: 0, output: '' };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function capture(args) {
  // A path is resolved here: each step runs in its own temporary directory.
  const given = optionValue(args, '--ghdl') ?? usage();
  const ghdl = /[\\/]/.test(given) ? resolve(given) : given;
  const version = spawnSync(ghdl, ['--version'], { encoding: 'utf8' }).stdout.split(/\r?\n/)[0].trim();
  console.log(JSON.stringify({ version, captures: CASES.map((c) => captureOne(ghdl, c)) }, null, 2));
}

function readCaptures(files) {
  const runs = files.map((file) => JSON.parse(readFileSync(file, 'utf8')));
  const [first] = runs;
  for (const run of runs.slice(1)) {
    for (const [i, c] of run.captures.entries()) {
      if (c.output !== first.captures[i].output) throw new Error(`${run.version} differs from ${first.version} on ${c.id}`);
    }
  }
  return { versions: runs.map((run) => run.version), captures: first.captures };
}

function corpusText({ versions, captures }) {
  const sourceOf = new Map(CASES.map((c) => [c.id, c.source]));
  const cases = captures.map((c) => `  {\n    id: ${JSON.stringify(c.id)},\n    fileName: ${JSON.stringify(c.fileName)},\n    stage: ${JSON.stringify(c.stage)},\n    source: ${JSON.stringify(sourceOf.get(c.id))},\n    output: ${JSON.stringify(c.output)},\n  },`);
  return `// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

// GENERATED by tools/ghdl-range-corpus.mjs — do not edit by hand; re-run the tool.

/**
 * The measured corpus of docs/editor_diagnostics_range_and_type_advice.md: small
 * designs with one range or type mistake each, run as the backend runs a portless
 * design. \`output\` is what the browser gets about the step that failed
 * (\`stage\`): the body of the ERROR frame for analysis and elaboration, and for
 * the run GHDL's stdout, which arrives one LOG frame per line.
 */

export const RANGE_CORPUS_GHDL_VERSIONS: readonly string[] = ${JSON.stringify(versions)};

export interface RangeCorpusCase {
  readonly id: string;
  readonly fileName: string;
  readonly stage: 'analyze' | 'elaborate' | 'runtime' | 'none';
  readonly source: string;
  readonly output: string;
}

export const RANGE_CORPUS: readonly RangeCorpusCase[] = [
${cases.join('\n')}
];
`;
}

function generate(args) {
  const check = args.includes('--check');
  const files = args.filter((arg) => arg !== '--check');
  if (files.length === 0) usage();
  const text = corpusText(readCaptures(files));
  if (!check) {
    writeFileSync(CORPUS_TS, text);
    return;
  }
  const current = readFileSync(CORPUS_TS, 'utf8').replace(/\r\n/g, '\n');
  if (current !== text) {
    console.error(`${CORPUS_TS} is out of date; re-run generate.`);
    process.exit(1);
  }
}

const [command, ...rest] = process.argv.slice(2);
if (command === 'capture') capture(rest);
else if (command === 'generate') generate(rest);
else usage();
