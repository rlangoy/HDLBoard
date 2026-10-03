// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import { describe, expect, test } from 'vitest';
import { STARTER_FILES } from '../files';
import { analyzeProject } from './analyzeProject';
import { FIXTURES, fixtureFile } from './fixtures.testSupport';

/**
 * docs/impl_split_screen.md § 7.4, AC-18: generous budgets, so a CI box does not
 * flake; if one is broken for real, analyzeProject moves to a Worker unchanged.
 */

function repeatedTo(lines: number, language: 'vhdl' | 'verilog'): string {
  const texts = [...FIXTURES].filter(([path]) => path.startsWith(language)).map(([, text]) => text);
  const out: string[] = [];
  let count = 0;
  for (let i = 0; count < lines; i++) {
    const text = texts[i % texts.length];
    out.push(text);
    count += text.split('\n').length;
  }
  return out.join('\n');
}

/** The best of three runs: the budget is about the code, not about a busy test machine. */
const timed = (run: () => void): number => {
  const times = [0, 1, 2].map(() => {
    const start = performance.now();
    run();
    return performance.now() - start;
  });
  return Math.min(...times);
};

describe('analyzeProject budgets', () => {
  test.each(['vhdl', 'verilog'] as const)('a 5 000-line %s file in under 50 ms', (language) => {
    const name = language === 'vhdl' ? 'big.vhd' : 'big.v';
    const file = { id: name, name, folder: language, content: repeatedTo(5000, language) };
    // Each call starts from no previous result, so every run is cold for the cache.
    expect(timed(() => analyzeProject([file]))).toBeLessThan(50);
  });

  test('the starter project plus every fixture, cold, in under 150 ms', () => {
    const files = [...STARTER_FILES, ...[...FIXTURES.keys()].map((path) => fixtureFile(path))];
    expect(timed(() => analyzeProject(files))).toBeLessThan(150);
  });

  test('an unchanged file reuses its cached result', () => {
    const files = [fixtureFile('vhdl/counter.vhd')];
    const first = analyzeProject(files);
    expect(analyzeProject(files, first).byFile.get('vhdl/counter.vhd')).toBe(first.byFile.get('vhdl/counter.vhd'));
  });
});
