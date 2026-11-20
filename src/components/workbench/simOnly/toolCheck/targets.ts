// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * What the synthesis check at Start checks (docs/impl_sim_only_warnings.md § 7): the
 * hardware top of the run and the run's files it may read. A board or design run checks
 * its own top; a testbench run checks the design it tests (`HardwareView.dutOf`), never the
 * testbench. When the unit is not clear, nothing is checked: a wrong check is worse than
 * none. From the same `HardwareView` as the live warnings and the groups. Pure.
 */

import { unitKey } from '../../tbDetect/analyzeProject';
import type { FileAnalysis, TestbenchOverrides } from '../../tbDetect/types';
import { isSimModel } from '../simModels';
import type { DesignView, SynthTool } from '../types';
import { fileOfKey, unitRefKey } from '../unitRef';
import type { SkipReason } from './toolCheckText';

export interface CheckTarget {
  readonly tool: SynthTool;
  /** The unit synthesized, as written. */
  readonly top: string;
  readonly topFileId: string;
  /** The run's files the check reads: every one but a testbench's alone, in the run's order. */
  readonly fileIds: readonly string[];
}

export type TargetChoice = { readonly kind: 'check'; readonly target: CheckTarget } | { readonly kind: 'skip'; readonly reason: SkipReason };

export interface TargetInput {
  readonly view: DesignView;
  readonly overrides: TestbenchOverrides;
  /** The files the run sends (`filesForRun`), with the content they run with. */
  readonly runFiles: readonly { readonly id: string; readonly content: string }[];
  /** The top file; null when Start runs with none marked. */
  readonly topFileId: string | null;
  /** The unit of the top file that runs, when the run names one. */
  readonly unitName: string | null;
}

const skip = (reason: SkipReason): TargetChoice => ({ kind: 'skip', reason });

/** The unit of `file` the run elaborates: the one named, the only one, or the only board design. */
function runUnit(file: FileAnalysis, unitName: string | null) {
  if (unitName !== null) return file.units.find((u) => unitKey(file.language, u.name) === unitKey(file.language, unitName));
  if (file.units.length === 1) return file.units[0];
  const boardDesigns = file.units.filter((u) => u.hasBoardPorts);
  return boardDesigns.length === 1 ? boardDesigns[0] : undefined;
}

/** A unit's name as written, from its key: the detector's, or one only synthesis sees. */
function nameOf(view: DesignView, key: string): string | undefined {
  const fileId = fileOfKey(key);
  const file = view.raw.byFile.get(fileId);
  if (file === undefined) return undefined;
  const named = (name: string) => unitRefKey(fileId, file.language, name) === key;
  return file.units.find((u) => named(u.name))?.name ?? view.parts.get(fileId)?.find((p) => p.ownsUnit && named(p.unitName))?.unitName;
}

/** A unit by its name and language. */
interface NamedUnit {
  readonly language: FileAnalysis['language'];
  readonly name: string;
}

/** The files of the run that declare a unit by this name: more than one, and the tool may take the other. */
function declaringFiles(view: DesignView, runFileIds: readonly string[], { language, name }: NamedUnit): number {
  const same = (other: string) => unitKey(language, other) === unitKey(language, name);
  return runFileIds.filter((id) => {
    const file = view.raw.byFile.get(id);
    const parts = view.parts.get(id) ?? [];
    return file?.language === language && (file.units.some((u) => same(u.name)) || parts.some((p) => p.ownsUnit && same(p.unitName)));
  }).length;
}

/** A VHDL `configuration … of …`: it, not the library's last architecture, decides what is built. */
const CONFIGURATION = /^\s*configuration\s+\w+\s+of\s+\w+/im;

/** A file of testbenches alone: no unit of it is hardware. Packages and headers declare none and stay. */
function isTestbenchOnly(view: DesignView, overrides: TestbenchOverrides, file: FileAnalysis | undefined): boolean {
  if (file === undefined || file.units.length === 0) return false;
  if (overrides.roles[file.fileId] === 'tb') return true;
  return file.units.every((u) => {
    const hardware = view.hardware.hardware.has(unitRefKey(file.fileId, file.language, u.name));
    return !hardware && (overrides.roles[file.fileId] ?? u.role) === 'tb';
  });
}

/** The key of the hardware unit a run on `key` checks: itself, or the design it tests. */
function hardwareKey(view: DesignView, key: string): string | undefined {
  return view.hardware.hardware.has(key) ? key : view.hardware.dutOf.get(key);
}

/** The hardware unit the run checks, by key and name, or why there is none. */
type Checked = { readonly key: string; readonly name: string; readonly file: FileAnalysis } | { readonly skip: SkipReason };

function checkedUnit({ view, topFileId, unitName }: TargetInput): Checked {
  const file = topFileId === null ? undefined : view.raw.byFile.get(topFileId);
  const unit = file && runUnit(file, unitName);
  if (file === undefined || unit === undefined) return { skip: 'noTop' };
  const key = hardwareKey(view, unitRefKey(file.fileId, file.language, unit.name));
  if (key === undefined) return { skip: unit.role === 'tb' ? 'noDut' : 'noTop' };
  const name = nameOf(view, key);
  return name === undefined ? { skip: 'noTop' } : { key, name, file };
}

/** Why the unit is not checked although it is hardware: the student's mark, or another file or a configuration could be built instead. */
function reasonNotToCheck(input: TargetInput, unit: Extract<Checked, { key: string }>): SkipReason | undefined {
  const fileId = fileOfKey(unit.key);
  if (input.overrides.roles[fileId] === 'tb') return 'treated-as-testbench';
  if (isSimModel(input.overrides, fileId)) return 'sim-model';
  const configured = unit.file.language === 'vhdl' && input.runFiles.some((f) => CONFIGURATION.test(f.content));
  const declarations = declaringFiles(input.view, input.runFiles.map((f) => f.id), { language: unit.file.language, name: unit.name });
  return configured || declarations > 1 ? 'ambiguous' : undefined;
}

export function checkTarget(input: TargetInput): TargetChoice {
  const unit = checkedUnit(input);
  if ('skip' in unit) return skip(unit.skip);
  const reason = reasonNotToCheck(input, unit);
  if (reason !== undefined) return skip(reason);
  const { view, overrides } = input;
  const topFileId = fileOfKey(unit.key);
  const fileIds = input.runFiles.map((f) => f.id).filter((id) => id === topFileId || !isTestbenchOnly(view, overrides, view.raw.byFile.get(id)));
  const tool: SynthTool = unit.file.language === 'vhdl' ? 'ghdl' : 'icarus';
  return { kind: 'check', target: { tool, top: unit.name, topFileId, fileIds } };
}
