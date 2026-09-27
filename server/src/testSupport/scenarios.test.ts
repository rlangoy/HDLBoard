// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { describe, test } from 'node:test';
import { fixturePath } from './fixture.js';
import { loadScenarios, validateScenarios } from './scenarios.js';

const validBoardFixture = {
  id: 'x',
  mode: 'board',
  top: 'X',
  files: { verilog: 'x.v' },
  steps: [{ name: 's', sw: '0000000000', key: '1111', expect: { ledr: '0000000000', hex: 'blank' } }],
};
const withFixture = (fixture: unknown) => ({ version: 1, fixtures: [fixture] });
const problemsFor = (overrides: object) => validateScenarios(withFixture({ ...validBoardFixture, ...overrides }));

describe('the shipped scenario file', () => {
  const file = loadScenarios();

  test('has no schema problems', () => {
    assert.deepEqual(validateScenarios(file), []);
  });

  test('references only fixture files that exist', () => {
    for (const fixture of file.fixtures) {
      for (const [language, name] of Object.entries(fixture.files)) {
        assert.ok(existsSync(fixturePath(language as 'vhdl' | 'verilog', name)), `${fixture.id}: ${name}`);
      }
    }
  });

  test('covers both run modes and both languages', () => {
    assert.ok(file.fixtures.some((f) => f.mode === 'board'));
    assert.ok(file.fixtures.some((f) => f.mode === 'batch'));
    assert.ok(file.fixtures.some((f) => f.files.vhdl && f.files.verilog));
  });
});

describe('validateScenarios', () => {
  test('accepts a well-formed fixture', () => {
    assert.deepEqual(validateScenarios(withFixture(validBoardFixture)), []);
  });

  test('rejects a file that is not an object with fixtures', () => {
    assert.notEqual(validateScenarios('nope').length, 0);
    assert.notEqual(validateScenarios({ version: 1 }).length, 0);
  });

  test('rejects an unknown mode', () => {
    assert.match(problemsFor({ mode: 'turbo' }).join('\n'), /mode/);
  });

  test('rejects a fixture with no files', () => {
    assert.match(problemsFor({ files: {} }).join('\n'), /files/);
  });

  test('rejects an LED pattern that is not ten bits', () => {
    const steps = [{ name: 's', expect: { ledr: '01' } }];
    assert.match(problemsFor({ steps }).join('\n'), /ledr/);
  });

  test('rejects switch and key patterns of the wrong width', () => {
    const steps = [{ name: 's', sw: '01', key: '111', expect: {} }];
    const text = problemsFor({ steps }).join('\n');
    assert.match(text, /sw/);
    assert.match(text, /key/);
  });

  test('requires switches and keys together, because one STIM carries both', () => {
    const steps = [{ name: 's', sw: '0000000000', expect: {} }];
    assert.match(problemsFor({ steps }).join('\n'), /sw and key/);
  });

  test('rejects a timing window that is not an ordered pair', () => {
    const steps = [{ name: 's', expect: {}, withinMs: [400, 150] }];
    assert.match(problemsFor({ steps }).join('\n'), /withinMs/);
  });

  test('requires a board fixture to have steps and a batch fixture to have expected output', () => {
    assert.match(problemsFor({ steps: undefined }).join('\n'), /steps/);
    assert.match(problemsFor({ mode: 'batch', steps: undefined }).join('\n'), /expectOutput/);
  });

  test('names the fixture a problem belongs to', () => {
    assert.match(problemsFor({ id: 'broken', mode: 'turbo' })[0] ?? '', /broken/);
  });
});
