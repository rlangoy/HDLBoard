// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import { describe, expect, test } from 'vitest';
import { STARTER_FILES } from './files';

/**
 * `tests/fixtures/vhdl/` holds copies of the starter designs, so the same scenario
 * can run against GHDL and its Verilog twin (docs/Verilog_implementation_plan.md
 * § 7.3). Two copies of one design will drift unless something stops them; this is
 * that guard (case K-10).
 */

const fixtureTexts = import.meta.glob<string>('../../../tests/fixtures/vhdl/*.vhdl', {
  query: '?raw',
  import: 'default',
  eager: true,
});

const withLfLineEndings = (text: string) => text.replace(/\r\n/g, '\n');
const fileNameOf = (path: string) => path.slice(path.lastIndexOf('/') + 1);

const fixtureByName = new Map(Object.entries(fixtureTexts).map(([path, text]) => [fileNameOf(path), text]));
const vhdlStarters = STARTER_FILES.filter((file) => file.folder === 'vhdl');

describe('the VHDL test fixtures', () => {
  test.each(vhdlStarters.map((starter) => [starter.name, starter.content] as const))(
    '%s equals the starter design it was copied from',
    (name, starterContent) => {
      expect(fixtureByName.has(name), `tests/fixtures/vhdl/${name} is missing`).toBe(true);
      expect(withLfLineEndings(fixtureByName.get(name) ?? '')).toBe(withLfLineEndings(starterContent));
    },
  );

  test('include no design that is not a starter', () => {
    const starterNames = vhdlStarters.map((starter) => starter.name).sort();
    expect([...fixtureByName.keys()].sort()).toEqual(starterNames);
  });
});
