// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * The project's Icarus options as `iverilog` flags, for both compile steps: reading the
 * top's ports and building the simulation must see the same language and macros. Pure.
 */

import type { IverilogOptions } from '../compilerOptions.js';

/** `-g2012`, then one `-D<name>=<value>` per macro; an empty value defines the name alone (`-D<name>`). */
export function iverilogFlags({ generation, defines }: IverilogOptions): string[] {
  const generationFlags = generation === undefined ? [] : [`-g${generation}`];
  const defineFlags = Object.entries(defines).map(([name, value]) => (value === '' ? `-D${name}` : `-D${name}=${value}`));
  return [...generationFlags, ...defineFlags];
}
