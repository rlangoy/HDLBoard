// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * The types of the simulation-only check (docs/impl_sim_only_warnings.md § 5.1).
 * Pure data, no logic, structured-clone friendly like the detector's.
 */

import type { CodeBlock, Instance, Language, ProjectAnalysis, TestbenchOverrides, TestbenchRegion } from '../tbDetect/types';
import type { DriverConflict } from './driverTypes';

/**
 * How badly a construct misses the hardware (§ 3.1): `never` can't be built, `ignored`
 * builds but synthesis drops part of it, `quiet` is harmless console output.
 */
export type Tier = 'never' | 'ignored' | 'quiet';

export type SimOnlyConstructId =
  | 'vhdl-wait-for' | 'vhdl-wait-forever' | 'vhdl-wait-until' | 'vhdl-clock-gen' | 'vhdl-file-io'
  | 'vhdl-end-sim' | 'vhdl-now' | 'vhdl-access' | 'vhdl-protected' | 'vhdl-random' | 'vhdl-real-signal'
  | 'vhdl-edge-template' | 'vhdl-after' | 'vhdl-report'
  | 'vlog-delay' | 'vlog-event-wait' | 'vlog-clock-gen' | 'vlog-file-io' | 'vlog-end-sim' | 'vlog-time'
  | 'vlog-random' | 'vlog-verification' | 'vlog-real' | 'vlog-edge-template' | 'vlog-level-storage' | 'vlog-assign-delay' | 'vlog-display'
  | 'sim-clock' | 'synth-check';

/**
 * Why no register can be built (§ 3.4): two clocks, both edges of one, a branch outside
 * the edge, two edges in one condition, a Verilog `if` that tests no edge, or a value
 * kept without an edge (a latch).
 */
export type RegisterProblemKind = 'two-clocks' | 'both-edges' | 'outside-edge' | 'combined-edges' | 'no-reset-tested' | 'reset-polarity' | 'set-and-reset' | 'async-load' | 'latch';

export interface RegisterProblem {
  readonly kind: RegisterProblemKind;
  /** What the code assigns, as written. */
  readonly registers: readonly string[];
  /** The clocks involved, as written: `KEY_N(1)`. */
  readonly clocks: readonly string[];
  /** The language of the code: the tooltip shows the template in it. */
  readonly language: Language;
  /** `reset-polarity`: the edge of the reset in `@( … )` (`negedge rst_n` is falling), which its level test should match. */
  readonly resetEdge?: 'rising' | 'falling';
}

/** The board's simulator-only clock (§ 3.5), and the real clock to use instead. */
export interface SimulatorClock {
  /** As the board names it: `CLOCK_500Hz` by default. */
  readonly name: string;
  readonly board: { readonly port: string; readonly mhz: number };
}

/** One construct on one line. */
export interface ConstructMatch {
  readonly construct: SimOnlyConstructId;
  readonly tier: Tier;
  readonly line: number;
  /** For the register checks: the names the message gives. */
  readonly register?: RegisterProblem;
  /** For `sim-clock`: the clock the line reads, and the board's own. */
  readonly simulatorClock?: SimulatorClock;
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
  /**
   * Files the student marked *Treat as testbench*: their code is never checked, even an
   * architecture of a hardware entity declared in another file (§ 4.1).
   */
  readonly testbenchFiles: ReadonlySet<string>;
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

/** The tools of the synthesis check at Start (docs/impl_sim_only_warnings.md § 7). */
export type SynthTool = 'ghdl' | 'icarus';

/**
 * What a synthesis tool's message means for the design (§ 7): it cannot be built as
 * written, synthesis builds something else than the simulation runs, or the tool could not say.
 */
export type SynthEffect = 'cannot-synthesize' | 'changed' | 'not-verified';

/** HDLBoard's words for a message: the sentence after the line, and the card's explanation. */
export interface FindingText {
  readonly headline: string;
  readonly explanation: string;
}

/**
 * A message of the synthesis check at Start, on a line of hardware code (§ 7). Only GHDL's
 * allowlisted messages have a tier, and only they make the design SIM-only; Icarus's never do.
 */
export interface ToolFinding {
  readonly fileId: string;
  readonly line: number;
  readonly tool: SynthTool;
  readonly effect: SynthEffect;
  /** The tier that makes the unit SIM-only; absent, the group stays as it is. */
  readonly tier?: 'never' | 'ignored';
  /** The key of the unit the line belongs to (`unitRefKey`). */
  readonly unitRef: string;
  readonly unitName: string;
  /** What the tool printed, without its file and line. */
  readonly toolMessage: string;
  /** A few words for the badge's *Detected* line: `latch`. */
  readonly title: string;
  readonly text: FindingText;
  /** Shown only in the gutter and the problem card: Icarus's advice. */
  readonly quiet: boolean;
}

export interface CheckInput {
  readonly view: DesignView;
  readonly overrides: TestbenchOverrides;
  /** The active board's simulator-only clock; without it, reading one is not checked. */
  readonly simulatorClock?: SimulatorClock;
  /** The synthesis check's findings for the code as it is now; absent, none (§ 7). */
  readonly toolFindings?: readonly ToolFinding[];
}

/** What the check found, ready for the UI. */
export interface DesignCheck {
  /** Every finding in hardware code, including files marked *Simulation model*. */
  readonly findings: readonly SimOnlyFinding[];
  readonly groups: CodeGroups;
  /** Signals with more than one driver in hardware code (§ 8.1); they warn, and leave the group alone. */
  readonly driverConflicts: readonly DriverConflict[];
  /**
   * The synthesis check's findings that make their design SIM-only, in code that is still
   * hardware (§ 7). With the live findings they decide the groups; a pass never clears a live one.
   */
  readonly toolFindings: readonly ToolFinding[];
}
