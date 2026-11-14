// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * The project's Icarus options as `iverilog` flags, for both compile steps: reading the
 * top's ports and building the simulation must see the same language and macros. Also
 * which macros are defined once those flags are given, for tracing what Icarus expands. Pure.
 */

import type { IverilogOptions } from '../compilerOptions.js';

/** `-g2012`, then one `-D<name>=<value>` per macro; an empty value defines the name alone (`-D<name>`). */
export function iverilogFlags({ generation, defines }: IverilogOptions): string[] {
  const generationFlags = generation === undefined ? [] : [`-g${generation}`];
  const defineFlags = Object.entries(defines).map(([name, value]) => (value === '' ? `-D${name}` : `-D${name}=${value}`));
  return [...generationFlags, ...defineFlags];
}

/**
 * What Icarus defines before reading the first source: the driver's `__ICARUS__` and the
 * preprocessor's built-in `__FILE__` and `__LINE__`, which `ifdef sees as defined too. The
 * driver adds `__ICARUS_SYNTH__` for `-S` and `__VAMS_ENABLE__` for `-gverilog-ams`; HDLBoard
 * passes neither. Checked against Icarus 13.0 with `iverilog -E`.
 */
const ICARUS_OWN_MACROS: readonly string[] = ['__ICARUS__', '__FILE__', '__LINE__'];

/** Every macro defined when Icarus reads the first source: its own, then the project's. */
export function predefinedMacros({ defines }: IverilogOptions): string[] {
  return [...ICARUS_OWN_MACROS, ...Object.keys(defines)];
}
