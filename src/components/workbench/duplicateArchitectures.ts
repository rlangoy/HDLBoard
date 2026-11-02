// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * Two architectures of one entity with the same name (`rtl` twice): the library
 * keeps only the one analysed last. GHDL warns about it only within one file,
 * and the backend drops warnings when the analysis succeeds, so HDLBoard checks
 * the run's files itself at Start. Pure.
 */

import type { RunSnapshot } from './diagnosticLocation';
import { projectCheckText } from './diagnosticText';
import { languageOfName } from './fileKinds';
import { architectureHeaders, architectureKey, type ArchitectureHeader } from './vhdlUnits';

interface PlacedArchitecture extends ArchitectureHeader {
  readonly fileName: string;
}

function warningFor(later: PlacedArchitecture, earlier: PlacedArchitecture): string {
  const where = earlier.fileName === later.fileName ? { line: earlier.line } : earlier;
  const message = projectCheckText.duplicateArchitecture(later.name, later.entity, where);
  return `${later.fileName}:${later.line}:1:warning: ${message}`;
}

/**
 * One warning, in GHDL's format, on every architecture whose entity and name an
 * earlier one already has; the run's file order decides which is earlier.
 */
export function duplicateArchitectureWarnings(snapshot: RunSnapshot): string[] {
  const first = new Map<string, PlacedArchitecture>();
  const warnings: string[] = [];
  for (const file of snapshot.files.filter(({ name }) => languageOfName(name) === 'vhdl')) {
    for (const header of architectureHeaders(file.content)) {
      const architecture = { ...header, fileName: file.name };
      const earlier = first.get(architectureKey(architecture));
      if (earlier === undefined) first.set(architectureKey(architecture), architecture);
      else warnings.push(warningFor(architecture, earlier));
    }
  }
  return warnings;
}
