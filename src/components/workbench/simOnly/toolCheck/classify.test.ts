// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import { describe, expect, test } from 'vitest';
import { classifyAnswer } from './classify';

/**
 * What a synthesis check's answer means (docs/impl_sim_only_warnings.md § 7). The texts are
 * what GHDL 6.0 and Icarus 13 print for the designs of server/src/integration/synthCheck.test.ts.
 */

const EXIT_1 = { kind: 'exit', code: 1 } as const;
const EXIT_0 = { kind: 'exit', code: 0 } as const;

const GHDL_WAIT = "top.vhd:12:5:error: wait statement not allowed for synthesis\n    wait for 500 ms;\n    ^\n";
const GHDL_ASSIGN = "top.vhd:11:5:error: signal assignment not allowed here\n    LEDR(0) <= '1';\n    ^\n";
const GHDL_LATCH = 'top.vhd:7:10:error: latch infered for net "q" (use --latches)\n';
const GHDL_DRIVERS = 'top.vhd:9:3:error: multiple assignments for "LEDR" offsets 0:0\n';
const GHDL_ACCESS = 'top.vhd:10:5:error: variable with access type is not synthesizable\n';
const GHDL_UNKNOWN = 'top.vhd:4:1:error: unhandled attribute \'transaction\n';
const GHDL_NO_TOP = 'C:\\Program Files\\HDLBoard\\ghdl\\bin\\ghdl.exe:error: cannot find entity or configuration nosuchunit\n';
const ICARUS_START_VALUES =
  "blinkTest.v:20: warning: 'counter' is driven by more than one process.\n" +
  'blinkTest.v:20: sorry: Cannot synthesize signals that are driven by more than one process.\n' +
  'blinkTest.v:3: warning: Process not synthesized.\n1 error(s) in post-elaboration processing.\n';

describe('a GHDL answer', () => {
  test('that names a wait is found: the design cannot be built, and is SIM-only', () => {
    const answer = classifyAnswer('ghdl', EXIT_1, GHDL_WAIT);
    expect(answer.status).toBe('found');
    expect(answer.placed.map((p) => [p.diagnostic.line, p.meaning.effect, p.meaning.tier])).toEqual([[12, 'cannot-synthesize', 'never']]);
  });

  test('that names an assignment in a waiting process is SIM-only too', () => {
    expect(classifyAnswer('ghdl', EXIT_1, GHDL_ASSIGN).placed[0]?.meaning.tier).toBe('never');
  });

  test('that names a pointer (a textio line) is file I/O, SIM-only', () => {
    const [placed] = classifyAnswer('ghdl', EXIT_1, GHDL_ACCESS).placed;
    expect([placed?.meaning.title, placed?.meaning.tier]).toEqual(['file I/O', 'never']);
  });

  test('that names a latch: synthesis changes it, and the design is SIM-only, as the live latch makes it', () => {
    const [placed] = classifyAnswer('ghdl', EXIT_1, GHDL_LATCH).placed;
    expect([placed?.meaning.effect, placed?.meaning.tier, placed?.meaning.title]).toEqual(['changed', 'ignored', 'latch']);
  });

  test('that names two drivers warns with the signal, and leaves the group alone', () => {
    const answer = classifyAnswer('ghdl', EXIT_1, GHDL_DRIVERS);
    expect(answer.status).toBe('found');
    expect(answer.placed[0]?.meaning.tier).toBeUndefined();
    expect(answer.placed[0]?.meaning.text.headline).toContain('`LEDR`');
  });

  test('with a message HDLBoard does not know cannot verify: it is no verdict either way', () => {
    const answer = classifyAnswer('ghdl', EXIT_1, GHDL_UNKNOWN);
    expect([answer.status, answer.reason]).toEqual(['unverified', 'tool-error']);
    expect(answer.placed.map((p) => [p.meaning.effect, p.meaning.tier])).toEqual([['not-verified', undefined]]);
  });

  test('without a place says it for the design, never on a guessed line', () => {
    const answer = classifyAnswer('ghdl', EXIT_1, GHDL_NO_TOP);
    expect([answer.status, answer.reason, answer.placed]).toEqual(['unverified', 'tool-error', []]);
    expect(answer.unplaced).toEqual(['cannot find entity or configuration nosuchunit']);
  });

  test('of exit 0 passes, whatever warnings it printed', () => {
    expect(classifyAnswer('ghdl', EXIT_0, 'top.vhd:3:1:warning: no assignment for offsets 1:9 of output "ledr"\n')).toEqual({
      status: 'passed',
      placed: [],
      unplaced: [],
    });
  });

  test('keeps a verdict beside a message it cannot explain', () => {
    const answer = classifyAnswer('ghdl', EXIT_1, GHDL_LATCH + GHDL_UNKNOWN);
    expect(answer.status).toBe('found');
    expect(answer.placed.map((p) => p.meaning.effect)).toEqual(['changed', 'not-verified']);
  });

  test('drops its warnings: they are about the netlist, not the board', () => {
    expect(classifyAnswer('ghdl', EXIT_1, `top.vhd:3:1:warning: no assignment for offsets 1:9\n${GHDL_LATCH}`).placed).toHaveLength(1);
  });
});

describe('a check that did not answer about the design', () => {
  test.each(['timeout', 'crash', 'unavailable', 'busy', 'refused', 'unsupported', 'no-answer'] as const)('%s cannot verify, and marks no line', (kind) => {
    expect(classifyAnswer('ghdl', { kind }, GHDL_WAIT)).toEqual({ status: 'unverified', reason: kind, placed: [], unplaced: [] });
  });
});

describe('an Icarus answer (advice only, D1)', () => {
  test('of the start-value refusal cannot verify: every message is a quiet note, none makes SIM-only', () => {
    const answer = classifyAnswer('icarus', EXIT_1, ICARUS_START_VALUES);
    expect([answer.status, answer.reason]).toEqual(['unverified', 'advisory']);
    expect(answer.placed.length).toBeGreaterThan(0);
    expect(answer.placed.every((p) => p.meaning.effect === 'not-verified' && p.meaning.tier === undefined && p.meaning.quiet)).toBe(true);
    expect(answer.placed[0]?.meaning.text.headline).toContain('the FPGA may still build it');
  });

  test('of exit 0 passes, keeping its notes', () => {
    const answer = classifyAnswer('icarus', EXIT_0, 'counter8.v:8: warning: Process not synthesized.\n');
    expect(answer.status).toBe('passed');
    expect(answer.placed.map((p) => p.meaning.text.headline)).toEqual(['Icarus left this block as simulation code.']);
  });

  test('of a crash ignores what it printed before', () => {
    const text = 'keyCouter2Led.v:11: error: Too many clocks for synchronous logic.\n';
    expect(classifyAnswer('icarus', { kind: 'crash' }, text)).toEqual({ status: 'unverified', reason: 'crash', placed: [], unplaced: [] });
  });
});
