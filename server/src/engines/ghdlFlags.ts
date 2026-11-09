// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * The options every GHDL command of one run is given. GHDL refuses to elaborate or run
 * units analysed with other options ("use of synopsys package … needs the -fsynopsys
 * option" from `-r` too), so `-a`, `-e` and `-r` all get this one list. Pure.
 */

import type { GhdlOptions } from '../compilerOptions.js';
import type { VhdlFileInput } from '../protocol.js';
import { findLegacyPackageUses, legacyPackageWarning } from './legacyPackages.js';

/** The standard the generated board testbench is written in. */
const GHDL_STANDARD = '--std=08';

/** GHDL's on/off options, once `auto` is decided. */
export interface GhdlSwitches {
  readonly synopsys: boolean;
  readonly relaxed: boolean;
}

/** The flag each switch adds. A new on/off option is one row here, plus its name in compilerOptions.ts. */
const SWITCH_FLAGS: Readonly<Record<keyof GhdlSwitches, string>> = {
  synopsys: '-fsynopsys',
  relaxed: '-frelaxed',
};

const SWITCH_NAMES = Object.keys(SWITCH_FLAGS) as (keyof GhdlSwitches)[];

export function ghdlFlags(switches: GhdlSwitches): string[] {
  return [GHDL_STANDARD, ...SWITCH_NAMES.filter((name) => switches[name]).map((name) => SWITCH_FLAGS[name])];
}

/** The flags of one run, and the warnings that go with them. */
export interface GhdlFlagPlan {
  readonly flags: readonly string[];
  readonly warnings: readonly string[];
}

export function planGhdlFlags(options: GhdlOptions, files: readonly VhdlFileInput[]): GhdlFlagPlan {
  const uses = findLegacyPackageUses(files);
  // Legacy option -fsynopsys enabled: on `auto` (the default), a run whose files use
  // std_logic_arith, std_logic_signed or std_logic_unsigned gets `-fsynopsys`, so a
  // student's legacy design compiles without anyone editing the project file (issue #37).
  // It is decided again for every run, so removing the last such package turns it off.
  const synopsys = options.synopsys === 'auto' ? uses.length > 0 : options.synopsys;
  // Said only when the flag is applied: with it turned off, GHDL's own error names the package.
  const warnings = synopsys ? uses.map(legacyPackageWarning) : [];
  return { flags: ghdlFlags({ synopsys, relaxed: options.relaxed }), warnings };
}
