// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import { describe, expect, test } from 'vitest';
import { classifyAnswer } from './classify';

/**
 * What GHDL's synthesis answer means (docs/impl_sim_only_warnings.md § 7). The texts are
 * what GHDL 6.0 prints for the designs of server/src/integration/synthCheck.test.ts.
 */

const EXIT_1 = { kind: 'exit', code: 1 } as const;
const EXIT_0 = { kind: 'exit', code: 0 } as const;

const WAIT = "top.vhd:12:5:error: wait statement not allowed for synthesis\n    wait for 500 ms;\n    ^\n";
const ASSIGN = "top.vhd:11:5:error: signal assignment not allowed here\n    LEDR(0) <= '1';\n    ^\n";
const LATCH = 'top.vhd:7:10:error: latch infered for net "q" (use --latches)\n';
const DRIVERS = 'top.vhd:9:3:error: multiple assignments for "LEDR" offsets 0:0\n';
const ACCESS = 'top.vhd:10:5:error: variable with access type is not synthesizable\n';
const UNKNOWN = "top.vhd:4:1:error: unhandled attribute 'transaction\n";
const NO_TOP = 'C:\\Program Files\\HDLBoard\\ghdl\\bin\\ghdl.exe:error: cannot find entity or configuration nosuchunit\n';
const NETLIST_WARNING = 'top.vhd:3:1:warning: no assignment for offsets 1:9 of output "ledr"\n';

const meaningOf = (text: string) => classifyAnswer(EXIT_1, text).placed[0]?.meaning;

describe('a GHDL message', () => {
  test.each([
    ['a wait', WAIT, 'never'],
    ['an assignment in a waiting process', ASSIGN, 'never'],
    ['a pointer (a textio line)', ACCESS, 'never'],
    ['a latch, as the live latch makes it', LATCH, 'ignored'],
  ])('that names %s makes the design SIM-only, at its tier', (_label, text, tier) => {
    expect(meaningOf(text)?.tier).toBe(tier);
  });

  test('that names a wait cannot be synthesized', () => {
    expect(meaningOf(WAIT)?.effect).toBe('cannot-synthesize');
  });

  test('that names a latch is changed by synthesis', () => {
    expect(meaningOf(LATCH)?.effect).toBe('changed');
  });

  test('that names two drivers leaves the group alone', () => {
    expect(meaningOf(DRIVERS)?.tier).toBeUndefined();
  });

  test('that names two drivers says which signal', () => {
    expect(meaningOf(DRIVERS)?.text.headline).toContain('`LEDR`');
  });

  test('HDLBoard does not know cannot verify, and makes nothing SIM-only', () => {
    expect([meaningOf(UNKNOWN)?.effect, meaningOf(UNKNOWN)?.tier]).toEqual(['not-verified', undefined]);
  });
});

describe('a GHDL answer', () => {
  test('with a verdict is found', () => {
    expect(classifyAnswer(EXIT_1, WAIT).status).toBe('found');
  });

  test('of exit 0 passes, whatever warnings it printed', () => {
    expect(classifyAnswer(EXIT_0, NETLIST_WARNING)).toEqual({ status: 'passed', placed: [], unplaced: [] });
  });

  test('with only messages HDLBoard does not know cannot verify', () => {
    expect(classifyAnswer(EXIT_1, UNKNOWN)).toMatchObject({ status: 'unverified', reason: 'tool-error' });
  });

  test('keeps a verdict beside a message it cannot explain', () => {
    expect(classifyAnswer(EXIT_1, LATCH + UNKNOWN).placed.map((p) => p.meaning.effect)).toEqual(['changed', 'not-verified']);
  });

  test('says a message without a place for the design, never on a guessed line', () => {
    expect(classifyAnswer(EXIT_1, NO_TOP).unplaced).toEqual(['cannot find entity or configuration nosuchunit']);
  });

  test('drops its warnings: they are about the netlist, not the board', () => {
    expect(classifyAnswer(EXIT_1, NETLIST_WARNING + LATCH).placed).toHaveLength(1);
  });

  test('names a message on one line once', () => {
    expect(classifyAnswer(EXIT_1, LATCH + LATCH).placed).toHaveLength(1);
  });
});

describe('a check that did not answer about the design', () => {
  test.each(['timeout', 'crash', 'unavailable', 'busy', 'refused', 'unsupported', 'no-answer'] as const)('%s cannot verify, and marks no line', (kind) => {
    expect(classifyAnswer({ kind }, WAIT)).toEqual({ status: 'unverified', reason: kind, placed: [], unplaced: [] });
  });
});
