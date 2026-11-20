// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import { describe, expect, test } from 'vitest';
import type { SynthResult } from '../../hdlClient';
import type { SourceFile } from '../../tbDetect/analyzeProject';
import { EMPTY_OVERRIDES, type TestbenchOverrides } from '../../tbDetect/types';
import { DESIGN_CHECKS } from '../designCheck';
import { checkDiagnostics } from '../findingDiagnostics';
import { simOnlyBadgeText } from '../simOnlyReport';
import { BLINK, BOARD_PORTS, source, vhdlDesign, vhdlDesignWith, viewOf } from '../simOnly.testSupport';
import type { ToolFinding } from '../types';
import { cacheKey, ToolCheckCache } from './cache';
import { CheckSession, type CheckRun } from './checkSession';
import { classifyAnswer } from './classify';
import { checkTarget } from './targets';
import { fitsFiles, placeAnswer, shownFindings, withToolFindings, type ToolCheckResult } from './toolFindings';
import { consoleLines } from './useToolCheck';

/** GHDL's synthesis check at Start, from target to warnings (docs/impl_sim_only_warnings.md § 7). */

/** A board design whose combinational process keeps `q` without an `else`: GHDL names the latch on line 7, its declaration. */
const LATCH = vhdlDesignWith(
  'signal q : std_logic;',
  vhdlDesign('top', BOARD_PORTS, "process (SW)\nbegin\n  if SW(1) = '1' then\n    q <= SW(0);\n  end if;\nend process;\nLEDR <= (9 downto 1 => '0') & q;"),
);
const LATCH_TEXT = 'top.vhd:7:10:error: latch infered for net "q" (use --latches)\n';

const COUNTER = vhdlDesign('counter', 'q : out std_logic', "q <= '1';");
const COUNTER_TB =
  'entity counter_tb is\nend entity;\narchitecture sim of counter_tb is\n  signal q : bit;\nbegin\n  dut : entity work.counter port map (q => q);\n  process begin wait for 10 ns; wait; end process;\nend architecture;\n';
const LONELY_TB = 'entity lonely_tb is\nend entity;\narchitecture sim of lonely_tb is\nbegin\n  process begin wait for 10 ns; wait; end process;\nend architecture;\n';
const PACKAGE = 'library ieee;\nuse ieee.std_logic_1164.all;\npackage defs is\n  constant WIDTH : natural := 10;\nend package;\n';
const VERILOG_TOP = 'module blink (input wire CLOCK_50, output wire [9:0] LEDR);\n  assign LEDR = 0;\nendmodule\n';

const runOf = (files: readonly SourceFile[]) => files.map(({ id, name, content }) => ({ id, name, content }));
const marked = (fields: Partial<TestbenchOverrides>): TestbenchOverrides => ({ ...EMPTY_OVERRIDES, ...fields });

function targetOf(files: readonly SourceFile[], topFileId: string | null, overrides: TestbenchOverrides = EMPTY_OVERRIDES) {
  return checkTarget({ view: viewOf(files, overrides), overrides, runFiles: runOf(files), topFileId, unitName: null });
}

describe('what the check checks', () => {
  test('a board run: its top, with every file but a testbench alone; packages stay', () => {
    const files = [source('top.vhd', LATCH), source('defs.vhd', PACKAGE), source('lonely_tb.vhd', LONELY_TB)];
    expect(targetOf(files, 'top.vhd')).toEqual({ kind: 'check', target: { top: 'top', topFileId: 'top.vhd', fileIds: ['top.vhd', 'defs.vhd'] } });
  });

  test('a testbench run: the design it tests, never the testbench', () => {
    const files = [source('counter_tb.vhd', COUNTER_TB), source('counter.vhd', COUNTER)];
    expect(targetOf(files, 'counter_tb.vhd')).toEqual({ kind: 'check', target: { top: 'counter', topFileId: 'counter.vhd', fileIds: ['counter.vhd'] } });
  });

  test('a testbench file the student marked Treat as design is read', () => {
    const files = [source('top.vhd', LATCH), source('lonely_tb.vhd', LONELY_TB)];
    const choice = targetOf(files, 'top.vhd', marked({ roles: { 'lonely_tb.vhd': 'rtl' } }));
    expect(choice.kind === 'check' && choice.target.fileIds).toEqual(['top.vhd', 'lonely_tb.vhd']);
  });

  interface SkipRow {
    readonly label: string;
    readonly files: readonly SourceFile[];
    readonly topFileId: string | null;
    readonly overrides: TestbenchOverrides;
    readonly reason: string;
  }

  test.each<SkipRow>([
    { label: 'a testbench that tests nothing HDLBoard finds', files: [source('lonely_tb.vhd', LONELY_TB)], topFileId: 'lonely_tb.vhd', overrides: EMPTY_OVERRIDES, reason: 'noDut' },
    { label: 'a unit two files declare', files: [source('top.vhd', LATCH), source('top_copy.vhd', LATCH)], topFileId: 'top.vhd', overrides: EMPTY_OVERRIDES, reason: 'ambiguous' },
    { label: 'a run with a configuration', files: [source('top.vhd', LATCH), source('conf.vhd', 'configuration c of top is\n  for rtl\n  end for;\nend configuration;\n')], topFileId: 'top.vhd', overrides: EMPTY_OVERRIDES, reason: 'ambiguous' },
    { label: 'a Simulation model', files: [source('top.vhd', LATCH)], topFileId: 'top.vhd', overrides: marked({ simModels: { 'top.vhd': true } }), reason: 'sim-model' },
    { label: 'a design treated as testbench', files: [source('top.vhd', LATCH)], topFileId: 'top.vhd', overrides: marked({ roles: { 'top.vhd': 'tb' } }), reason: 'treated-as-testbench' },
    { label: 'a Verilog run (the check is VHDL only)', files: [source('blink.v', VERILOG_TOP)], topFileId: 'blink.v', overrides: EMPTY_OVERRIDES, reason: 'not-vhdl' },
    { label: 'a run with no top marked', files: [source('top.vhd', LATCH)], topFileId: null, overrides: EMPTY_OVERRIDES, reason: 'noTop' },
  ])('$label is not checked', ({ files, topFileId, overrides, reason }) => {
    expect(targetOf(files, topFileId, overrides)).toEqual({ kind: 'skip', reason });
  });
});

/** GHDL's answer for `files`, placed as the page places it. */
function answerFor(files: readonly SourceFile[], text: string, overrides: TestbenchOverrides = EMPTY_OVERRIDES): ToolCheckResult {
  const answer = classifyAnswer({ kind: 'exit', code: text === '' ? 0 : 1 }, text);
  return placeAnswer({ top: 'top', answer, files: runOf(files), view: viewOf(files, overrides) });
}

describe('an answer placed in the code', () => {
  const files = [source('top.vhd', LATCH)];

  test('puts a finding on the line GHDL names, in its unit', () => {
    const [finding] = answerFor(files, LATCH_TEXT).findings;
    expect([finding?.fileId, finding?.line, finding?.unitName, finding?.tier]).toEqual(['top.vhd', 7, 'top', 'ignored']);
  });

  test("keeps GHDL's own message", () => {
    expect(answerFor(files, LATCH_TEXT).findings[0]?.toolMessage).toBe('latch infered for net "q" (use --latches)');
  });

  test('says a message outside every unit for the design: a package before the entity', () => {
    const result = answerFor([source('top.vhd', `${PACKAGE}${LATCH}`)], 'top.vhd:4:3:error: variable with access type is not synthesizable\n');
    expect([result.findings, result.designMessages]).toEqual([[], ['variable with access type is not synthesizable']]);
  });

  test('drops a message in code hidden from synthesis', () => {
    const guarded = vhdlDesign('top', BOARD_PORTS, 'LEDR <= SW;\n-- synthesis translate_off\nprocess begin\n  wait;\nend process;\n-- synthesis translate_on');
    const result = answerFor([source('top.vhd', guarded)], 'top.vhd:12:3:error: wait statement not allowed for synthesis\n');
    expect([result.findings, result.designMessages]).toEqual([[], []]);
  });

  test('places nothing when the project was analysed from other text', () => {
    const answer = classifyAnswer({ kind: 'exit', code: 1 }, LATCH_TEXT);
    const edited = [source('top.vhd', `-- edited\n${LATCH}`)];
    expect(placeAnswer({ top: 'top', answer, files: runOf(files), view: viewOf(edited) }).findings).toEqual([]);
  });

  test.each([
    ['fits the code it checked', LATCH, true],
    ['does not fit after an edit', `${LATCH}\n`, false],
  ])('%s', (_label, content, fits) => {
    expect(fitsFiles(answerFor(files, LATCH_TEXT), [{ id: 'top.vhd', content }])).toBe(fits);
  });
});

const checkWith = (files: readonly SourceFile[], toolFindings: readonly ToolFinding[], overrides: TestbenchOverrides = EMPTY_OVERRIDES) =>
  DESIGN_CHECKS.synthesis({ view: viewOf(files, overrides), overrides, toolFindings });

describe('the groups with GHDL\'s findings', () => {
  const files = [source('top.vhd', LATCH)];
  const latch = answerFor(files, LATCH_TEXT).findings;

  test('the latch design is RTL to the live check alone', () => {
    expect(checkWith(files, []).groups.byFile.get('top.vhd')).toBe('rtl');
  });

  test('a GHDL latch makes it SIM-only', () => {
    expect(checkWith(files, latch).groups.byFile.get('top.vhd')).toBe('sim-only');
  });

  test('the badge names the latch as GHDL\'s', () => {
    expect(simOnlyBadgeText(checkWith(files, latch), EMPTY_OVERRIDES, 'top.vhd')?.detected).toBe('Detected: SIM-only design — latch (GHDL) (line 7)');
  });

  test('a pass never clears a live finding: the blink example stays SIM-only (D3)', () => {
    expect(checkWith([source('blink.vhd', BLINK)], []).groups.byFile.get('blink.vhd')).toBe('sim-only');
  });

  test('a file marked Treat as testbench since the check: its findings count no more', () => {
    expect(checkWith(files, latch, marked({ roles: { 'top.vhd': 'tb' } })).groups.byFile.get('top.vhd')).toBe('tb');
  });

  test('a Simulation model keeps its SIM-only label', () => {
    const overrides = marked({ simModels: { 'top.vhd': true } });
    expect(checkWith(files, answerFor(files, LATCH_TEXT, overrides).findings, overrides).groups.byFile.get('top.vhd')).toBe('sim-only');
  });

  test('a Simulation model gets no warning from the check', () => {
    const overrides = marked({ simModels: { 'top.vhd': true } });
    expect(shownFindings(answerFor(files, LATCH_TEXT, overrides).findings, viewOf(files, overrides), overrides)).toEqual([]);
  });

  test('two drivers warn, and the group stays RTL', () => {
    const drivers = answerFor(files, 'top.vhd:15:1:error: multiple assignments for "LEDR" offsets 0:0\n').findings;
    expect(checkWith(files, drivers).groups.byFile.get('top.vhd')).toBe('rtl');
  });
});

describe('GHDL\'s warnings with the live ones', () => {
  const files = [source('blink.vhd', BLINK)];
  const view = viewOf(files);
  const live = checkDiagnostics(DESIGN_CHECKS.synthesis({ view, overrides: EMPTY_OVERRIDES }), { analysis: view.raw, overrides: EMPTY_OVERRIDES, files: runOf(files) });
  const liveLine = live[0]?.line ?? 0;
  const onLiveLine = answerFor(files, `blink.vhd:${liveLine}:3:error: wait statement not allowed for synthesis\n`).findings;
  const onOtherLine = answerFor(files, 'blink.vhd:9:1:error: signal assignment not allowed here\n').findings;

  test('a finding on a live warning\'s line adds no warning', () => {
    expect(withToolFindings(live, onLiveLine)).toHaveLength(live.length);
  });

  test('it is a detail of that warning, naming GHDL', () => {
    expect(withToolFindings(live, onLiveLine)[0]?.details).toEqual(['GHDL synthesis check: wait statement not allowed for synthesis']);
  });

  test('a finding on another line is a warning of its own, naming its source and keeping GHDL\'s text', () => {
    const own = withToolFindings(live, onOtherLine).at(-1);
    expect([own?.line, own?.advice?.compiler, own?.details]).toEqual([9, 'GHDL synthesis check', ['GHDL: signal assignment not allowed here']]);
  });

  test('which says what it means for the board', () => {
    expect(withToolFindings(live, onOtherLine).at(-1)?.message).toMatch(/^Cannot be synthesized:/);
  });
});

describe('the answer cache', () => {
  const files = runOf([source('top.vhd', LATCH)]);
  const target = { top: 'top', topFileId: 'top.vhd', fileIds: ['top.vhd'] };
  const key = cacheKey({ target, files, compilerOptions: {}, backend: 'ws://localhost:9010/hdlsim' });
  const answer = (reason?: ToolCheckResult['reason']): ToolCheckResult => ({
    top: 'top', status: reason ? 'unverified' : 'passed', ...(reason && { reason }), files, findings: [], designMessages: [],
  });
  const cacheWith = (result: ToolCheckResult, limit?: number) => {
    const cache = new ToolCheckCache(limit);
    cache.set(key, result);
    return cache;
  };

  test('gives the answer back for exactly the same files', () => {
    expect(cacheWith(answer()).get(key, files)).toEqual(answer());
  });

  test('gives nothing back for edited files', () => {
    expect(cacheWith(answer()).get(key, [{ ...files[0], content: `${LATCH}\n` }])).toBeUndefined();
  });

  test.each([
    ['the options', { compilerOptions: { ghdl: { synopsys: true } } }],
    ['the backend', { backend: 'wss://example.org/hdlsim' }],
    ['the top', { target: { ...target, top: 'other' } }],
  ])('changes its key with %s', (_label, change) => {
    expect(cacheKey({ target, files, compilerOptions: {}, backend: 'ws://localhost:9010/hdlsim', ...change })).not.toBe(key);
  });

  test('keeps no answer that says nothing about the code: a timeout is tried again', () => {
    expect(cacheWith(answer('timeout')).get(key, files)).toBeUndefined();
  });

  test("keeps GHDL's own unknown message", () => {
    expect(cacheWith(answer('tool-error')).get(key, files)).toBeDefined();
  });

  test('lets the answer used longest ago go when full', () => {
    const cache = cacheWith(answer(), 1);
    cache.set('other', answer());
    expect(cache.get(key, files)).toBeUndefined();
  });
});

describe('a check session', () => {
  const files = [source('top.vhd', LATCH)];
  const run: CheckRun = { runFiles: runOf(files), topFileId: 'top.vhd', unitName: null, compilerOptions: {}, backend: 'ws://test' };
  const project = { view: viewOf(files), overrides: EMPTY_OVERRIDES };
  const latchAnswer = (id: number): SynthResult => ({ id, outcome: { kind: 'exit', code: 1 }, text: LATCH_TEXT });
  const askedId = (session: CheckSession) => {
    const outcome = session.start(run, project);
    return outcome.kind === 'ask' ? outcome.request.id : -1;
  };

  test('asks for the top and the files it reads', () => {
    expect(new CheckSession().start(run, project)).toEqual({ kind: 'ask', request: { id: 1, top: 'top', files: ['top.vhd'] } });
  });

  test('places the answer to the check it asked for', () => {
    const session = new CheckSession();
    expect(session.answer(latchAnswer(askedId(session)), project.view)?.status).toBe('found');
  });

  test('drops the answer to an older check', () => {
    const session = new CheckSession();
    const older = askedId(session);
    askedId(session);
    expect(session.answer(latchAnswer(older), project.view)).toBeUndefined();
  });

  test('drops an answer once the check was switched off', () => {
    const session = new CheckSession();
    const id = askedId(session);
    session.forget();
    expect(session.answer(latchAnswer(id), project.view)).toBeUndefined();
  });

  test('says nothing for a run that never started', () => {
    const session = new CheckSession();
    expect(session.answer({ id: askedId(session), outcome: { kind: 'skipped' }, text: '' }, project.view)).toBeUndefined();
  });

  test('at the next Start on unchanged code, gives the last answer without asking again', () => {
    const session = new CheckSession();
    session.answer(latchAnswer(askedId(session)), project.view);
    expect(session.start(run, project).kind).toBe('known');
  });

  test('asks again after a timeout', () => {
    const session = new CheckSession();
    session.answer({ id: askedId(session), outcome: { kind: 'timeout' }, text: '' }, project.view);
    expect(session.start(run, project).kind).toBe('ask');
  });
});

describe('the console lines of an answer', () => {
  const files = [source('top.vhd', LATCH)];
  const project = { view: viewOf(files), overrides: EMPTY_OVERRIDES };
  const lines = consoleLines(answerFor(files, LATCH_TEXT + LATCH_TEXT.replace('error: latch', 'error: Latch')), project);

  test('say what the answer means, then each line once, linked', () => {
    expect(lines).toEqual([
      { text: 'GHDL synthesis check of top: 1 line cannot be built as written.' },
      { text: '  top.vhd: Synthesis makes a latch here: a value is kept without a clock edge.', at: { fileId: 'top.vhd', line: 7 } },
    ]);
  });

  test('of a pass say GHDL is not Quartus', () => {
    expect(consoleLines(answerFor(files, ''), project)[0]?.text).toContain('GHDL is not Quartus');
  });
});
