// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import { describe, expect, it } from 'vitest';
import type { VhdlFile } from '../workbench/files';
import { filesOf, newestOrigin, originOf, withOrigin, type RunOrigin, type RunOrigins } from './runOrigins';

const VHDL: RunOrigin = { source: 'tb-vhd|counter_tb', fileIds: ['counter.vhd', 'counter_tb.vhd'] };
const VERILOG: RunOrigin = { source: 'tb-v|counter_tb', fileIds: ['counter.v', 'counter_tb.v'] };

const file = (id: string, name = id): VhdlFile => ({ id, name, folder: id.endsWith('.v') ? 'verilog' : 'vhdl', content: '' });

const both = withOrigin(withOrigin([], 1, VHDL), 2, VERILOG);

describe('run origins', () => {
  it('offer the newest run', () => {
    expect(newestOrigin(both)).toBe(VERILOG);
  });

  it("keep the shown waveform's run while the newest one is still loading", () => {
    expect(originOf(both, 1)).toBe(VHDL);
  });

  it('know no origin for a run that offered nothing', () => {
    expect(originOf(both, 7)).toBeNull();
  });

  it('know no origin while nothing is shown', () => {
    expect(originOf(both, null)).toBeNull();
  });

  it('keep only the last few runs', () => {
    const many = [1, 2, 3, 4, 5, 6].reduce<RunOrigins>((origins, run) => withOrigin(origins, run, VHDL), []);
    expect(many.map(([run]) => run)).toEqual([3, 4, 5, 6]);
  });

  it('keep one origin per run', () => {
    expect(withOrigin(both, 2, VHDL).length).toBe(2);
  });
});

describe("a run's files", () => {
  const files = [file('counter.vhd'), file('counter_tb.vhd'), file('counter.v'), file('counter_tb.v')];

  it('are the files it compiled', () => {
    expect(filesOf(VERILOG, files).map((f) => f.name)).toEqual(['counter.v', 'counter_tb.v']);
  });

  it('follow a rename', () => {
    const renamed = [file('counter.v'), file('counter_tb.v', 'top_tb.v')];
    expect(filesOf(VERILOG, renamed).map((f) => f.name)).toEqual(['counter.v', 'top_tb.v']);
  });

  it('are every file while the run is not known', () => {
    expect(filesOf(null, files)).toBe(files);
  });
});
