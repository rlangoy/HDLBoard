// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * The words of GHDL's synthesis check at Start (docs/impl_sim_only_warnings.md § 7): who
 * says it, what a message means for the board, and the console lines. English, like the
 * rest of the design check (designCheckText.ts). Pure.
 */

import type { FindingText, SynthEffect } from '../types';

/** Who a message is from, as the problem card names it. */
export const GHDL_SOURCE = 'GHDL synthesis check';

/** The sentence that says what a message means for the board, before HDLBoard's explanation. */
export const EFFECT_TEXT: Readonly<Record<SynthEffect, string>> = {
  'cannot-synthesize': 'Cannot be synthesized: the design cannot be built for the FPGA as written.',
  changed: 'Changed by synthesis: the FPGA would not do what the simulation does.',
  'not-verified': 'Could not verify: this says nothing for or against the board.',
};

/** Why a check gave no answer about the design. */
export type UnverifiedReason = 'timeout' | 'crash' | 'unavailable' | 'busy' | 'refused' | 'skipped' | 'unsupported' | 'no-answer' | 'tool-error';

const REASON_TEXT: Readonly<Record<UnverifiedReason, string>> = {
  timeout: 'it took too long and was stopped',
  crash: 'GHDL crashed',
  unavailable: 'GHDL on this server has no synthesis',
  busy: 'the server was busy with other checks; press Start again later',
  refused: 'the server refused the request',
  skipped: 'the run did not start',
  unsupported: 'the simulation backend is older than this page (it needs protocol 8)',
  'no-answer': 'no answer came from the simulation backend',
  'tool-error': 'GHDL stopped on something HDLBoard cannot explain',
};

// ------------------------------------------------------------ what GHDL's messages mean

export const GHDL_TEXT = {
  wait: {
    headline: 'Synthesis cannot build this `wait`.',
    explanation:
      'Synthesis takes one kind of wait only: `wait until rising_edge(clk);`, as the only wait of a process. A `wait for` or a second wait has no hardware. On the board, count cycles of the board\'s clock instead.',
  },
  assignmentAfterWait: {
    headline: 'Synthesis cannot build this assignment: its process waits.',
    explanation:
      'In a process with a `wait`, synthesis only builds what follows a single clock-edge wait. This assignment comes before or between waits, so there is no hardware for it. Write a clocked process instead: `if rising_edge(clk) then … end if;`.',
  },
  fileIo: {
    headline: 'File reading and writing only works in simulation.',
    explanation:
      'A `line` or `file` variable is a pointer into the simulator\'s memory, which the FPGA does not have. To fill a ROM, write its contents as a constant array.',
  },
  latch: {
    headline: 'Synthesis makes a latch here: a value is kept without a clock edge.',
    explanation:
      'A process without a clock edge must give every signal it assigns a value on every path. Here one path keeps the old value, so the FPGA builds a latch, which reacts all the time and does not behave like the simulation. Add an `else`, or a default assignment at the top of the process, or make it a clocked process.',
  },
  unknown: {
    headline: 'GHDL\'s synthesis stopped here.',
    explanation:
      'HDLBoard cannot say what this means for the board: it may be a limit of GHDL\'s synthesis rather than of the FPGA, and Quartus may still build it. GHDL\'s own message is below.',
  },
} as const satisfies Readonly<Record<string, FindingText>>;

/** GHDL's `multiple assignments for "LEDR" offsets 0:0`, worded with the signal's name. */
export function multipleAssignmentsText(signal: string): FindingText {
  return {
    headline: `\`${signal}\` is assigned in more than one place.`,
    explanation:
      `Synthesis finds two drivers of the same bits of \`${signal}\`. On the FPGA a signal is one wire with one source, so Quartus refuses this too. Drive it from one process or one statement.`,
  };
}

// ------------------------------------------------------------ the console

export const passedLine = (top: string): string =>
  `GHDL synthesis check of ${top}: no problems found. GHDL is not Quartus: a design it accepts may still fail to build there.`;

export const foundLine = (top: string, lines: number): string =>
  `GHDL synthesis check of ${top}: ${lines} ${lines === 1 ? 'line' : 'lines'} cannot be built as written.`;

export const unverifiedLine = (top: string, reason: UnverifiedReason): string =>
  `GHDL synthesis check of ${top}: could not verify — ${REASON_TEXT[reason]}.`;

/** One finding in the console: its file and HDLBoard's headline; the link goes to the line. */
export const findingLine = (fileName: string, headline: string): string => `  ${fileName}: ${headline}`;

/** A message with no reliable place: GHDL's own words, said for the design as a whole. */
export const designMessageLine = (message: string): string => `  GHDL: ${message}`;

/** At Start, when the code is what was checked last: the last answer again, without a new check. */
export const UNCHANGED_NOTE = 'GHDL synthesis check: the code is unchanged since the last check; its result follows.';

/** Why a run is not checked, when that is news to the student. */
export const TOLD_SKIP_TEXT = {
  noDut: 'Synthesis check skipped: this testbench tests no design HDLBoard can find.',
  ambiguous: 'Synthesis check skipped: the unit to check is not clear (two files declare it, or a configuration chooses it).',
} as const;

/**
 * Why a run is not checked. Only the told ones are news; a Verilog run (the check is VHDL
 * only), a run with no unit to name, and the student's own *Simulation model* or *Treat as
 * testbench* mark are not.
 */
export type SkipReason = keyof typeof TOLD_SKIP_TEXT | 'not-vhdl' | 'noTop' | 'sim-model' | 'treated-as-testbench';

export const isToldSkip = (reason: SkipReason): reason is keyof typeof TOLD_SKIP_TEXT => reason in TOLD_SKIP_TEXT;
