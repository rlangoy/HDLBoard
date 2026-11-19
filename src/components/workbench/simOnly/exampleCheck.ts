// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * Which examples are SIM-only on a board (docs/impl_sim_only_warnings.md § 5.3): the
 * design check run on each example's own files, as a copy on that board would have
 * them, so the Examples card says what the editor will say once it is opened. Pure.
 */

import { boardDesignPortNames } from '../../../boards/boardPorts';
import type { BoardDefinition } from '../../../boards/types';
import { exampleSources, type Example } from '../examples';
import { analyzeProject } from '../tbDetect/analyzeProject';
import { EMPTY_OVERRIDES } from '../tbDetect/types';
import { DESIGN_CHECKS } from './designCheck';
import { designView } from './designView';
import { CONSTRUCT_TITLE } from './simOnlyText';
import { isSimOnlyGroup } from './simOnlyReport';
import { simulatorClockOf } from './simulatorClock';
import type { DesignCheckMode } from './types';

/** Why an example is SIM-only: the constructs in a few words (`simulator clock`, `flip-flop template`). */
export type SimOnlyReasons = readonly string[];

function reasonsOf(example: Example, board: BoardDefinition, mode: DesignCheckMode): SimOnlyReasons | undefined {
  const files = exampleSources(example, board);
  const view = designView(analyzeProject(files, boardDesignPortNames(board)), EMPTY_OVERRIDES);
  const check = DESIGN_CHECKS[mode]({ view, overrides: EMPTY_OVERRIDES, simulatorClock: simulatorClockOf(board) });
  const [opened] = files;
  if (!opened || !isSimOnlyGroup(check.groups.byFile.get(opened.id))) return undefined;
  const reasons = check.findings.filter((f) => f.fileId === opened.id && f.tier !== 'quiet').map((f) => CONSTRUCT_TITLE[f.construct]);
  return [...new Set(reasons)];
}

/** Example id → why its opened file is SIM-only on `board`; examples that run on the board are absent. */
export function simOnlyExamples(examples: readonly Example[], board: BoardDefinition, mode: DesignCheckMode): ReadonlyMap<string, SimOnlyReasons> {
  const result = new Map<string, SimOnlyReasons>();
  for (const example of examples) {
    const reasons = reasonsOf(example, board, mode);
    if (reasons) result.set(example.id, reasons);
  }
  return result;
}
