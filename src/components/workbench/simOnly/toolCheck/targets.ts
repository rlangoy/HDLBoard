// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * What GHDL's synthesis check at Start checks (docs/impl_sim_only_warnings.md § 7): the
 * hardware top of the run and the run's files it may read. A board or design run checks
 * its own top; a testbench run checks the design it tests (`HardwareView.dutOf`), never the
 * testbench. VHDL only. When the unit is not clear, nothing is checked: a wrong check is
 * worse than none. From the same `HardwareView` as the live warnings and the groups. Pure.
 */

import { unitKey } from '../../tbDetect/analyzeProject';
import type { FileAnalysis, TestbenchOverrides, UnitRole } from '../../tbDetect/types';
import { isSimModel } from '../simModels';
import type { DesignView } from '../types';
import { fileOfKey, unitRefKey } from '../unitRef';
import type { SkipReason } from './toolCheckText';

export interface CheckTarget {
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

/** The hardware unit a run checks. */
interface CheckedUnit {
  readonly key: string;
  readonly name: string;
}

const skip = (reason: SkipReason): TargetChoice => ({ kind: 'skip', reason });
const sameVhdlName = (a: string, b: string): boolean => unitKey('vhdl', a) === unitKey('vhdl', b);

/** A VHDL `configuration … of …`: it, not the library's last architecture, decides what is built. */
const CONFIGURATION = /^\s*configuration\s+\w+\s+of\s+\w+/im;

/** The unit of `file` the run elaborates: the one named, the only one, or the only board design. */
function runUnit(file: FileAnalysis, unitName: string | null) {
  if (unitName !== null) return file.units.find((u) => sameVhdlName(u.name, unitName));
  if (file.units.length === 1) return file.units[0];
  const boardDesigns = file.units.filter((u) => u.hasBoardPorts);
  return boardDesigns.length === 1 ? boardDesigns[0] : undefined;
}

/** A unit's name as written, from its key: the detector's, or one only synthesis sees. */
function nameOf(view: DesignView, key: string): string | undefined {
  const fileId = fileOfKey(key);
  const keyed = (name: string) => unitRefKey(fileId, 'vhdl', name) === key;
  const detected = view.raw.byFile.get(fileId)?.units.find((u) => keyed(u.name))?.name;
  return detected ?? view.parts.get(fileId)?.find((p) => p.ownsUnit && keyed(p.unitName))?.unitName;
}

/** The key of the hardware unit a run on `key` checks: itself, or the design it tests. */
function hardwareKey(view: DesignView, key: string): string | undefined {
  return view.hardware.hardware.has(key) ? key : view.hardware.dutOf.get(key);
}

/** Why a run's unit leads to no hardware: the student's mark, a testbench with no design under test, or neither. */
function whyNoHardware(marked: UnitRole | undefined, detected: UnitRole): SkipReason {
  if (marked === 'tb' && detected === 'rtl') return 'treated-as-testbench';
  return (marked ?? detected) === 'tb' ? 'noDut' : 'noTop';
}

function checkedUnit({ view, overrides, topFileId, unitName }: TargetInput): CheckedUnit | SkipReason {
  const file = topFileId === null ? undefined : view.raw.byFile.get(topFileId);
  const unit = file && runUnit(file, unitName);
  if (file === undefined || unit === undefined) return 'noTop';
  if (file.language !== 'vhdl') return 'not-vhdl';
  const key = hardwareKey(view, unitRefKey(file.fileId, file.language, unit.name));
  if (key === undefined) return whyNoHardware(overrides.roles[file.fileId], unit.role);
  const name = nameOf(view, key);
  return name === undefined ? 'noTop' : { key, name };
}

/** The run's files that declare a unit by this name: more than one, and GHDL may take the other. */
function declarationsOf({ view, runFiles }: TargetInput, name: string): number {
  return runFiles.filter(({ id }) => {
    const ownUnits = [...(view.raw.byFile.get(id)?.units.map((u) => u.name) ?? []), ...(view.parts.get(id) ?? []).filter((p) => p.ownsUnit).map((p) => p.unitName)];
    return ownUnits.some((other) => sameVhdlName(other, name));
  }).length;
}

/** Why a hardware unit is not checked: the student's mark, or another file or a configuration could be built instead. */
function reasonNotToCheck(input: TargetInput, unit: CheckedUnit): SkipReason | undefined {
  const fileId = fileOfKey(unit.key);
  if (input.overrides.roles[fileId] === 'tb') return 'treated-as-testbench';
  if (isSimModel(input.overrides, fileId)) return 'sim-model';
  const configured = input.runFiles.some((f) => CONFIGURATION.test(f.content));
  return configured || declarationsOf(input, unit.name) > 1 ? 'ambiguous' : undefined;
}

/**
 * Whether the check reads a file: one that may hold hardware or what it uses. Only a file
 * of testbenches alone stays out; packages declare no unit and are read.
 */
function mayHoldHardware({ view, overrides }: TargetInput, file: FileAnalysis | undefined): boolean {
  if (file === undefined || file.units.length === 0) return true;
  const marked = overrides.roles[file.fileId];
  if (marked !== undefined) return marked === 'rtl';
  return file.units.some((u) => view.hardware.hardware.has(unitRefKey(file.fileId, file.language, u.name)) || u.role === 'rtl');
}

export function checkTarget(input: TargetInput): TargetChoice {
  const unit = checkedUnit(input);
  if (typeof unit === 'string') return skip(unit);
  const reason = reasonNotToCheck(input, unit);
  if (reason !== undefined) return skip(reason);
  const topFileId = fileOfKey(unit.key);
  const fileIds = input.runFiles.map((f) => f.id).filter((id) => id === topFileId || mayHoldHardware(input, input.view.raw.byFile.get(id)));
  return { kind: 'check', target: { top: unit.name, topFileId, fileIds } };
}
