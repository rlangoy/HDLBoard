// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import { describe, expect, test } from 'vitest';
import { STARTER_FILES } from './files';

/**
 * `tests/fixtures/vhdl/` and `tests/fixtures/verilog/` hold copies of the starter
 * designs, so the same scenario can run against GHDL and Icarus
 * (docs/Verilog_implementation_plan.md § 7.3). Two copies of one design will drift
 * unless something stops them; this is that guard (case K-10).
 */

const fixtureTexts = import.meta.glob<string>('../../../tests/fixtures/{vhdl,verilog}/*.{vhdl,v}', {
  query: '?raw',
  import: 'default',
  eager: true,
});

const withLfLineEndings = (text: string) => text.replace(/\r\n/g, '\n');

/** The fixtures of one language folder, by file name. */
function fixturesIn(folder: 'vhdl' | 'verilog'): Map<string, string> {
  const marker = `/tests/fixtures/${folder}/`;
  const found = Object.entries(fixtureTexts).filter(([path]) => path.includes(marker));
  return new Map(found.map(([path, text]) => [path.slice(path.lastIndexOf('/') + 1), text]));
}

describe.each(['vhdl', 'verilog'] as const)('the %s test fixtures', (folder) => {
  const fixtures = fixturesIn(folder);
  const starters = STARTER_FILES.filter((file) => file.folder === folder);

  test.each(starters.map((starter) => [starter.name, starter.content] as const))(
    '%s equals the starter design it was copied from',
    (name, starterContent) => {
      expect(fixtures.has(name), `tests/fixtures/${folder}/${name} is missing`).toBe(true);
      expect(withLfLineEndings(fixtures.get(name) ?? '')).toBe(withLfLineEndings(starterContent));
    },
  );

  test('include no design that is not a starter', () => {
    const starterNames = starters.map((starter) => starter.name).sort();
    expect([...fixtures.keys()].sort()).toEqual(starterNames);
  });
});
