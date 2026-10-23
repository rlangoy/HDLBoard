// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import { describe, expect, test } from 'vitest';
import { fixtureBytes } from './fixtures.testSupport';
import { parseGhw } from './ghwParser';
import { layoutOf, savedViewOf } from './savedView';
import { sectionsOf, stepMove } from './signalOrder';
import { listRows } from './signalRows';
import { savedLayoutFor } from './useSavedView';
import { setupFor, toggleExpanded, toggleShown, toMemory, withMove, withShowAs, type ViewSetup } from './viewSetup';

const data = parseGhw(fixtureBytes('wave_types.ghw'));
const TB = 'wave_types_tb';
const context = { moments: {}, fittingRows: 3 };

/** The first view with `dut/count` ticked and shown as decimal, and `q` moved to the top of TB and unfolded. */
function studentSetup(): ViewSetup {
  const first = setupFor(data, null, context);
  const ticked = withShowAs(toggleShown(first, `${TB}/dut/count`), `${TB}/dut/count`, 'decimal');
  const move = stepMove(sectionsOf(listRows(data, ticked.list)), `${TB}/q`, 'top');
  if (move === null) throw new Error('q can move to the top of TB');
  return toggleExpanded(withMove(ticked, move), `${TB}/q`);
}

describe('the view saved with the project', () => {
  test('names each shown signal below its testbench, in its order, with what the student chose', () => {
    expect(savedViewOf(TB, studentSetup())).toEqual({
      signals: [{ path: 'q', expanded: true }, { path: 'clk' }, { path: 'rst' }, { path: 'dut/count', showAs: 'decimal' }],
    });
  });

  test('read back, it is the same layout', () => {
    const setup = studentSetup();
    const layout = layoutOf(TB, savedViewOf(TB, setup));
    expect(layout).toEqual({ shown: setup.list.shown, expanded: [...setup.list.expanded], showAs: [...setup.showAs] });
  });

  test('a "Show as" this version does not know is left out', () => {
    expect(layoutOf(TB, { signals: [{ path: 'q', showAs: 'octal' }] }).showAs).toEqual([]);
  });

  test('is found by the testbench of the waveform', () => {
    const view = { signals: [{ path: 'rst' }] };
    expect(savedLayoutFor(data, { of: (tb) => (tb === TB ? view : undefined), save: () => undefined })?.shown).toEqual([`${TB}/rst`]);
  });
});

describe('where a new waveform view starts', () => {
  const saved = layoutOf(TB, { signals: [{ path: 'dut/count', showAs: 'binary' }, { path: 'gone' }, { path: 'clk' }] });

  test("the project's saved view, for the signals that still exist, over the whole run", () => {
    const setup = setupFor(data, null, { ...context, saved });
    expect(setup.list.shown).toEqual([`${TB}/dut/count`, `${TB}/clk`]);
    expect(setup.showAs.get(`${TB}/dut/count`)).toBe('binary');
    expect(setup.window).toEqual({ start: 0, end: data.endTime });
  });

  test("this session's own setup comes first: it is newer", () => {
    const own = toMemory({ ...studentSetup(), window: { start: 10, end: 20 } });
    const setup = setupFor(data, own, { ...context, saved });
    expect(setup.list.shown).toEqual(own.shown);
    expect(setup.window).toEqual({ start: 10, end: 20 });
  });

  test('a saved view of signals that are all gone is the first view', () => {
    const elsewhere = layoutOf('other_tb', { signals: [{ path: 'clk' }] });
    expect(setupFor(data, null, { ...context, saved: elsewhere }).list.shown).toEqual(setupFor(data, null, context).list.shown);
  });
});
