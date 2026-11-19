// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * The catalogue of simulation-only constructs (docs/impl_sim_only_warnings.md § 5.1),
 * as data. Every construct has one `find`; a construct the detector already finds
 * reuses that rule's matcher (`fromRule`), so each regex lives in one place and
 * the detector's scores never change (S7). Pure.
 */

import { ruleById, type UnitText } from '../tbDetect/rules';
import type { RuleId } from '../tbDetect/types';
import type { RegisterProblem, SimOnlyConstructId, Tier } from './types';

/** A line, or a line with the names its message gives. */
export type Found = number | { readonly line: number; readonly register: RegisterProblem };

export interface SimOnlyConstruct {
  readonly id: SimOnlyConstructId;
  readonly tier: Tier;
  /** Lines where the construct is used as an operation, not only named (S10). */
  readonly find: (text: UnitText) => readonly Found[];
}

export function construct(id: SimOnlyConstructId, tier: Tier, find: SimOnlyConstruct['find']): SimOnlyConstruct {
  return { id, tier, find };
}

/**
 * A construct the detector's rule `ruleId` already matches. Only rules whose every
 * match is an operation are reused (S10); the construct is named after the rule
 * unless `id` says otherwise.
 */
export function fromRule(ruleId: RuleId & SimOnlyConstructId, tier: Tier): SimOnlyConstruct;
export function fromRule(ruleId: RuleId, tier: Tier, id: SimOnlyConstructId): SimOnlyConstruct;
export function fromRule(ruleId: RuleId, tier: Tier, id?: SimOnlyConstructId): SimOnlyConstruct {
  return construct(id ?? (ruleId as SimOnlyConstructId), tier, ruleById(ruleId).find);
}
