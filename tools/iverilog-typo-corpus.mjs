// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * The measurement behind docs/editor_diagnostics_verilog_research.md § 2: applies
 * each beginner mistake of § 2.1 to the starter `blinkTest.v`, runs Icarus exactly
 * as the backend does (server/src/verilog/process.ts: bare file names, the file's
 * directory as cwd, `_hdlboard_ts.v` first), and keeps Icarus's complete stderr —
 * the text the browser gets:
 *
 *   step 1, `-tstub`: fails → an ERROR frame (its body is this stderr, trimmed);
 *   step 2, `-Wall`:  runs only when step 1 passed; fails → an ERROR frame,
 *                     passes → each warning line becomes a LOG line.
 *
 *   capture  — run one Icarus over the corpus and print the captures as JSON:
 *
 *       node tools/iverilog-typo-corpus.mjs capture --iverilog iverilog > icarus-13.json
 *
 *     With the bundled Windows tree (the backend passes it as -B):
 *
 *       node tools/iverilog-typo-corpus.mjs capture \
 *           --iverilog winInstaller/vendor/iverilog/iverilog.exe \
 *           --bundled  winInstaller/vendor/iverilog > icarus-13.json
 *
 *   generate — check that every capture file agrees (after \r\n → \n) and write
 *     src/components/workbench/diagnostics.verilog.corpus.ts; with --check, only
 *     report whether the committed file is up to date (exit 1 if not).
 *
 * Standalone on purpose (no build step, no dependencies), like ghdl-typo-corpus.mjs.
 */

import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const FIXTURES = join(root, 'tests', 'fixtures', 'verilog');
const CORPUS_TS = join(root, 'src', 'components', 'workbench', 'diagnostics.verilog.corpus.ts');

/** As server/src/verilog/fileNames.ts writes it. */
const TIMESCALE_FILE_NAME = '_hdlboard_ts.v';
const TIMESCALE_SOURCE = '`timescale 1ns/1ps\n';
const STUB_FILE_NAME = 'ports.stub';
const SIMULATION_FILE_NAME = 'sim.vvp';

/** Each base file, and the module the backend elaborates for it. */
const BASES = {
  'blinkTest.v': 'blinkTest',
  'DE1_SoC.v': 'DE1_SoC',
};

/**
 * Every case: which base file, and the edits — on 1-based line `line` of the base,
 * the first `from` becomes `to`. All edits name lines of the unedited base.
 */
const CASES = [
  // § 2.1 — misspelled keywords
  { id: 'module-typo', edits: [[6, 'module', 'modul']] },
  { id: 'input-typo', edits: [[8, 'input', 'inptu']] },
  { id: 'output-typo', edits: [[10, 'output', 'ouput']] },
  { id: 'wire-typo', edits: [[8, 'wire', 'wrie']] },
  { id: 'reg-typo', edits: [[29, 'reg', 'rge']] },
  { id: 'localparam-typo', edits: [[22, 'localparam', 'localparm']] },
  { id: 'always-typo', edits: [[31, 'always', 'alwyas']] },
  { id: 'assign-typo', edits: [[41, 'assign', 'assgin']] },
  { id: 'posedge-typo', edits: [[31, 'posedge', 'posedeg']] },
  { id: 'begin-typo', edits: [[31, 'begin', 'begn']] },
  { id: 'end-typo', edits: [[37, 'end', 'edn']] },
  { id: 'else-typo', edits: [[35, 'else', 'esle']] },
  { id: 'endmodule-typo', edits: [[51, 'endmodule', 'endmodul']] },
  // § 2.1 — missing or wrong punctuation, begin and end
  { id: 'endmodule-missing', edits: [[51, 'endmodule', '']] },
  { id: 'end-missing', edits: [[38, 'end', '']] },
  { id: 'begin-missing', edits: [[31, ' begin', '']] },
  { id: 'semicolon-assign', edits: [[41, ';', '']] },
  { id: 'semicolon-nonblocking', edits: [[33, ';', '']] },
  { id: 'semicolon-decl', edits: [[29, ';', '']] },
  { id: 'semicolon-localparam', edits: [[22, ';', '']] },
  { id: 'paren-missing', edits: [[31, 'CLOCK_500Hz)', 'CLOCK_500Hz']] },
  { id: 'assign-reversed', edits: [[33, '<=', '=<']] },
  { id: 'compare-assign', edits: [[32, '==', '=']] },
  // § 2.1 — undeclared names, reg/wire misuse
  { id: 'undeclared-counter', edits: [[36, 'counter + 1', 'conter + 1']] },
  { id: 'undeclared-led', edits: [[34, '~led_state', '~led_stat']] },
  { id: 'undeclared-clock', edits: [[31, 'CLOCK_500Hz', 'CLOCK_50Hz']] },
  { id: 'undeclared-port', edits: [[41, 'LEDR', 'LEDRR']] },
  { id: 'assign-to-reg', edits: [[41, 'assign LEDR', 'assign led_state']] },
  { id: 'wire-in-always', edits: [[29, 'reg       led_state', 'wire      led_state']] },
  // § 2.1 — joined keywords
  { id: 'elseif', edits: [[35, 'end else begin', 'end elseif begin']] },
  { id: 'endif', edits: [[37, 'end', 'endif']] },
  // § 2.1 — two mistakes in one file
  { id: 'two-mistakes', edits: [[31, 'always', 'alwyas'], [41, ';', '']] },
  { id: 'two-semantic', edits: [[36, 'counter + 1', 'conter + 1'], [41, 'LEDR', 'LEDRR']] },
  // docs/editor_diagnostics_implementation_plan.md A.7 — the markers plan's own case
  { id: 'de1soc-semicolon', base: 'DE1_SoC.v', edits: [[19, ';', '']] },
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

/** `-B<dir>` for a bundled tree, as `compilerFlags` in server/src/verilog/toolPaths.ts. */
function compilerFlags(bundled) {
  return bundled === undefined ? [] : [`-B${resolve(bundled)}`];
}

function iverilogVersion(iverilog, flags) {
  const result = spawnSync(iverilog, [...flags, '-V'], { encoding: 'utf8' });
  if (result.error) throw result.error;
  return withLf(result.stdout).split('\n')[0].trim();
}

/** The two steps of server/src/verilog/process.ts: stubArguments, then compileArguments. */
function stepArguments(flags, top, fileName) {
  const sources = [TIMESCALE_FILE_NAME, fileName];
  return {
    stub: [...flags, '-Wno-timescale', '-I.', '-s', top, '-tstub', '-o', STUB_FILE_NAME, ...sources],
    compile: [...flags, '-Wall', '-Wno-timescale', '-I.', '-s', top, '-o', SIMULATION_FILE_NAME, ...sources],
  };
}

function compile(iverilog, flags, fileName, source) {
  const dir = mkdtempSync(join(tmpdir(), 'iverilog-corpus-'));
  try {
    writeFileSync(join(dir, TIMESCALE_FILE_NAME), TIMESCALE_SOURCE, 'utf8');
    writeFileSync(join(dir, fileName), source, 'utf8');
    const run = (args) => {
      const result = spawnSync(iverilog, args, { cwd: dir, encoding: 'utf8' });
      if (result.error) throw result.error;
      return { exitCode: result.status, stderr: withLf(result.stderr) };
    };
    const steps = stepArguments(flags, BASES[fileName], fileName);
    const stub = run(steps.stub);
    return stub.exitCode !== 0 ? { step: 'stub', ...stub } : { step: 'compile', ...run(steps.compile) };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/** A path is made absolute, since each compile runs in its own directory; a bare name is looked up on PATH. */
function executable(name) {
  return /[\\/]/.test(name) ? resolve(name) : name;
}

function capture(args) {
  const iverilog = executable(option(args, '--iverilog') ?? 'iverilog');
  const flags = compilerFlags(option(args, '--bundled'));
  const bases = Object.fromEntries(
    Object.keys(BASES).map((name) => [name, withLf(readFileSync(join(FIXTURES, name), 'utf8'))]),
  );
  const cases = CASES.map(({ id, base = 'blinkTest.v', edits }) => ({
    id,
    ...compile(iverilog, flags, base, applyEdits(bases[base], edits)),
  }));
  process.stdout.write(`${JSON.stringify({ version: iverilogVersion(iverilog, flags), bases, cases }, null, 2)}\n`);
}

/** Captures must agree case by case; the first difference is reported and stops the run. */
function checkAgreement(captures) {
  const [first, ...others] = captures;
  for (const other of others) {
    for (const [i, { id, step, stderr }] of first.cases.entries()) {
      if (other.cases[i]?.stderr !== stderr || other.cases[i]?.step !== step) {
        throw new Error(`${id}: ${first.version} and ${other.version} print different text`);
      }
    }
  }
}

const literal = (text) => JSON.stringify(text);

function corpusModule(captures) {
  const [{ bases, cases }] = captures;
  const edits = new Map(CASES.map((c) => [c.id, c]));
  const rows = cases.map(({ id, step, exitCode, stderr }) => {
    const { base = 'blinkTest.v', edits: list } = edits.get(id);
    const editText = list.map(([line, from, to]) => `{ line: ${line}, from: ${literal(from)}, to: ${literal(to)} }`);
    return [
      '  {',
      `    id: ${literal(id)},`,
      `    fileName: ${literal(base)},`,
      `    edits: [${editText.join(', ')}],`,
      `    step: ${literal(step)},`,
      `    exitCode: ${exitCode},`,
      `    output: ${literal(stderr)},`,
      '  },',
    ].join('\n');
  });
  return `// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

// GENERATED by tools/iverilog-typo-corpus.mjs — do not edit by hand; re-run the tool.

/**
 * The measured corpus of docs/editor_diagnostics_verilog_research.md § 2 and
 * Appendix A: beginner mistakes applied to the starter blinkTest.v, each compiled
 * the way the backend does it. \`step\` is the last one that ran: \`stub\` (\`-tstub\`,
 * failed) or \`compile\` (\`-Wall\`, run only when the stub step passed). \`output\` is
 * Icarus's complete stderr: an ERROR frame body when \`exitCode\` is not 0, else
 * one LOG line per warning. Every version below printed exactly this text.
 */

export const VERILOG_CORPUS_ICARUS_VERSIONS: readonly string[] = ${literal(captures.map((c) => c.version))};

/** The unedited files the edits apply to. */
export const VERILOG_CORPUS_BASES: Readonly<Record<string, string>> = {
${Object.entries(bases).map(([name, text]) => `  ${literal(name)}: ${literal(text)},`).join('\n')}
};

/** On 1-based \`line\` of the base, the first \`from\` becomes \`to\`. */
export interface VerilogCorpusEdit {
  readonly line: number;
  readonly from: string;
  readonly to: string;
}

export interface VerilogCorpusCase {
  readonly id: string;
  readonly fileName: string;
  readonly edits: readonly VerilogCorpusEdit[];
  readonly step: 'stub' | 'compile';
  readonly exitCode: number;
  readonly output: string;
}

export const VERILOG_CORPUS: readonly VerilogCorpusCase[] = [
${rows.join('\n')}
];

/** The source Icarus compiled for one case: every edit names a line of the unedited base. */
export function verilogCorpusSource(corpusCase: VerilogCorpusCase): string {
  const lines = VERILOG_CORPUS_BASES[corpusCase.fileName].split('\\n');
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
  console.error('usage: iverilog-typo-corpus.mjs capture [--iverilog <exe>] [--bundled <dir>]');
  console.error('       iverilog-typo-corpus.mjs generate <capture.json>... [--check]');
  process.exitCode = 2;
}
