// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * What GHDL's synthesis answer means (docs/impl_sim_only_warnings.md § 7). The server says
 * only how GHDL ended; here its messages get their meaning, from an allowlist: only a
 * message known to name a construct the FPGA cannot build as written is a verdict. Any
 * other message, and a crash, a timeout or a missing tool, means *Could not verify*:
 * never a verdict either way. Pure.
 */

import type { SynthOutcome } from '../../hdlClient';
import { parseDiagnostics, type Diagnostic } from '../../diagnostics';
import type { FindingText, SimOnlyTier, SynthEffect } from '../types';
import { GHDL_TEXT, multipleAssignmentsText, type UnverifiedReason } from './toolCheckText';

/** What one message means for the board. */
export interface Meaning {
  readonly effect: SynthEffect;
  /** Set only where the message proves the construct cannot run on the FPGA as written. */
  readonly tier?: SimOnlyTier;
  readonly title: string;
  readonly text: FindingText;
}

/** A message GHDL placed on a file and line, with its meaning. */
export interface PlacedMessage {
  readonly diagnostic: Diagnostic;
  readonly meaning: Meaning;
}

export type CheckStatus = 'passed' | 'found' | 'unverified';

export interface ClassifiedAnswer {
  readonly status: CheckStatus;
  /** Why it is *Could not verify*; absent unless it is. */
  readonly reason?: UnverifiedReason;
  readonly placed: readonly PlacedMessage[];
  /** Messages GHDL gave no place: said for the design as a whole, never on a guessed line. */
  readonly unplaced: readonly string[];
}

interface Rule {
  readonly pattern: RegExp;
  readonly meaning: (message: string) => Meaning;
}

const cannotBuild = (title: string, text: FindingText): Meaning => ({ effect: 'cannot-synthesize', tier: 'never', title, text });

/** The signal GHDL names: `multiple assignments for "LEDR" offsets 0:0`. */
const signalOf = (message: string): string => /"([^"]+)"/.exec(message)?.[1] ?? 'This signal';

/** GHDL 6.0's wording, measured on the designs of server/src/integration/synthCheck.test.ts. */
const RULES: readonly Rule[] = [
  { pattern: /wait statement not allowed for synthesis|wait must be the last statement/i, meaning: () => cannotBuild('wait', GHDL_TEXT.wait) },
  { pattern: /signal assignment not allowed here/i, meaning: () => cannotBuild('assignment in a waiting process', GHDL_TEXT.assignmentAfterWait) },
  { pattern: /access type.*not synthesizable/i, meaning: () => cannotBuild('file I/O', GHDL_TEXT.fileIo) },
  { pattern: /latch infered for net/i, meaning: () => ({ effect: 'changed', tier: 'ignored', title: 'latch', text: GHDL_TEXT.latch }) },
  {
    // Wrong in the simulator too (it shows X): a warning, and the group stays (§ 8.1).
    pattern: /multiple assignments for/i,
    meaning: (message) => ({ effect: 'cannot-synthesize', title: 'two drivers', text: multipleAssignmentsText(signalOf(message)) }),
  },
];

const UNKNOWN: Meaning = { effect: 'not-verified', title: 'GHDL message', text: GHDL_TEXT.unknown };

const meaningOf = (message: string): Meaning => RULES.find((rule) => rule.pattern.test(message))?.meaning(message) ?? UNKNOWN;

/** GHDL's errors, one per line and text; its warnings are about the netlist, not the board. */
function errorsIn(text: string): Diagnostic[] {
  const errors = parseDiagnostics(text).filter((d) => d.severity === 'error');
  return errors.filter((d, i) => errors.findIndex((e) => e.fileName === d.fileName && e.line === d.line && e.message === d.message) === i);
}

/** An error printed with no `file:line:`: `C:\…\ghdl.exe:error: cannot find entity …`. */
const UNPLACED_ERROR = /^(?:.*[\\/])?ghdl[^\\/:]*:\s*error:\s*(?<message>.+)$/i;

function unplacedErrorsIn(text: string): string[] {
  return text.split(/\r?\n/).flatMap((line) => {
    const message = UNPLACED_ERROR.exec(line.trim())?.groups?.message;
    return message === undefined ? [] : [message.trim()];
  });
}

const isVerdict = ({ meaning }: PlacedMessage): boolean => meaning.effect !== 'not-verified';

/** The meaning of a check's answer: `outcome` and `text` as the server sent them. */
export function classifyAnswer(outcome: SynthOutcome, text: string): ClassifiedAnswer {
  // What a crashed or stopped GHDL printed is no verdict.
  if (outcome.kind !== 'exit') return { status: 'unverified', reason: outcome.kind, placed: [], unplaced: [] };
  if (outcome.code === 0) return { status: 'passed', placed: [], unplaced: [] };
  const placed = errorsIn(text).map((diagnostic) => ({ diagnostic, meaning: meaningOf(diagnostic.message) }));
  const unplaced = unplacedErrorsIn(text);
  return placed.some(isVerdict) ? { status: 'found', placed, unplaced } : { status: 'unverified', reason: 'tool-error', placed, unplaced };
}
