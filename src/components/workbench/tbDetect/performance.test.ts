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

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * The best run (ms) of several, stopping once one is within `budget`: the budget is
 * about the code, not about a busy machine. While the other test files run in
 * parallel a run takes about twice as long, so runs are retried, spaced out, for up
 * to two seconds — by then the rest of the suite has finished.
 */
async function timed(run: () => void, budget: number): Promise<number> {
  let best = Number.POSITIVE_INFINITY;
  for (const startedAt = performance.now(); performance.now() - startedAt < 2000; await sleep(100)) {
    const start = performance.now();
    run();
    best = Math.min(best, performance.now() - start);
    if (best < budget) break;
  }
  return best;
}

describe('analyzeProject budgets', () => {
  test.each(['vhdl', 'verilog'] as const)('a 5 000-line %s file in under 50 ms', async (language) => {
    const name = language === 'vhdl' ? 'big.vhd' : 'big.v';
    const file = { id: name, name, folder: language, content: repeatedTo(5000, language) };
    // Each call starts from no previous result, so every run is cold for the cache.
    expect(await timed(() => analyzeProject([file]), 50)).toBeLessThan(50);
  });

  test('the starter project plus every fixture, cold, in under 150 ms', async () => {
    const files = [...STARTER_FILES, ...[...FIXTURES.keys()].map((path) => fixtureFile(path))];
    expect(await timed(() => analyzeProject(files), 150)).toBeLessThan(150);
  });

  test('an unchanged file reuses its cached result', () => {
    const files = [fixtureFile('vhdl/counter.vhd')];
    const first = analyzeProject(files);
    expect(analyzeProject(files, first).byFile.get('vhdl/counter.vhd')).toBe(first.byFile.get('vhdl/counter.vhd'));
  });
});
