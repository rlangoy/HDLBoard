// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * What a synthesis check's answer means (docs/impl_sim_only_warnings.md § 7). The server
 * says only how the tool ended; here its messages get their meaning, from an allowlist:
 * only a GHDL message known to name a construct the FPGA cannot build may make a design
 * SIM-only. Every other message, every Icarus message, and every crash, timeout or missing
 * tool means *Could not verify*: never a verdict either way. Pure.
 */

import type { SynthOutcome } from '../../hdlClient';
import { parseDiagnostics, type Diagnostic } from '../../diagnostics';
import type { FindingText, SynthEffect, SynthTool } from '../types';
import { GHDL_TEXT, ICARUS_TEXT, multipleAssignmentsText, type UnverifiedReason } from './toolCheckText';

/** What one message means for the board. */
export interface Meaning {
  readonly effect: SynthEffect;
  /** Set only where the message proves the construct cannot run on the FPGA as written. */
  readonly tier?: 'never' | 'ignored';
  readonly title: string;
  readonly text: FindingText;
  /** Gutter and card only: advice the student need not act on. */
  readonly quiet: boolean;
}

/** A message the tool placed on a file and line, with its meaning. */
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
  /** Messages the tool gave no place: said for the design as a whole, never on a guessed line. */
  readonly unplaced: readonly string[];
}

interface Rule {
  readonly pattern: RegExp;
  readonly meaning: (message: string) => Meaning;
}

const never = (title: string, text: FindingText): Meaning => ({ effect: 'cannot-synthesize', tier: 'never', title, text, quiet: false });
const notVerified = (title: string, text: FindingText, quiet: boolean): Meaning => ({ effect: 'not-verified', title, text, quiet });

/** The signal GHDL names: `multiple assignments for "LEDR" offsets 0:0`. */
const signalOf = (message: string): string => /"([^"]+)"/.exec(message)?.[1] ?? 'This signal';

/** GHDL 6.0's wording, measured on the designs of server/src/integration/synthCheck.test.ts. */
const GHDL_RULES: readonly Rule[] = [
  { pattern: /wait statement not allowed for synthesis|wait must be the last statement/i, meaning: () => never('wait', GHDL_TEXT.wait) },
  { pattern: /signal assignment not allowed here/i, meaning: () => never('assignment in a waiting process', GHDL_TEXT.assignmentAfterWait) },
  { pattern: /access type.*not synthesizable/i, meaning: () => never('file I/O', GHDL_TEXT.fileIo) },
  {
    pattern: /latch infered for net/i,
    meaning: () => ({ effect: 'changed', tier: 'ignored', title: 'latch', text: GHDL_TEXT.latch, quiet: false }),
  },
  {
    // Wrong in the simulator too (it shows X): a warning, and the group stays (§ 8.1).
    pattern: /multiple assignments for/i,
    meaning: (message) => ({ effect: 'cannot-synthesize', title: 'two drivers', text: multipleAssignmentsText(signalOf(message)), quiet: false }),
  },
];

const GHDL_UNKNOWN: Rule = { pattern: /./, meaning: () => notVerified('GHDL message', GHDL_TEXT.unknown, false) };

/** Icarus's synthesis refuses legal Quartus code, so every one of its messages is advice (D1). */
const ICARUS_RULES: readonly Rule[] = [
  { pattern: /driven by more than one process/i, meaning: () => notVerified('Icarus note', ICARUS_TEXT.startValues, true) },
  { pattern: /Process not synthesized/i, meaning: () => notVerified('Icarus note', ICARUS_TEXT.processNotSynthesized, true) },
  { pattern: /Too many clocks|asynchronous set\/reset is misused/i, meaning: () => notVerified('Icarus note', ICARUS_TEXT.tooManyClocks, true) },
];

const ICARUS_UNKNOWN: Rule = { pattern: /./, meaning: () => notVerified('Icarus note', ICARUS_TEXT.unknown, true) };

function meaningOf(tool: SynthTool, message: string): Meaning {
  const [rules, unknown] = tool === 'ghdl' ? [GHDL_RULES, GHDL_UNKNOWN] : [ICARUS_RULES, ICARUS_UNKNOWN];
  return (rules.find((rule) => rule.pattern.test(message)) ?? unknown).meaning(message);
}

/**
 * The messages worth showing: GHDL's errors (its warnings are about the netlist, not the
 * board), Icarus's errors and warnings, one per line and text.
 */
function shownDiagnostics(tool: SynthTool, text: string): Diagnostic[] {
  const all = parseDiagnostics(text).filter((d) => tool === 'icarus' || d.severity === 'error');
  return all.filter((d, i) => all.findIndex((e) => e.fileName === d.fileName && e.line === d.line && e.message === d.message) === i);
}

/** An error printed with no `file:line:`: `ghdl.exe:error: cannot find entity …`, `*** These modules were missing:`. */
const UNPLACED_ERROR = /^(?:.*[\\/])?(?:ghdl|iverilog|ivl)[^\\/:]*:\s*(?:error|sorry):\s*(?<message>.+)$/i;
const PLACED = /^.+?:\d+:/;

function unplacedMessages(text: string): string[] {
  return text
    .split(/\r?\n/)
    .filter((line) => !PLACED.test(line))
    .flatMap((line) => {
      const message = UNPLACED_ERROR.exec(line.trim())?.groups?.message;
      return message === undefined ? [] : [message.trim()];
    });
}

const isVerdict = ({ meaning }: PlacedMessage): boolean => meaning.effect !== 'not-verified';

/** The meaning of a check's answer: `outcome` and `text` as the server sent them. */
export function classifyAnswer(tool: SynthTool, outcome: SynthOutcome, text: string): ClassifiedAnswer {
  // A crash's last words are no verdict: keyCouter2Led.v makes Icarus print an error, then segfault.
  if (outcome.kind !== 'exit') return { status: 'unverified', reason: outcome.kind, placed: [], unplaced: [] };
  const placed = shownDiagnostics(tool, text).map((diagnostic) => ({ diagnostic, meaning: meaningOf(tool, diagnostic.message) }));
  const unplaced = unplacedMessages(text);
  // Icarus's notes stay notes: exit 0 is a pass with them, anything else is advice, never a verdict.
  if (tool === 'icarus') return outcome.code === 0 ? { status: 'passed', placed, unplaced } : { status: 'unverified', reason: 'advisory', placed, unplaced };
  if (outcome.code === 0) return { status: 'passed', placed: [], unplaced: [] };
  if (placed.some(isVerdict)) return { status: 'found', placed, unplaced };
  return { status: 'unverified', reason: 'tool-error', placed, unplaced };
}
