// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * Score, confidence and role of a unit (docs/impl_split_screen.md § 5.5, D4, D6,
 * D23). Every rule counts once however many lines it matched; whether a unit is a
 * testbench is decided by the *class* of its evidence, the score only separates
 * medium from low. Pure.
 */

import { ruleById } from './rules';
import type { Confidence, Evidence, EvidenceSummary, FileRole, UnitRole } from './types';

/** Weak evidence alone makes a probable testbench from here up (D6). */
export const MEDIUM_FROM = 40;

const clamp = (value: number, min: number, max: number): number => Math.min(Math.max(value, min), max);

/** Each rule counts once, however many lines match it; the lines are all kept as evidence. */
export function summarize(evidence: readonly Evidence[]): EvidenceSummary {
  const rules = [...new Set(evidence.map((e) => e.ruleId))].map(ruleById);
  return {
    score: clamp(rules.reduce((sum, r) => sum + r.weight, 0), 0, 100),
    hasStrongEvidence: rules.some((r) => r.strength === 'strong'),
    vetoed: rules.some((r) => r.strength === 'veto'),
  };
}

/** D23: the class decides high, the score only separates medium from low. */
export function confidenceOf(e: EvidenceSummary): Confidence {
  if (e.vetoed) return 'low';
  if (e.hasStrongEvidence) return 'high';
  return e.score >= MEDIUM_FROM ? 'medium' : 'low';
}

/** A unit is a testbench from medium up — the bar for pairing and for the chip. */
export const roleOf = (confidence: Confidence): UnitRole => (confidence === 'low' ? 'rtl' : 'tb');

/** `tb` if all units are, `rtl` if none are, `mixed` otherwise; no units -> undefined. */
export function fileRoleOf(roles: readonly UnitRole[]): FileRole | undefined {
  if (roles.length === 0) return undefined;
  if (roles.every((r) => r === 'tb')) return 'tb';
  return roles.includes('tb') ? 'mixed' : 'rtl';
}

const RANK: Readonly<Record<Confidence, number>> = { low: 0, medium: 1, high: 2 };

export const maxConfidence = (list: readonly Confidence[]): Confidence =>
  list.reduce<Confidence>((best, c) => (RANK[c] > RANK[best] ? c : best), 'low');
