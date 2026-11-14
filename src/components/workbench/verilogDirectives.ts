// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import type { SourceToken } from './symbols/sourceTokens';

/** Directives that leave the source text as written. */
const HARMLESS_DIRECTIVES: ReadonlySet<string> = new Set(['`timescale', '`default_nettype']);

/**
 * True when Icarus's preprocessor may change the text (`define, `include,
 * `ifdef …), so the written tokens are not the ones it compiled.
 */
export function needsPreprocessing(tokens: readonly SourceToken[]): boolean {
  return tokens.some((token) => token.type === 'directive' && !HARMLESS_DIRECTIVES.has(token.text));
}
