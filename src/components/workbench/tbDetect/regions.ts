// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * The testbench regions of a file (docs/impl_split_screen.md § 5.6): for each
 * testbench unit, every block that carries evidence, plus VHDL's concurrent clock
 * generators as one-line regions. A testbench unit with no such block is one
 * region, the unit itself. The TB pane opens at the first; the region navigator
 * cycles through them. Pure.
 */

import type { AnalyzedUnit, CodeBlock, TestbenchRegion } from './types';

const CLOCK_GENERATOR = 'clock generator';
const CLOCK_RULES: ReadonlySet<string> = new Set(['vhdl-clock-gen', 'vlog-clock-gen']);

export function regionsOf(units: readonly AnalyzedUnit[]): TestbenchRegion[] {
  return units.filter((u) => u.role === 'tb').flatMap(unitRegions);
}

function unitRegions(unit: AnalyzedUnit): TestbenchRegion[] {
  const within = (line: number, b: CodeBlock): boolean => line >= b.span.start && line <= b.span.end;
  const blockRegions = unit.blocks
    .filter((b) => unit.evidence.some((e) => within(e.line, b)))
    .map((b) => ({ unitName: unit.name, label: blockLabel(unit, b), span: b.span }));
  const clockRegions = unit.evidence
    .filter((e) => CLOCK_RULES.has(e.ruleId) && !unit.blocks.some((b) => within(e.line, b)))
    .map((e) => ({ unitName: unit.name, label: CLOCK_GENERATOR, span: { start: e.line, end: e.line } }));
  const regions = [...blockRegions, ...clockRegions].sort((a, b) => a.span.start - b.span.start);
  if (regions.length > 0) return regions;
  return [{ unitName: unit.name, label: unit.name, span: { start: unit.declLine, end: unit.span.end } }];
}

/** A block's own label when the student wrote one; "clock generator" for an unnamed clock block. */
function blockLabel(unit: AnalyzedUnit, block: CodeBlock): string {
  if (block.named) return block.label;
  const isClock = unit.evidence.some(
    (e) => CLOCK_RULES.has(e.ruleId) && e.line >= block.span.start && e.line <= block.span.end,
  );
  return isClock ? CLOCK_GENERATOR : block.label;
}
