// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * The types of the simulation-only check (docs/impl_sim_only_warnings.md § 5.1).
 * Pure data, no logic, structured-clone friendly like the detector's.
 */

import type { CodeBlock, Instance, ProjectAnalysis, TestbenchOverrides, TestbenchRegion } from '../tbDetect/types';
import type { DriverConflict } from './driverTypes';

/**
 * How badly a construct misses the hardware (§ 3.1): `never` can't be built, `ignored`
 * builds but synthesis drops part of it, `quiet` is harmless console output.
 */
export type Tier = 'never' | 'ignored' | 'quiet';

export type SimOnlyConstructId =
  | 'vhdl-wait-for' | 'vhdl-wait-forever' | 'vhdl-wait-until' | 'vhdl-clock-gen' | 'vhdl-file-io'
  | 'vhdl-end-sim' | 'vhdl-now' | 'vhdl-access' | 'vhdl-protected' | 'vhdl-random' | 'vhdl-real-signal'
  | 'vhdl-after' | 'vhdl-report'
  | 'vlog-delay' | 'vlog-event-wait' | 'vlog-clock-gen' | 'vlog-file-io' | 'vlog-end-sim' | 'vlog-time'
  | 'vlog-random' | 'vlog-verification' | 'vlog-real' | 'vlog-assign-delay' | 'vlog-display';

/** One construct on one line. */
export interface ConstructMatch {
  readonly construct: SimOnlyConstructId;
  readonly tier: Tier;
  readonly line: number;
}

/** An instance, and whether it sits in code hidden from synthesis (§ 4.3). */
export interface GuardedInstance extends Instance {
  readonly guarded: boolean;
}

/**
 * Code of one design unit in one file: the unit itself, or a VHDL architecture whose
 * entity is in another file (§ 4.1).
 */
export interface CodePart {
  readonly fileId: string;
  /** The entity or module the code belongs to, as written. */
  readonly unitName: string;
  /** False for an architecture whose entity is declared in another file. */
  readonly ownsUnit: boolean;
  readonly instances: readonly GuardedInstance[];
  readonly blocks: readonly CodeBlock[];
  /** Outside translate_off / `ifndef SYNTHESIS regions, line order. */
  readonly matches: readonly ConstructMatch[];
}

/** Every part of the project, per file id. */
export type ProjectParts = ReadonlyMap<string, readonly CodePart[]>;

export interface HardwareView {
  /** `unitRefKey` of every checked unit. */
  readonly hardware: ReadonlySet<string>;
  /** Testbench unit key -> the key of the design it tests (§ 4.2). */
  readonly dutOf: ReadonlyMap<string, string>;
  /** Unit keys whose role is corrected to `rtl` for pairing (§ 4.2). */
  readonly asDesign: ReadonlySet<string>;
}

/** The project as the check sees it: as detected, as corrected, and which code is hardware. */
export interface DesignView {
  readonly raw: ProjectAnalysis;
  /** `raw` with the `asDesign` units given the role `rtl`. */
  readonly corrected: ProjectAnalysis;
  readonly parts: ProjectParts;
  readonly hardware: HardwareView;
}

export interface SimOnlyFinding extends ConstructMatch {
  /** The file the line is in. */
  readonly fileId: string;
  readonly unitName: string;
  /** The key of the unit the code belongs to; another file's for an architecture of § 4.1. */
  readonly unitRef: string;
}

export type CodeGroup = 'rtl' | 'sim-only' | 'tb';
/** A file's group; `mixed-sim-only` is a testbench and a SIM-only design in one file. */
export type FileGroup = CodeGroup | 'mixed' | 'mixed-sim-only';

export interface CodeGroups {
  /** Per file id; absent for a file with no design unit. */
  readonly byFile: ReadonlyMap<string, FileGroup>;
  /** Per file: the blocks of SIM-only code that hold a finding. */
  readonly simOnlyRegions: ReadonlyMap<string, readonly TestbenchRegion[]>;
}

export type DesignCheckMode = 'synthesis' | 'simulation';

export interface CheckInput {
  readonly view: DesignView;
  readonly overrides: TestbenchOverrides;
}

/** What the check found, ready for the UI. */
export interface DesignCheck {
  /** Every finding in hardware code, including files marked *Simulation model*. */
  readonly findings: readonly SimOnlyFinding[];
  readonly groups: CodeGroups;
  /** Signals with more than one driver in hardware code (§ 8.1); they warn, and leave the group alone. */
  readonly driverConflicts: readonly DriverConflict[];
}
