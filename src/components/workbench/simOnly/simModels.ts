// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * The *Simulation model* mark (docs/impl_sim_only_warnings.md S9), kept with the
 * role overrides and saved in the desktop workspace like them. A missing field reads
 * as no marks, so older workspaces load and older apps ignore it. Pure.
 */

import type { TestbenchOverrides } from '../tbDetect/types';

export const isSimModel = (overrides: TestbenchOverrides, fileId: string): boolean => overrides.simModels?.[fileId] === true;

export function withSimModel(overrides: TestbenchOverrides, fileId: string): TestbenchOverrides {
  return { ...overrides, simModels: { ...overrides.simModels, [fileId]: true } };
}

export function withoutSimModel(overrides: TestbenchOverrides, fileId: string): TestbenchOverrides {
  if (!isSimModel(overrides, fileId)) return overrides;
  const { [fileId]: _removed, ...rest } = overrides.simModels ?? {};
  return withMarks(overrides, rest);
}

/** The marks of `raw` (a saved workspace) that name a known file; none -> no field. */
export function parseSimModels(raw: unknown, known: (id: unknown) => id is string): Pick<TestbenchOverrides, 'simModels'> {
  const entries = raw && typeof raw === 'object' ? Object.entries(raw).filter(([id, on]) => known(id) && on === true) : [];
  return entries.length === 0 ? {} : { simModels: Object.fromEntries(entries.map(([id]) => [id, true as const])) };
}

/** `overrides` with exactly `marks`; an empty set of marks leaves the field out. */
function withMarks(overrides: TestbenchOverrides, marks: Readonly<Record<string, true>>): TestbenchOverrides {
  const { simModels: _old, ...rest } = overrides;
  return Object.keys(marks).length === 0 ? rest : { ...rest, simModels: marks };
}
