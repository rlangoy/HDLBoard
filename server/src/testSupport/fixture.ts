// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * Access to the shared fixture set in `tests/fixtures/` and its scenario file —
 * the single source of expected behaviour for every test tier
 * (docs/Verilog_implementation_plan.md § 7.3).
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

export type FixtureLanguage = 'vhdl' | 'verilog';

/** A subdirectory of `tests/fixtures/`: the two languages, plus captured `iverilog -tstub` output. */
export type FixtureDirectory = FixtureLanguage | 'stub';

/** From `server/dist/testSupport/` up to the repository root, then into the fixtures. */
const FIXTURE_ROOT = fileURLToPath(new URL('../../../tests/fixtures/', import.meta.url));

export function fixturePath(directory: FixtureDirectory, fileName: string): string {
  return join(FIXTURE_ROOT, directory, fileName);
}

/** Fixture text with LF line endings, whatever the checkout's native ones are. */
export function readFixture(directory: FixtureDirectory, fileName: string): string {
  return readFileSync(fixturePath(directory, fileName), 'utf8').replace(/\r\n/g, '\n');
}

export function scenarioFilePath(): string {
  return join(FIXTURE_ROOT, 'scenarios.json');
}
