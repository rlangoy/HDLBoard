// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * Finds the legacy Synopsys packages in VHDL source (issue #37): GHDL compiles them only
 * with `-fsynopsys`, which the GHDL engine then turns on by itself. A `use` clause and a
 * fully qualified name (`IEEE.std_logic_arith.conv_std_logic_vector(...)`) both count;
 * comments and strings do not. Text analysis for the backend's own use. Pure.
 */

import type { VhdlFileInput } from '../protocol.js';
import { blankCommentsAndStrings, ghdlPosition } from './vhdlPorts.js';

export const LEGACY_PACKAGES = ['std_logic_arith', 'std_logic_signed', 'std_logic_unsigned'] as const;

/** `IEEE.std_logic_arith`, in any case, with any white space (line breaks too) around the dot. */
const LEGACY_REFERENCE = new RegExp(`\\bieee\\s*\\.\\s*(${LEGACY_PACKAGES.join('|')})\\b`, 'gi');

/** Where a file first names one legacy package, as GHDL counts lines and columns. */
export interface LegacyPackageUse {
  readonly fileName: string;
  /** Lower case: `std_logic_arith`. */
  readonly packageName: string;
  readonly line: number;
  readonly column: number;
}

/** The first reference to each legacy package in each file, in file order: one warning per package and file. */
export function findLegacyPackageUses(files: readonly VhdlFileInput[]): LegacyPackageUse[] {
  return files.flatMap(usesInFile);
}

function usesInFile({ name, content }: VhdlFileInput): LegacyPackageUse[] {
  const firstByPackage = new Map<string, LegacyPackageUse>();
  for (const match of blankCommentsAndStrings(content).matchAll(LEGACY_REFERENCE)) {
    const packageName = (match[1] ?? '').toLowerCase();
    if (firstByPackage.has(packageName)) continue;
    // GHDL's own error points at the package name, not at `IEEE`: the marker goes there too.
    const packageOffset = match.index + match[0].length - packageName.length;
    firstByPackage.set(packageName, { fileName: name, packageName, ...ghdlPosition(content, packageOffset) });
  }
  return [...firstByPackage.values()];
}

/**
 * A GHDL-shaped warning (`file:line:column:warning: …`), so the console shows it and the
 * editor marks the line, as it does GHDL's own warnings.
 */
export function legacyPackageWarning({ fileName, packageName, line, column }: LegacyPackageUse): string {
  return (
    `${fileName}:${line}:${column}:warning: Legacy Synopsys package detected: IEEE.${packageName}. ` +
    'Synopsys compatibility (-fsynopsys) has been enabled for this simulation. ' +
    'For new designs, prefer IEEE.numeric_std with explicit signed or unsigned types.'
  );
}
