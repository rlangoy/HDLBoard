// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import { describe, expect, test } from 'vitest';
import type { SourceFile } from '../../tbDetect/analyzeProject';
import { EMPTY_OVERRIDES, type TestbenchOverrides } from '../../tbDetect/types';
import { DESIGN_CHECKS } from '../designCheck';
import { checkDiagnostics } from '../findingDiagnostics';
import { simOnlyBadgeText } from '../simOnlyReport';
import { BLINK, BOARD_PORTS, source, vhdlDesign, vhdlDesignWith, viewOf } from '../simOnly.testSupport';
import type { ToolFinding } from '../types';
import { cacheKey, ToolCheckCache } from './cache';
import { classifyAnswer } from './classify';
import { checkTarget } from './targets';
import { fitsFiles, placeAnswer, shownFindings, withToolFindings, type ToolCheckResult } from './toolFindings';

/** The synthesis check at Start, from target to warnings (docs/impl_sim_only_warnings.md § 7). */

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

const runOf = (files: readonly SourceFile[]) => files.map(({ id, name, content }) => ({ id, name, content }));

function targetOf(files: readonly SourceFile[], topFileId: string | null, overrides: TestbenchOverrides = EMPTY_OVERRIDES) {
  return checkTarget({ view: viewOf(files, overrides), overrides, runFiles: runOf(files), topFileId, unitName: null });
}

describe('what the check checks', () => {
  test('a board run: its top, with every file but a testbench alone; packages stay', () => {
    const files = [source('top.vhd', LATCH), source('defs.vhd', PACKAGE), source('lonely_tb.vhd', LONELY_TB)];
    expect(targetOf(files, 'top.vhd')).toEqual({
      kind: 'check',
      target: { tool: 'ghdl', top: 'top', topFileId: 'top.vhd', fileIds: ['top.vhd', 'defs.vhd'] },
    });
  });

  test('a testbench run: the design it tests, never the testbench', () => {
    const files = [source('counter_tb.vhd', COUNTER_TB), source('counter.vhd', COUNTER)];
    expect(targetOf(files, 'counter_tb.vhd')).toEqual({
      kind: 'check',
      target: { tool: 'ghdl', top: 'counter', topFileId: 'counter.vhd', fileIds: ['counter.vhd'] },
    });
  });

  test('a testbench that tests nothing HDLBoard finds is not checked, and says so', () => {
    expect(targetOf([source('lonely_tb.vhd', LONELY_TB)], 'lonely_tb.vhd')).toEqual({ kind: 'skip', reason: 'noDut' });
  });

  test('a unit two files declare is not checked: the tool might take the other', () => {
    const files = [source('top.vhd', LATCH), source('top_copy.vhd', LATCH)];
    expect(targetOf(files, 'top.vhd')).toEqual({ kind: 'skip', reason: 'ambiguous' });
  });

  test('a VHDL configuration in the run decides what is built: not checked', () => {
    const files = [source('top.vhd', LATCH), source('conf.vhd', 'configuration c of top is\n  for rtl\n  end for;\nend configuration;\n')];
    expect(targetOf(files, 'top.vhd')).toEqual({ kind: 'skip', reason: 'ambiguous' });
  });

  test('a Simulation model or a file treated as testbench is not checked', () => {
    const files = [source('top.vhd', LATCH)];
    expect(targetOf(files, 'top.vhd', { ...EMPTY_OVERRIDES, simModels: { 'top.vhd': true } })).toEqual({ kind: 'skip', reason: 'sim-model' });
    expect(targetOf(files, 'top.vhd', { ...EMPTY_OVERRIDES, roles: { 'top.vhd': 'tb' } }).kind).toBe('skip');
  });

  test('a Verilog run is checked by Icarus', () => {
    const files = [source('blink.v', 'module blink (input wire CLOCK_50, output wire [9:0] LEDR);\n  assign LEDR = 0;\nendmodule\n')];
    const choice = targetOf(files, 'blink.v');
    expect(choice.kind === 'check' && choice.target.tool).toBe('icarus');
  });

  test('a run with no top marked is not checked', () => {
    expect(targetOf([source('top.vhd', LATCH)], null)).toEqual({ kind: 'skip', reason: 'noTop' });
  });
});

/** The check's answer for `files`, placed as the page places it. */
function answerFor(files: readonly SourceFile[], text: string, overrides: TestbenchOverrides = EMPTY_OVERRIDES): ToolCheckResult {
  const answer = classifyAnswer('ghdl', { kind: 'exit', code: text === '' ? 0 : 1 }, text);
  return placeAnswer({ tool: 'ghdl', top: 'top', topFileId: files[0]?.id ?? '', answer, files: runOf(files), view: viewOf(files, overrides) });
}

describe('an answer placed in the code', () => {
  test('puts a finding on the line GHDL names, in its unit', () => {
    const result = answerFor([source('top.vhd', LATCH)], LATCH_TEXT);
    expect(result.findings.map((f) => [f.fileId, f.line, f.unitName, f.tier])).toEqual([['top.vhd', 7, 'top', 'ignored']]);
    expect(result.findings[0]?.toolMessage).toBe('latch infered for net "q" (use --latches)');
  });

  test('says a message on a line outside every unit for the design: a package before the entity', () => {
    const result = answerFor([source('top.vhd', `${PACKAGE}${LATCH}`)], 'top.vhd:4:3:error: variable with access type is not synthesizable\n');
    expect([result.findings, result.designMessages]).toEqual([[], ['variable with access type is not synthesizable']]);
  });

  test('drops a message in code hidden from synthesis', () => {
    const guarded = vhdlDesign('top', BOARD_PORTS, "LEDR <= SW;\n-- synthesis translate_off\nprocess begin\n  wait;\nend process;\n-- synthesis translate_on");
    const result = answerFor([source('top.vhd', guarded)], 'top.vhd:12:3:error: wait statement not allowed for synthesis\n');
    expect([result.findings, result.designMessages]).toEqual([[], []]);
  });

  test('fits the code it checked only: an edit makes it stale, undoing the edit fits it again', () => {
    const files = [source('top.vhd', LATCH)];
    const result = answerFor(files, LATCH_TEXT);
    expect(fitsFiles(result, files)).toBe(true);
    expect(fitsFiles(result, [{ ...files[0], content: `${LATCH}\n` }])).toBe(false);
    expect(fitsFiles(result, [{ ...files[0] }])).toBe(true);
  });

  test('places nothing when the project was analysed from other text', () => {
    const files = [source('top.vhd', LATCH)];
    const answer = classifyAnswer('ghdl', { kind: 'exit', code: 1 }, LATCH_TEXT);
    const edited = [source('top.vhd', `-- edited\n${LATCH}`)];
    expect(placeAnswer({ tool: 'ghdl', top: 'top', topFileId: 'top.vhd', answer, files: runOf(files), view: viewOf(edited) }).findings).toEqual([]);
  });
});

const checkWith = (files: readonly SourceFile[], toolFindings: readonly ToolFinding[], overrides: TestbenchOverrides = EMPTY_OVERRIDES) =>
  DESIGN_CHECKS.synthesis({ view: viewOf(files, overrides), overrides, toolFindings });

describe('the groups with the check\'s findings', () => {
  test('a GHDL latch makes an RTL design SIM-only, and the badge names it with its tool', () => {
    const files = [source('top.vhd', LATCH)];
    const { findings } = answerFor(files, LATCH_TEXT);
    expect(checkWith(files, []).groups.byFile.get('top.vhd')).toBe('rtl');
    const check = checkWith(files, findings);
    expect(check.groups.byFile.get('top.vhd')).toBe('sim-only');
    expect(simOnlyBadgeText(check, EMPTY_OVERRIDES, 'top.vhd')?.detected).toBe('Detected: SIM-only design — latch (GHDL) (line 7)');
  });

  test('a pass never clears a live finding: the blink example stays SIM-only (two-clock rule, D3)', () => {
    const files = [source('blink.vhd', BLINK)];
    expect(checkWith(files, []).groups.byFile.get('blink.vhd')).toBe('sim-only');
  });

  test('a file marked Treat as testbench since the check: its findings count no more', () => {
    const files = [source('top.vhd', LATCH)];
    const { findings } = answerFor(files, LATCH_TEXT);
    expect(checkWith(files, findings, { ...EMPTY_OVERRIDES, roles: { 'top.vhd': 'tb' } }).groups.byFile.get('top.vhd')).toBe('tb');
  });

  test('a Simulation model keeps its SIM-only label and gets no warning from the check', () => {
    const files = [source('top.vhd', LATCH)];
    const overrides = { ...EMPTY_OVERRIDES, simModels: { 'top.vhd': true as const } };
    const { findings } = answerFor(files, LATCH_TEXT, overrides);
    expect(checkWith(files, findings, overrides).groups.byFile.get('top.vhd')).toBe('sim-only');
    expect(shownFindings(findings, viewOf(files, overrides), overrides)).toEqual([]);
  });

  test('two drivers warn, and the group stays RTL', () => {
    const files = [source('top.vhd', LATCH)];
    const { findings } = answerFor(files, 'top.vhd:15:1:error: multiple assignments for "LEDR" offsets 0:0\n');
    expect(findings).toHaveLength(1);
    expect(checkWith(files, findings).groups.byFile.get('top.vhd')).toBe('rtl');
  });
});

describe('the check\'s warnings with the live ones', () => {
  const files = [source('blink.vhd', BLINK)];
  const view = viewOf(files);
  const live = checkDiagnostics(DESIGN_CHECKS.synthesis({ view, overrides: EMPTY_OVERRIDES }), { analysis: view.raw, overrides: EMPTY_OVERRIDES, files: runOf(files) });

  test('a finding on a line the live check warns about is a detail of that warning, not a second one', () => {
    const line = live[0]?.line ?? 0;
    const { findings } = answerFor(files, `blink.vhd:${line}:3:error: wait statement not allowed for synthesis\n`);
    const merged = withToolFindings(live, findings);
    expect(merged).toHaveLength(live.length);
    expect(merged[0]?.details).toEqual(['GHDL synthesis check: wait statement not allowed for synthesis']);
  });

  test('a finding on another line is a warning of its own, naming its source and keeping its text', () => {
    const { findings } = answerFor(files, 'blink.vhd:9:1:error: signal assignment not allowed here\n');
    const merged = withToolFindings(live, findings);
    const own = merged[merged.length - 1];
    expect(merged).toHaveLength(live.length + 1);
    expect([own?.line, own?.advice?.compiler, own?.details]).toEqual([9, 'GHDL synthesis check', ['GHDL: signal assignment not allowed here']]);
    expect(own?.message).toMatch(/^Cannot be synthesized:/);
  });
});

describe('the answer cache', () => {
  const files = runOf([source('top.vhd', LATCH)]);
  const target = { tool: 'ghdl', top: 'top', topFileId: 'top.vhd', fileIds: ['top.vhd'] } as const;
  const key = cacheKey({ target, files, compilerOptions: {}, backend: 'ws://localhost:9010/hdlsim' });
  const answer = (reason?: ToolCheckResult['reason']): ToolCheckResult => ({
    tool: 'ghdl', top: 'top', topFileId: 'top.vhd', status: reason ? 'unverified' : 'passed', ...(reason && { reason }), files, findings: [], designMessages: [],
  });

  test('gives the answer back for exactly the same files', () => {
    const cache = new ToolCheckCache();
    cache.set(key, answer());
    expect(cache.get(key, files)).toEqual(answer());
    expect(cache.get(key, [{ ...files[0], content: `${LATCH}\n` }])).toBeUndefined();
  });

  test('changes its key with the options, the backend and the top', () => {
    const others = [
      cacheKey({ target, files, compilerOptions: { ghdl: { synopsys: true } }, backend: 'ws://localhost:9010/hdlsim' }),
      cacheKey({ target, files, compilerOptions: {}, backend: 'wss://example.org/hdlsim' }),
      cacheKey({ target: { ...target, top: 'other' }, files, compilerOptions: {}, backend: 'ws://localhost:9010/hdlsim' }),
    ];
    expect(others.every((other) => other !== key)).toBe(true);
  });

  test('keeps no answer that says nothing about the code: a timeout is tried again', () => {
    const cache = new ToolCheckCache();
    cache.set(key, answer('timeout'));
    expect(cache.get(key, files)).toBeUndefined();
    cache.set(key, answer('tool-error'));
    expect(cache.get(key, files)).toBeDefined();
  });

  test('lets the answer used longest ago go when full', () => {
    const cache = new ToolCheckCache(1);
    cache.set('a', answer());
    cache.set('b', answer());
    expect([cache.get('a', files), cache.get('b', files)]).toEqual([undefined, answer()]);
  });
});
