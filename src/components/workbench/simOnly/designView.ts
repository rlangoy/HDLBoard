// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * The project as the design check sees it (docs/impl_sim_only_warnings.md § 4.2):
 * the hardware, and the analysis with the role correction applied — a unit the
 * board design uses, or a testbench's resolved DUT, is a design for pairing, the
 * split view and Run. The correction is derived, never stored: the student's own
 * mark is applied on top of it by `effectiveFile`, so it always wins. Pure.
 */

import { withUnits } from '../tbDetect/analyzeProject';
import type { FileAnalysis, ProjectAnalysis, TestbenchOverrides } from '../tbDetect/types';
import { hardwareView } from './hardware';
import { partsOf, type ForeignPorts } from './matches';
import type { DesignView, HardwareView } from './types';
import { unitRefKey } from './unitRef';

/** The last view per analysis object: React asks for it many times with the same inputs. */
const cache = new WeakMap<ProjectAnalysis, { overrides: TestbenchOverrides; view: DesignView }>();

export function designView(raw: ProjectAnalysis, overrides: TestbenchOverrides): DesignView {
  const cached = cache.get(raw);
  if (cached?.overrides === overrides) return cached.view;
  const portsOf = entityPorts(raw);
  const parts = new Map([...raw.byFile].map(([id, file]) => [id, partsOf(file, portsOf)]));
  const hardware = hardwareView(raw, overrides, parts);
  const view: DesignView = { raw, corrected: withHardwareRoles(raw, hardware), parts, hardware };
  cache.set(raw, { overrides, view });
  return view;
}

/** The ports of each VHDL entity of the project, by name: an architecture in another file reads with them. */
function entityPorts(raw: ProjectAnalysis): ForeignPorts {
  const ports = new Map<string, readonly string[]>();
  for (const file of raw.byFile.values()) {
    if (file.language !== 'vhdl') continue;
    for (const unit of file.units) if (!ports.has(unit.name.toLowerCase())) ports.set(unit.name.toLowerCase(), unit.portNames);
  }
  return (name) => ports.get(name.toLowerCase()) ?? [];
}

/** `raw` with every `asDesign` testbench unit given the role `rtl`; unchanged files keep their object. */
export function withHardwareRoles(raw: ProjectAnalysis, hardware: HardwareView): ProjectAnalysis {
  if (hardware.asDesign.size === 0) return raw;
  const byFile = new Map([...raw.byFile].map(([id, file]) => [id, correctedFile(file, hardware.asDesign)]));
  return { ...raw, byFile };
}

function correctedFile(file: FileAnalysis, asDesign: ReadonlySet<string>): FileAnalysis {
  const corrects = (name: string) => asDesign.has(unitRefKey(file.fileId, file.language, name));
  if (!file.units.some((u) => u.role === 'tb' && corrects(u.name))) return file;
  return withUnits(file, file.units.map((u) => (u.role === 'tb' && corrects(u.name) ? { ...u, role: 'rtl' } : u)));
}
