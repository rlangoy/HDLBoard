// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * The measurement behind docs/editor_diagnostics_improvement_plan.md § 2: applies
 * each beginner mistake of § 2.2 and § 2.5 to the starter `blinkTest.vhdl`, runs
 * `ghdl -a --std=08` on it exactly as the backend does (bare file name, the file's
 * directory as cwd), and keeps GHDL's complete stderr — the text the browser gets
 * in an ERROR frame.
 *
 *   capture  — run one GHDL over the corpus and print the captures as JSON:
 *
 *       node tools/ghdl-typo-corpus.mjs capture --ghdl /usr/bin/ghdl > ghdl-5.json
 *
 *     In the Docker image (GHDL 6.0.0), the tool and the fixture are both there once
 *     the tool is copied in:
 *
 *       docker compose cp tools/ghdl-typo-corpus.mjs backend:/tmp/
 *       docker compose exec -T backend node /tmp/ghdl-typo-corpus.mjs capture \
 *           --ghdl /usr/local/bin/ghdl \
 *           --source /srv/HDLBoard/tests/fixtures/vhdl/blinkTest.vhdl > ghdl-6.json
 *
 *   generate — check that every capture file agrees (after \r\n → \n) and write
 *     src/components/workbench/diagnostics.corpus.ts; with --check, only report
 *     whether the committed file is up to date (exit 1 if not):
 *
 *       node tools/ghdl-typo-corpus.mjs generate ghdl-5.json ghdl-6.json
 *
 * Standalone on purpose (no build step, no dependencies), like verify-backend.mjs.
 */

import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_SOURCE = join(root, 'tests', 'fixtures', 'vhdl', 'blinkTest.vhdl');
const CORPUS_TS = join(root, 'src', 'components', 'workbench', 'diagnostics.corpus.ts');

/** The small file of § 2.4 / Appendix A.13: the line under test goes on line 3. */
const COLUMN_BASE = 'entity t is end;\narchitecture a of t is\n\nbegin end;\n';
const COLUMN_TAIL = 'signal counter : integer rttange 0 to 9 := 0;';

/** Twelve sequential statements, so the `end process` of the endif case lands on line 60 (§ 2.5). */
const TWELVE_STATEMENTS = Array.from({ length: 12 }, () => '        led_state <= led_state;').join('\n');

/**
 * Every case: which base file, and the edits — on 1-based line `line` of the base,
 * the first `from` becomes `to` (`from: ''` inserts at the start of the line). All
 * edits name lines of the unedited base.
 */
const CASES = [
  // § 2.2 — one mistake at a time
  { id: 'range-typo', edits: [[33, 'range', 'rttange']] },
  { id: 'range-underscore', edits: [[33, 'range', 'ra_nge']] },
  { id: 'range-swap', edits: [[33, 'range', 'rnage']] },
  { id: 'downto-typo', edits: [[13, 'downto', 'dwonto']] },
  { id: 'signal-typo', edits: [[34, 'signal', 'signl']] },
  { id: 'process-typo', edits: [[38, 'process', 'proces']] },
  { id: 'begin-typo', edits: [[39, 'begin', 'begn']] },
  { id: 'then-typo', edits: [[40, 'then', 'than']] },
  { id: 'then-missing', edits: [[40, ' then', '']] },
  { id: 'endif-joined', edits: [[46, 'end if', 'endif']] },
  { id: 'architecture-typo', edits: [[25, 'architecture', 'architecure']] },
  { id: 'entity-typo', edits: [[10, 'entity', 'entitiy']] },
  { id: 'is-missing', edits: [[25, ' is', '']] },
  { id: 'mode-typo', edits: [[12, 'in  ', 'inn ']] },
  { id: 'others-typo', edits: [[51, 'others', 'other']] },
  { id: 'semicolon-missing', edits: [[33, ':= 0;', ':= 0']] },
  { id: 'semicolon-missing-assign', edits: [[42, '<= 0;', '<= 0']] },
  { id: 'assign-reversed', edits: [[42, '<=', '=<']] },
  { id: 'const-assign', edits: [[31, ':=', '=']] },
  { id: 'type-typo', edits: [[34, 'std_logic', 'std_logc']] },
  { id: 'function-typo', edits: [[40, 'rising_edge', 'rising_egde']] },
  { id: 'signal-name-typo', edits: [[45, 'counter + 1', 'couter + 1']] },
  // § 2.5 — two mistakes in one file
  { id: 'range-typo+assign-reversed', edits: [[33, 'range', 'rttange'], [42, '<=', '=<']] },
  { id: 'signal-typo+then-missing', edits: [[34, 'signal', 'signl'], [40, ' then', '']] },
  { id: 'then-missing+semicolon-missing-51', edits: [[40, ' then', ''], [51, ';', '']] },
  { id: 'downto-typo+then-typo', edits: [[13, 'downto', 'dwonto'], [40, 'then', 'than']] },
  { id: 'process-typo+semicolon-missing-51', edits: [[38, 'process', 'proces'], [51, ';', '']] },
  { id: 'signal-typo+signal-name-typo', edits: [[34, 'signal', 'signl'], [45, 'counter + 1', 'couter + 1']] },
  { id: 'signal-name-typo+others-typo', edits: [[45, 'counter + 1', 'couter + 1'], [51, 'others', 'other']] },
  { id: 'endif-far', edits: [[46, 'end if', 'endif'], [47, 'end if;', `end if;\n${TWELVE_STATEMENTS}`]] },
  { id: 'signed-downto-typo', edits: [[34, "'0';", "'0'; signal acc : signed(7 dwonto 0);"]] },
  // § 6.2 guards
  { id: 'range-typo+end-name-typo', edits: [[33, 'range', 'rttange'], [53, 'architecture;', 'architecture rtll;']] },
  { id: 'signal-first-letter', edits: [[34, 'signal', 'zignal']] },
  // § 2.4 / A.13 — how GHDL counts columns
  { id: 'column-4-spaces', base: 't.vhdl', edits: [[3, '', `    ${COLUMN_TAIL}`]] },
  { id: 'column-1-tab', base: 't.vhdl', edits: [[3, '', `\t${COLUMN_TAIL}`]] },
  { id: 'column-2-tabs', base: 't.vhdl', edits: [[3, '', `\t\t${COLUMN_TAIL}`]] },
  { id: 'column-2-spaces-tab', base: 't.vhdl', edits: [[3, '', `  \t${COLUMN_TAIL}`]] },
  { id: 'column-ascii-string', base: 't.vhdl', edits: [[3, '', `    constant S : string := "o"; ${COLUMN_TAIL}`]] },
  { id: 'column-utf8-string', base: 't.vhdl', edits: [[3, '', `    constant S : string := "ø"; ${COLUMN_TAIL}`]] },
];

const withLf = (text) => text.replace(/\r\n/g, '\n');

function applyEdits(base, edits) {
  const lines = base.split('\n');
  for (const [line, from, to] of edits) {
    const index = line - 1;
    if (!lines[index].includes(from)) throw new Error(`line ${line} has no "${from}": ${lines[index]}`);
    lines[index] = lines[index].replace(from, to);
  }
  return lines.join('\n');
}

function option(args, name) {
  const at = args.indexOf(name);
  return at >= 0 ? args[at + 1] : undefined;
}

function ghdlVersion(ghdl) {
  const result = spawnSync(ghdl, ['--version'], { encoding: 'utf8' });
  if (result.error) throw result.error;
  return withLf(result.stdout).split('\n')[0];
}

function analyze(ghdl, fileName, source) {
  const dir = mkdtempSync(join(tmpdir(), 'ghdl-corpus-'));
  try {
    writeFileSync(join(dir, fileName), source, 'utf8');
    const result = spawnSync(ghdl, ['-a', '--std=08', fileName], { cwd: dir, encoding: 'utf8' });
    if (result.error) throw result.error;
    return { exitCode: result.status, stderr: withLf(result.stderr) };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function capture(args) {
  const ghdl = option(args, '--ghdl') ?? 'ghdl';
  const bases = {
    'blinkTest.vhdl': withLf(readFileSync(option(args, '--source') ?? DEFAULT_SOURCE, 'utf8')),
    't.vhdl': COLUMN_BASE,
  };
  const cases = CASES.map(({ id, base = 'blinkTest.vhdl', edits }) => ({
    id,
    ...analyze(ghdl, base, applyEdits(bases[base], edits)),
  }));
  process.stdout.write(`${JSON.stringify({ version: ghdlVersion(ghdl), bases, cases }, null, 2)}\n`);
}

/** Captures must agree case by case; the first difference is reported and stops the run. */
function checkAgreement(captures) {
  const [first, ...others] = captures;
  for (const other of others) {
    for (const [i, { id, stderr }] of first.cases.entries()) {
      if (other.cases[i]?.stderr !== stderr) {
        throw new Error(`${id}: ${first.version} and ${other.version} print different text`);
      }
    }
  }
}

const literal = (text) => JSON.stringify(text);

function corpusModule(captures) {
  const [{ bases, cases }] = captures;
  const edits = new Map(CASES.map((c) => [c.id, c]));
  const rows = cases.map(({ id, exitCode, stderr }) => {
    const { base = 'blinkTest.vhdl', edits: list } = edits.get(id);
    const editText = list.map(([line, from, to]) => `{ line: ${line}, from: ${literal(from)}, to: ${literal(to)} }`);
    return [
      '  {',
      `    id: ${literal(id)},`,
      `    fileName: ${literal(base)},`,
      `    edits: [${editText.join(', ')}],`,
      `    exitCode: ${exitCode},`,
      `    output: ${literal(stderr)},`,
      '  },',
    ].join('\n');
  });
  return `// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

// GENERATED by tools/ghdl-typo-corpus.mjs — do not edit by hand; re-run the tool.

/**
 * The measured corpus of docs/editor_diagnostics_improvement_plan.md § 2 and
 * Appendix A: beginner mistakes applied to the starter blinkTest.vhdl, each
 * analysed with \`ghdl -a --std=08\` the way the backend runs it. \`output\` is
 * GHDL's complete stderr, which the browser receives as an ERROR frame body.
 * Every version below printed exactly this text.
 */

export const CORPUS_GHDL_VERSIONS: readonly string[] = ${literal(captures.map((c) => c.version))};

/** The unedited files the edits apply to. */
export const CORPUS_BASES: Readonly<Record<string, string>> = {
${Object.entries(bases).map(([name, text]) => `  ${literal(name)}: ${literal(text)},`).join('\n')}
};

/** On 1-based \`line\` of the base, the first \`from\` becomes \`to\`. */
export interface CorpusEdit {
  readonly line: number;
  readonly from: string;
  readonly to: string;
}

export interface CorpusCase {
  readonly id: string;
  readonly fileName: string;
  readonly edits: readonly CorpusEdit[];
  readonly exitCode: number;
  readonly output: string;
}

export const CORPUS: readonly CorpusCase[] = [
${rows.join('\n')}
];

/** The source GHDL analysed for one case: every edit names a line of the unedited base. */
export function corpusSource(corpusCase: CorpusCase): string {
  const lines = CORPUS_BASES[corpusCase.fileName].split('\\n');
  for (const { line, from, to } of corpusCase.edits) lines[line - 1] = lines[line - 1].replace(from, to);
  return lines.join('\\n');
}
`;
}

function generate(args) {
  const files = args.filter((a) => !a.startsWith('--'));
  if (files.length === 0) throw new Error('generate needs at least one capture file');
  const captures = files.map((file) => JSON.parse(readFileSync(file, 'utf8')));
  checkAgreement(captures);
  const text = corpusModule(captures);
  if (!args.includes('--check')) {
    writeFileSync(CORPUS_TS, text, 'utf8');
    console.log(`wrote ${CORPUS_TS} (${captures.map((c) => c.version).join('; ')})`);
    return;
  }
  const current = readFileSync(CORPUS_TS, 'utf8');
  console.log(current === text ? 'corpus is up to date' : 'corpus differs from the captures');
  process.exitCode = current === text ? 0 : 1;
}

const [command, ...args] = process.argv.slice(2);
if (command === 'capture') capture(args);
else if (command === 'generate') generate(args);
else {
  console.error('usage: ghdl-typo-corpus.mjs capture --ghdl <exe> [--source <blinkTest.vhdl>]');
  console.error('       ghdl-typo-corpus.mjs generate <capture.json>... [--check]');
  process.exitCode = 2;
}
