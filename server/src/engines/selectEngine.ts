// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * The one place a language becomes an engine (docs/Verilog_implementation_plan.md
 * § 5.7). `Session` asks once per run and never mentions a language itself.
 */

import { ghdlEngine } from './ghdlEngine.js';
import { languageOfTopFile } from './language.js';
import type { Language, SimEngine } from './types.js';

/** Engines for the other languages arrive with step E4; until then everything runs on GHDL. */
const ENGINES: Partial<Record<Language, SimEngine>> = { vhdl: ghdlEngine };

/** The engine for a run whose top file is `topFile` (none marked: VHDL, as it has always been). */
export function selectEngine(topFile: string | undefined): SimEngine {
  return ENGINES[languageOfTopFile(topFile)] ?? ghdlEngine;
}
