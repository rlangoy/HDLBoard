// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * The words of the synthesis check at Start (docs/impl_sim_only_warnings.md § 7): who
 * says it, what a message means for the board, and the console lines. English, like the
 * rest of the design check (designCheckText.ts). Pure.
 */

import type { FindingText, SynthEffect, SynthTool } from '../types';

/** Who a message is from, as the problem card names it. */
export const TOOL_SOURCE: Readonly<Record<SynthTool, string>> = {
  ghdl: 'GHDL synthesis check',
  icarus: 'Icarus synthesis check (advice only)',
};

export const TOOL_NAME: Readonly<Record<SynthTool, string>> = { ghdl: 'GHDL', icarus: 'Icarus' };

/** The sentence that says what a message means for the board, before HDLBoard's explanation. */
export const EFFECT_TEXT: Readonly<Record<SynthEffect, string>> = {
  'cannot-synthesize': 'Cannot be synthesized: the design cannot be built for the FPGA as written.',
  changed: 'Changed by synthesis: the FPGA would not do what the simulation does.',
  'not-verified': 'Could not verify: this says nothing for or against the board.',
};

/** Why a check gave no answer about the design. */
export type UnverifiedReason =
  | 'timeout' | 'crash' | 'unavailable' | 'busy' | 'refused' | 'skipped' | 'unsupported' | 'no-answer' | 'tool-error' | 'advisory';

const REASON_TEXT: Readonly<Record<UnverifiedReason, (tool: string) => string>> = {
  timeout: () => 'it took too long and was stopped',
  crash: (tool) => `${tool} crashed`,
  unavailable: (tool) => `${tool} on this server has no synthesis`,
  busy: () => 'the server was busy with other checks; press Start again later',
  refused: () => 'the server refused the request',
  skipped: () => 'the run did not start',
  unsupported: () => 'the simulation backend is older than this page (it needs protocol 8)',
  'no-answer': () => 'no answer came from the simulation backend',
  'tool-error': (tool) => `${tool} stopped on something HDLBoard cannot explain`,
  advisory: () => "Icarus's synthesis refuses some code that Quartus builds",
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

// ------------------------------------------------------------ what Icarus's messages mean

export const ICARUS_TEXT = {
  startValues: {
    headline: 'Icarus cannot synthesize this; the FPGA may still build it.',
    explanation:
      'Icarus\'s synthesis refuses a register with a start value (`reg x = 0;`) as well as one driven from two blocks. Quartus builds a start value as the power-up value. Two drivers are an error there too, and HDLBoard\'s own check warns about those.',
  },
  processNotSynthesized: {
    headline: 'Icarus left this block as simulation code.',
    explanation:
      'Icarus could not turn the block into logic. That is expected for an `initial` block that sets start values or loads a ROM (Quartus builds those), and for code with delays or waits, which never runs on the board.',
  },
  tooManyClocks: {
    headline: 'Icarus cannot synthesize this edge list; Quartus may still build it.',
    explanation:
      'Icarus\'s synthesis handles only some asynchronous-reset templates. A block of one clock edge plus a reset tested first is a register Quartus builds.',
  },
  unknown: {
    headline: 'Icarus\'s synthesis stopped here.',
    explanation:
      'Icarus\'s synthesis is limited and refuses some code that Quartus builds, so HDLBoard cannot say what this means for the board. Icarus\'s own message is below.',
  },
} as const satisfies Readonly<Record<string, FindingText>>;

// ------------------------------------------------------------ the console

const subject = (tool: SynthTool, top: string): string =>
  tool === 'ghdl' ? `GHDL synthesis check of ${top}` : `Icarus synthesis check of ${top} (advice only)`;

export function passedLine(tool: SynthTool, top: string): string {
  return tool === 'ghdl'
    ? `${subject(tool, top)}: no problems found. GHDL is not Quartus: a design it accepts may still fail to build there.`
    : `${subject(tool, top)}: no problems found.`;
}

export function foundLine(tool: SynthTool, top: string, lines: number): string {
  const counted = `${lines} ${lines === 1 ? 'line' : 'lines'}`;
  return tool === 'ghdl' ? `${subject(tool, top)}: ${counted} cannot be built as written.` : `${subject(tool, top)}: ${counted} with notes.`;
}

export function unverifiedLine(tool: SynthTool, top: string, reason: UnverifiedReason): string {
  return `${subject(tool, top)}: could not verify — ${REASON_TEXT[reason](TOOL_NAME[tool])}.`;
}

/** One finding in the console: its file and HDLBoard's headline; the link goes to the line. */
export const findingLine = (fileName: string, headline: string): string => `  ${fileName}: ${headline}`;

/** A message with no reliable place: the tool's own words, said for the design as a whole. */
export const designMessageLine = (tool: SynthTool, message: string): string => `  ${TOOL_NAME[tool]}: ${message}`;

/** At Start, when the code is what was checked last: the last answer again, without a new check. */
export const unchangedNote = (tool: SynthTool): string => `${TOOL_NAME[tool]} synthesis check: the code is unchanged since the last check; its result follows.`;

/** Why a run is not checked, when that is news to the student. */
export const SKIP_TEXT = {
  noDut: 'Synthesis check skipped: this testbench tests no design HDLBoard can find.',
  ambiguous: 'Synthesis check skipped: the unit to check is not clear (two files declare it, or a configuration chooses it).',
  noTop: 'Synthesis check skipped: the unit that runs is not clear.',
} as const;

export type SkipReason = keyof typeof SKIP_TEXT | 'sim-model' | 'treated-as-testbench';
