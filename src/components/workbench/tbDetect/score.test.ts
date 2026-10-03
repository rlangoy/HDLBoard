// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import { describe, expect, test } from 'vitest';
import { confidenceOf, fileRoleOf, summarize } from './score';
import type { Evidence, RuleId } from './types';

/** docs/impl_split_screen.md § 5.5, D4, D23. */

const ev = (...ids: RuleId[]): Evidence[] => ids.map((ruleId, i) => ({ ruleId, line: i + 1 }));

describe('summarize', () => {
  test('each rule counts once, however many lines match', () => {
    expect(summarize(ev('vhdl-assert', 'vhdl-assert', 'vhdl-assert')).score).toBe(5);
  });

  test('clamps to 0..100', () => {
    expect(summarize(ev('vhdl-board-ports')).score).toBe(0);
    expect(summarize(ev('vhdl-wait-for', 'vhdl-end-sim', 'vhdl-framework', 'vhdl-portless')).score).toBe(100);
  });
});

describe('confidenceOf', () => {
  test('strong evidence is high at any score', () => {
    expect(confidenceOf({ score: 0, hasStrongEvidence: true, vetoed: false })).toBe('high');
  });

  test('weak only: 39 is low, 40 is medium', () => {
    expect(confidenceOf({ score: 39, hasStrongEvidence: false, vetoed: false })).toBe('low');
    expect(confidenceOf({ score: 40, hasStrongEvidence: false, vetoed: false })).toBe('medium');
  });

  test('a veto beats strong evidence', () => {
    expect(confidenceOf(summarize(ev('vhdl-wait-for', 'vhdl-board-ports')))).toBe('low');
  });
});

test('fileRoleOf', () => {
  expect(fileRoleOf([])).toBeUndefined();
  expect(fileRoleOf(['tb', 'tb'])).toBe('tb');
  expect(fileRoleOf(['rtl'])).toBe('rtl');
  expect(fileRoleOf(['rtl', 'tb'])).toBe('mixed');
});
