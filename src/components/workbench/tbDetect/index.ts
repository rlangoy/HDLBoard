// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/** The testbench detector's public surface (docs/impl_split_screen.md § 6.1). */

export { analyzeProject, analyzeFile, findUnit, withRoleOverride, unitKey, type SourceFile } from './analyzeProject';
export { findPair, effectiveFile, contradictsCode, testbenchCandidates, testbenchStem, type PairCandidate } from './pairing';
export { ruleById } from './rules';
export { MEDIUM_FROM, confidenceOf } from './score';
export * from './types';
