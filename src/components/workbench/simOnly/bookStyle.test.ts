// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';
import { checkOf, source } from './simOnly.testSupport';

/**
 * Registers written the way students' textbooks write them (#48): `elsif (clk'event and
 * clk='1') then`, in parentheses, beside next-state logic, a register file and a Moore
 * machine. The fixtures were written for HDLBoard in that style and synthesize with
 * Quartus Prime 25.1 Lite (Cyclone V), so the design check must keep every file RTL.
 */

const FIXTURES = new URL('../../../../tests/fixtures/vhdl/book-style/', import.meta.url);
const FILE_NAMES = ['DE1_SoC.vhd', 'dff_reset.vhd', 'mod_counter.vhd', 'reg_file.vhd', 'edge_fsm.vhd'];

const project = FILE_NAMES.map((name) => source(name, readFileSync(new URL(name, FIXTURES), 'utf8')));
const check = checkOf(project);

describe('book-style registers synthesize, and the check agrees', () => {
  test.each(FILE_NAMES)('%s has no finding that keeps it off the board', (name) => {
    expect(check.findings.filter((f) => f.fileId === name && f.tier !== 'quiet')).toEqual([]);
  });

  test.each(FILE_NAMES)('%s is RTL', (name) => {
    expect(check.groups.byFile.get(name)).toBe('rtl');
  });
});
