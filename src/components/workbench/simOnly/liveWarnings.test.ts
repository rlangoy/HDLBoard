// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import { describe, expect, test } from 'vitest';
import { addToFiles, NO_DIAGNOSTICS } from '../diagnosticStore';
import { summarize, CLEAR_HINT } from '../diagnosticText';
import { EMPTY_OVERRIDES, type TestbenchOverrides } from '../tbDetect/types';
import { findingDiagnostics } from './findingDiagnostics';
import { groupChanges, simOnlyBadgeText, simOnlySummaries } from './simOnlyReport';
import { BLINK, checkOf, source, viewOf } from './simOnly.testSupport';

/** docs/impl_sim_only_warnings.md § 5.2, § 5.3, § 9 (diagnosticStore and the reports). */

const FILES = [source('blink.vhd', BLINK)];
const simModel: TestbenchOverrides = { ...EMPTY_OVERRIDES, simModels: { 'blink.vhd': true } };

function liveWarnings(content: string, overrides: TestbenchOverrides = EMPTY_OVERRIDES) {
  const check = checkOf(FILES, overrides);
  const files = [{ id: 'blink.vhd', content }];
  return findingDiagnostics(check.findings, { analysis: viewOf(FILES, overrides).raw, overrides, files });
}

describe('live warnings', () => {
  test('one per line that only works in simulation', () => {
    expect(liveWarnings(BLINK).map((d) => [d.line, d.severity])).toEqual([[12, 'warning'], [14, 'warning']]);
  });

  test('carry the check as their source, not the compiler', () => {
    expect(liveWarnings(BLINK)[0].advice?.compiler).toBe('HDLBoard design check');
  });

  test('stay while typing within a line', () => {
    expect(liveWarnings(BLINK.replace('500 ms', '250 ms'))).toHaveLength(2);
  });

  test('hide while a line was added since the analysis', () => {
    expect(liveWarnings(`-- new line\n${BLINK}`)).toEqual([]);
  });

  test('none in a file marked Simulation model', () => {
    expect(liveWarnings(BLINK, simModel)).toEqual([]);
  });

  test("merge with a run's markers under the same caps and dedup", () => {
    const once = addToFiles(NO_DIAGNOSTICS, liveWarnings(BLINK));
    expect(addToFiles(once, liveWarnings(BLINK))).toBe(once);
  });

  test('the status line does not say a click clears them', () => {
    const lines = addToFiles(NO_DIAGNOSTICS, liveWarnings(BLINK))['blink.vhd'];
    expect(summarize('blink.vhd', lines)).not.toContain(CLEAR_HINT);
  });
});

describe('the SIM-only badge', () => {
  test('says how many lines run only in the simulator', () => {
    expect(simOnlyBadgeText(checkOf(FILES), EMPTY_OVERRIDES, 'blink.vhd')?.tooltip).toMatch(/2 lines run in the simulator/);
  });

  test('lists the findings in its Detected line', () => {
    expect(simOnlyBadgeText(checkOf(FILES), EMPTY_OVERRIDES, 'blink.vhd')?.detected).toBe(
      'Detected: SIM-only design — wait for (line 12), wait for (line 14)',
    );
  });

  test('is not shown for an RTL file', () => {
    const rtl = [source('blink.vhd', BLINK.replace(/ {2}wait for 500 ms;\n/g, ''))];
    expect(simOnlyBadgeText(checkOf(rtl), EMPTY_OVERRIDES, 'blink.vhd')).toBeUndefined();
  });
});

describe('the console summary at Start', () => {
  test('is one line per SIM-only file, linked to its first line', () => {
    expect(simOnlySummaries(checkOf(FILES), EMPTY_OVERRIDES, [{ id: 'blink.vhd', name: 'blink.vhd' }])).toEqual([
      { text: 'blink.vhd is SIM-only: 2 lines only work in simulation; they run here but not on the board.', fileId: 'blink.vhd', line: 12 },
    ]);
  });

  test('is empty in Simulation only mode', () => {
    const check = checkOf(FILES, EMPTY_OVERRIDES, 'simulation');
    expect(simOnlySummaries(check, EMPTY_OVERRIDES, [{ id: 'blink.vhd', name: 'blink.vhd' }])).toEqual([]);
  });
});

describe('the announcement', () => {
  const nameOf = () => 'blink.vhd';

  test('when the last finding is fixed', () => {
    expect(groupChanges(new Map([['b', 'sim-only']]), new Map([['b', 'rtl']]), nameOf)).toEqual(['blink.vhd is now RTL: it can run on the board']);
  });

  test('not when nothing changed group', () => {
    expect(groupChanges(new Map([['b', 'rtl']]), new Map([['b', 'mixed']]), nameOf)).toEqual([]);
  });

  test('not for a file that is new', () => {
    expect(groupChanges(new Map(), new Map([['b', 'sim-only']]), nameOf)).toEqual([]);
  });
});
