// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * The types the testbench detector passes between its stages
 * (docs/impl_split_screen.md § 5, § 6.2). Pure data, no logic.
 */

import type { Language } from '../fileKinds';

export type { Language };

/** 1-based, inclusive. */
export interface LineSpan {
  readonly start: number;
  readonly end: number;
}

export interface CodeBlock {
  /** Process label, or e.g. "initial block". */
  readonly label: string;
  /** Whether the label is one the student wrote (a process label, a named `begin`). */
  readonly named: boolean;
  readonly kind: 'process' | 'initial' | 'always';
  readonly span: LineSpan;
  /** Offsets in the source, `to` exclusive. */
  readonly from: number;
  readonly to: number;
}

export interface Instance {
  readonly name: string;
  readonly line: number;
}

export interface DesignUnit {
  /** As written; VHDL comparisons are case-insensitive, Verilog's are not. */
  readonly name: string;
  readonly kind: 'entity' | 'module' | 'program';
  /** VHDL: from the context clause before the entity to the end of its last architecture. */
  readonly span: LineSpan;
  /** The line of `entity <name>` / `module <name>`. */
  readonly declLine: number;
  readonly hasPorts: boolean;
  readonly hasBoardPorts: boolean;
  /** The line of the first board port, when there is one. */
  readonly boardPortLine: number | undefined;
  /** Units this one instantiates, in source order. */
  readonly instances: readonly Instance[];
  /** process / initial / always blocks, for regions. */
  readonly blocks: readonly CodeBlock[];
  /** Offset ranges of the source that belong to this unit (`to` exclusive). */
  readonly ranges: readonly { readonly from: number; readonly to: number }[];
}

export type Confidence = 'low' | 'medium' | 'high';
export type UnitRole = 'rtl' | 'tb';
export type FileRole = 'rtl' | 'tb' | 'mixed';

export type RuleId =
  | 'vhdl-portless' | 'vhdl-wait-for' | 'vhdl-wait-forever' | 'vhdl-clock-gen' | 'vhdl-after'
  | 'vhdl-wait-until' | 'vhdl-file-io' | 'vhdl-end-sim' | 'vhdl-drives-dut' | 'vhdl-assert'
  | 'vhdl-tb-name' | 'vhdl-framework' | 'vhdl-sim-only' | 'vhdl-board-ports'
  | 'vlog-portless' | 'vlog-delay' | 'vlog-assign-delay' | 'vlog-clock-gen' | 'vlog-event-wait'
  | 'vlog-initial' | 'vlog-display' | 'vlog-end-sim' | 'vlog-file-io' | 'vlog-drives-dut'
  | 'vlog-tb-name' | 'vlog-sv-verif' | 'vlog-uvm' | 'vlog-sim-only' | 'vlog-assert' | 'vlog-board-ports';

export interface Evidence {
  readonly ruleId: RuleId;
  readonly line: number;
}

export interface EvidenceSummary {
  /** clamp(sum of distinct rule weights, 0, 100). */
  readonly score: number;
  /** Any rule of class strong fired. */
  readonly hasStrongEvidence: boolean;
  /** Board ports. */
  readonly vetoed: boolean;
}

export interface AnalyzedUnit extends DesignUnit {
  readonly evidence: readonly Evidence[];
  readonly summary: EvidenceSummary;
  readonly confidence: Confidence;
  readonly role: UnitRole;
}

export interface TestbenchRegion {
  readonly unitName: string;
  /** Block label, "clock generator", or the unit name. */
  readonly label: string;
  readonly span: LineSpan;
}

export interface FileAnalysis {
  readonly fileId: string;
  readonly name: string;
  readonly folder: 'vhdl' | 'verilog' | 'work';
  /** The content this result was computed from — the cache key. */
  readonly content: string;
  readonly language: Language;
  readonly units: readonly AnalyzedUnit[];
  readonly role: FileRole | undefined;
  readonly regions: readonly TestbenchRegion[];
}

export interface ProjectAnalysis {
  /** In the order of the project's files. */
  readonly byFile: ReadonlyMap<string, FileAnalysis>;
  /** Unit name (lower case for VHDL) -> defining file id, per language. */
  readonly unitIndex: Readonly<Record<Language, ReadonlyMap<string, string>>>;
}

export interface TestbenchOverrides {
  /** fileId -> forced role for every unit in the file. */
  readonly roles: Readonly<Record<string, UnitRole>>;
  /** design fileId -> testbench fileId. */
  readonly pairs: Readonly<Record<string, string>>;
}

export const EMPTY_OVERRIDES: TestbenchOverrides = { roles: {}, pairs: {} };

export interface PaneTarget {
  readonly fileId: string;
  readonly line: number;
  /** The unit this pane runs (the TB unit in a mixed file); `null` when the file declares none. */
  readonly unitName: string | null;
}

export interface EditorPair {
  readonly anchorId: string;
  readonly tb: PaneTarget | null;
  readonly rtl: PaneTarget | null;
  /** Confidence of the testbench side; 'high' when it comes from an override. */
  readonly tbConfidence: Confidence;
  /** The DUT the testbench instantiates when no file defines it (D22), else null. */
  readonly missingDut: string | null;
}
