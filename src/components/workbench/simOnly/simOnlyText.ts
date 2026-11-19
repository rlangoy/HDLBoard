// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * Every message of the design check (docs/impl_sim_only_warnings.md § 5.2), one
 * entry per construct: what the student reads after the line, and in the tooltip
 * why the board can't run it and what to write instead. English; one file is all a
 * translation needs. Pure.
 */

import type { RegisterProblem, RegisterProblemKind, SimOnlyConstructId, SimulatorClock } from './types';

/** The rate of HDLBoard's slow clock (docs/ghdl_implementation_plan.md § 3.2). */
const SIMULATOR_CLOCK_HZ = 500;
const HZ_PER_MHZ = 1_000_000;

/** A name as code: `count` in backticks. */
const code = (name: string) => `\`${name}\``;

export interface ConstructText {
  /** Shown after the line: one short sentence. */
  readonly headline: string;
  /** The tooltip: why the FPGA can't do it, and what to write instead. */
  readonly explanation: string;
}

const COUNT_CYCLES = "On the board, count cycles of the board's clock instead: at 50 MHz, 1 ms is 50 000 cycles.";
const NO_FILES = 'The FPGA has no file system, so this only works in the simulator.';
const SIM_RUNS = 'The simulator runs it anyway, but synthesis stops here.';
const SAMPLE_IT = "To react to a button press, sample the button on the board's clock and compare it with its value one clock earlier.";
const NO_END = 'Hardware runs for as long as it has power; there is no simulation to end.';

/** What a register may have (§ 3.4), worded once: the headline's rule and the tooltip's first line. */
const ONE_EDGE = 'one clock edge, plus an optional asynchronous reset or set';
const RULE = `a register allows ${ONE_EDGE}`;
const ALLOWED = `Allowed: ${ONE_EDGE} tested as a level before it:`;
const VHDL_ALLOWED = [
  "  if rst = '0' then             -- reset or set: optional, a level",
  '  elsif rising_edge(clk) then   -- the one clock edge, last',
].join('\n');
const VERILOG_ALLOWED = [
  '  always @(posedge clk or negedge rst_n)',
  '    if (!rst_n) …   // reset or set: optional, tested first',
  '    else …          // the one clock edge',
].join('\n');
const LATCH_FIX = `The simulator runs the block once per change; a latch reacts all the time, so the board does not behave like the simulation. Use an edge: \`always @(posedge clk)\`. ${SAMPLE_IT}`;

export const CONSTRUCT_TEXT: Readonly<Record<SimOnlyConstructId, ConstructText>> = {
  'vhdl-wait-for': { headline: '`wait for` only works in simulation.', explanation: `The FPGA has no timer that \`wait for\` could use, so synthesis rejects this process. ${COUNT_CYCLES}` },
  'vhdl-wait-forever': { headline: '`wait;` only works in simulation.', explanation: 'A bare `wait;` stops the process for good. Hardware never stops: write a clocked process that holds its value instead.' },
  'vhdl-wait-until': { headline: 'This `wait` only works in simulation.', explanation: 'On the FPGA a process can only wait for one clock edge, as its only wait: `wait until rising_edge(clk);`. Use a clocked process with a state machine instead.' },
  'vhdl-clock-gen': { headline: 'A clock made with `after` only works in simulation.', explanation: 'On the board the clock comes from a pin, such as CLOCK_50. Use the board\'s clock input instead of generating one.' },
  'vhdl-file-io': { headline: 'File reading and writing only works in simulation.', explanation: `${NO_FILES} To fill a ROM, write its contents as a constant array.` },
  'vhdl-end-sim': { headline: 'Ending the simulation only works in simulation.', explanation: NO_END },
  'vhdl-now': { headline: '`now` only works in simulation.', explanation: `\`now\` is the simulator's clock. The FPGA has no such time. ${COUNT_CYCLES}` },
  'vhdl-access': { headline: 'Pointers only work in simulation.', explanation: 'Access types, `new` and `deallocate` need memory that grows while the design runs. Hardware is fixed: use a signal or an array of a fixed size.' },
  'vhdl-protected': { headline: 'Protected types only work in simulation.', explanation: 'A protected type is a simulation object with procedures. Synthesis can\'t build it: use signals and processes.' },
  'vhdl-random': { headline: '`uniform` only works in simulation.', explanation: 'Random numbers from `math_real` are computed by the simulator. On the board, use a pseudo-random generator such as an LFSR.' },
  'vhdl-real-signal': { headline: 'A `real` signal only works in simulation.', explanation: 'The FPGA has no floating point wires. Use `unsigned`, `signed` or `integer` with a fixed range instead. `real` constants and generics are fine.' },
  'vhdl-edge-template': { headline: `This \`if\` has a second clock edge, or a branch after the edge: ${RULE}.`, explanation: [ALLOWED, VHDL_ALLOWED, `${SIM_RUNS} ${SAMPLE_IT}`].join('\n') },
  'vhdl-after': { headline: '`after` is ignored on the hardware.', explanation: 'Synthesis drops the delay, so on the board the signal changes at once. Only the simulation shows the delay.' },
  'vhdl-report': { headline: '`report` / `assert` only print in simulation.', explanation: 'Synthesis ignores them. They are harmless; the board just never prints them.' },
  'vlog-delay': { headline: 'A `#` delay only works in simulation.', explanation: `The FPGA has no timer that a \`#\` delay could use, so synthesis rejects it. ${COUNT_CYCLES}` },
  'vlog-event-wait': { headline: 'This wait only works in simulation.', explanation: 'On the FPGA an `always` block waits for its sensitivity list only, at its start. Use `always @(posedge clk)` with a state machine instead.' },
  'vlog-clock-gen': { headline: 'A clock made with `#` only works in simulation.', explanation: 'On the board the clock comes from a pin, such as CLOCK_50. Use the board\'s clock input instead of generating one.' },
  'vlog-file-io': { headline: 'File reading and writing only works in simulation.', explanation: `${NO_FILES} To fill a ROM, use \`$readmemh\` in an \`initial\` block, or a case statement.` },
  'vlog-end-sim': { headline: '`$finish` only works in simulation.', explanation: NO_END },
  'vlog-time': { headline: '`$time` only works in simulation.', explanation: `\`$time\` is the simulator's clock. The FPGA has no such time. ${COUNT_CYCLES}` },
  'vlog-random': { headline: '`$random` only works in simulation.', explanation: 'Random numbers are computed by the simulator. On the board, use a pseudo-random generator such as an LFSR.' },
  'vlog-verification': { headline: 'This statement only works in simulation.', explanation: '`force`, `fork`, `event`, `class` and the other verification statements are for testbenches; synthesis does not accept them.' },
  'vlog-real': { headline: 'A `real` variable only works in simulation.', explanation: 'The FPGA has no floating point wires. Use a vector of a fixed width instead. A `real` parameter is fine.' },
  'vlog-edge-template': { headline: `The \`if\` tests none of the edges of the \`always\`: ${RULE}.`, explanation: [ALLOWED, VERILOG_ALLOWED, `${SIM_RUNS} ${SAMPLE_IT}`].join('\n') },
  'vlog-level-storage': { headline: 'This `always` keeps a value without a clock edge: the FPGA makes a latch, not a register.', explanation: [ALLOWED, VERILOG_ALLOWED, LATCH_FIX].join('\n') },
  'vlog-assign-delay': { headline: 'The `#` delay is ignored on the hardware.', explanation: 'Synthesis drops the delay, so on the board the wire changes at once. Only the simulation shows the delay.' },
  'vlog-display': { headline: '`$display` only prints in simulation.', explanation: 'Synthesis ignores it. It is harmless; the board just never prints it.' },
  'sim-clock': { headline: 'This clock only exists in the simulator: the board has no such pin.', explanation: "HDLBoard adds a slow clock so a design can count slowly enough to watch. The FPGA board has no such clock pin. On the board, use the board's own clock and count its cycles." },
};

/** Who the tooltip says the message is from: HDLBoard's own check, not the compiler. */
export const CHECK_SOURCE = 'HDLBoard design check';

/** The console line at Start for one SIM-only file. */
export const simOnlySummary = (fileName: string, lines: number): string =>
  `${fileName} is SIM-only: ${lines} ${lines === 1 ? 'line only works' : 'lines only work'} in simulation; they run here but not on the board.`;

/** A signal with more than one driver (§ 8.1): the warning on each of its drivers. */
export function multipleDriversText(signal: string, otherLines: readonly number[]): ConstructText {
  const others = otherLines.length === 1 ? `line ${otherLines[0]}` : `lines ${otherLines.join(', ')}`;
  return {
    headline: `\`${signal}\` has more than one driver.`,
    explanation: `\`${signal}\` is also driven on ${others}. On the FPGA a signal is one wire with one source, so synthesis refuses two ("multiple constant drivers", "multi-driven net"). In the simulator the value turns into X. Drive it from one process, or one statement: combine the cases with if / else, or \`when … else\`.`,
  };
}

/** 100000 as `100 000`, as the other messages write numbers. */
const grouped = (n: number): string => Math.round(n).toLocaleString('en-US').replace(/,/g, ' ');

/**
 * A read of the board's simulator-only clock (§ 3.5): what it is, and the fix in the
 * board's own clock, with the count that gives the same rate.
 */
export function simulatorClockText({ name, board }: SimulatorClock): ConstructText {
  const cycles = grouped((board.mhz * HZ_PER_MHZ) / SIMULATOR_CLOCK_HZ);
  return {
    headline: `${code(name)} only exists in the simulator: the board has no such clock pin.`,
    explanation: [
      `HDLBoard adds ${code(name)} (${SIMULATOR_CLOCK_HZ} Hz) so a design can count slowly enough to watch. The FPGA board has no such pin, so the design can't be built as it is.`,
      `On the board, use ${code(board.port)} (${board.mhz} MHz) instead, and count ${cycles} of its cycles for each tick of ${code(name)}.`,
    ].join('\n'),
  };
}

/** `` `a` ``, `` `a` and `b` ``, `` `a`, `b` and `c` ``. */
function listed(names: readonly string[]): string {
  const quoted = names.map((n) => `\`${n}\``);
  return quoted.length <= 1 ? (quoted[0] ?? '') : `${quoted.slice(0, -1).join(', ')} and ${quoted[quoted.length - 1]}`;
}

const REGISTER_FIX: Readonly<Record<RegisterProblemKind, string>> = {
  'two-clocks': `Choose one of them as the clock, and test the other as a level (a reset or set), as in the template. ${SAMPLE_IT}`,
  'both-edges': 'Use one edge of the clock, `rising_edge` or `falling_edge`, not both.',
  'outside-edge': 'Put the reset or set before the edge, as in the template, and nothing after it. A condition that should act on the clock goes inside the edge branch.',
  'combined-edges': "Test one edge in the condition. An enable is a level: `rising_edge(clk) and en = '1'`.",
  'no-reset-tested': 'Take the signals that are not resets out of `@( … )`, and test them inside the clock edge.',
  latch: LATCH_FIX,
};

interface Words {
  /** `` `count` ``, `` `x` and `y` ``. */
  readonly registers: string;
  readonly many: boolean;
  readonly clocks: readonly string[];
}

const changes = (w: Words) => `${w.registers} ${w.many ? 'change' : 'changes'}`;

/** The text after the line: what is wrong, then the rule. */
const REGISTER_HEADLINE: Readonly<Record<RegisterProblemKind, (w: Words) => string>> = {
  'two-clocks': (w) => `${w.registers} ${w.many ? 'use' : 'uses'} two clocks, ${listed(w.clocks)}: ${RULE}.`,
  'both-edges': (w) => `${w.registers} ${w.many ? 'use' : 'uses'} both edges of ${listed(w.clocks)}: ${RULE}.`,
  'outside-edge': (w) => `${changes(w)} outside the clock edge of ${listed(w.clocks)}: ${RULE}, nothing after the edge.`,
  'combined-edges': (w) => `One condition tests the edges of ${listed(w.clocks)} together: ${RULE}.`,
  'no-reset-tested': (w) => `The \`if\` tests none of the edges ${listed(w.clocks)}: ${RULE}, which the \`if\` tests first.`,
  latch: (w) => `${w.registers} ${w.many ? 'keep their' : 'keeps its'} value without a clock edge: the FPGA makes a latch, not a register.`,
};

/** The tooltip's pointer at the student's own code. */
const REGISTER_HERE: Readonly<Record<RegisterProblemKind, (w: Words) => string>> = {
  'two-clocks': (w) => `Here: ${code(w.clocks[0])} is one clock, ${code(w.clocks[1])} a second clock → error.`,
  'both-edges': (w) => `Here: the rising and the falling edge of ${code(w.clocks[0])} are two clock edges → error.`,
  'outside-edge': (w) => `Here: ${changes(w)} in a branch after the edge of ${code(w.clocks[0])} → error.`,
  'combined-edges': (w) => `Here: one condition has the edges of ${listed(w.clocks)} → error.`,
  'no-reset-tested': (w) => `Here: ${listed(w.clocks)} are all edges, and the first \`if\` tests none of them → error.`,
  latch: () => 'Here: no `posedge` or `negedge`, but the block keeps a value → a latch.',
};

/**
 * Why no register can be built (§ 3.4), for a beginner: what is wrong and the rule in
 * one line, then in the tooltip the allowed shape, and the student's own clocks marked
 * "→ error". It names the registers and clocks, as synthesis tools do ("can't infer
 * register for count[0] because its behavior depends on the edges of multiple distinct
 * clocks"; "Register count_reg … is clocked by two different clocks in the same
 * process"), and names no tool: the board may be Intel or AMD.
 */
export function registerText(problem: RegisterProblem): ConstructText {
  const { kind, registers, clocks } = problem;
  const words: Words = { registers: registers.length === 0 ? 'This register' : listed(registers), many: registers.length > 1, clocks };
  const explanation = [
    ALLOWED,
    problem.language === 'verilog' ? VERILOG_ALLOWED : VHDL_ALLOWED,
    REGISTER_HERE[kind](words),
    // A latch builds; the others stop synthesis.
    kind === 'latch' ? LATCH_FIX : `${SIM_RUNS} ${REGISTER_FIX[kind]}`,
  ].join('\n');
  return { headline: REGISTER_HEADLINE[kind](words), explanation };
}

/** The console line at Start for a signal with more than one driver. */
export const multipleDriversSummary = (fileName: string, signal: string, lines: readonly number[]): string =>
  `${fileName}: ${signal} has more than one driver (lines ${lines.join(', ')}); the board can't build that.`;

/** Added to the run's first console line when the check is off. */
export const DESIGN_CHECK_OFF = 'Design check: Simulation only';

/** A construct in a few words, as the badge menu's *Detected* line lists it. */
export const CONSTRUCT_TITLE: Readonly<Record<SimOnlyConstructId, string>> = {
  'vhdl-wait-for': 'wait for',
  'vhdl-wait-forever': 'wait;',
  'vhdl-wait-until': 'wait until',
  'vhdl-clock-gen': 'clock generator',
  'vhdl-file-io': 'file I/O',
  'vhdl-end-sim': 'end of simulation',
  'vhdl-now': 'now',
  'vhdl-access': 'pointer',
  'vhdl-protected': 'protected type',
  'vhdl-random': 'uniform',
  'vhdl-real-signal': 'real signal',
  'vhdl-edge-template': 'flip-flop template',
  'vhdl-after': 'after',
  'vhdl-report': 'report',
  'vlog-delay': '# delay',
  'vlog-event-wait': 'event wait',
  'vlog-clock-gen': 'clock generator',
  'vlog-file-io': 'file I/O',
  'vlog-end-sim': '$finish',
  'vlog-time': '$time',
  'vlog-random': '$random',
  'vlog-verification': 'verification statement',
  'vlog-real': 'real variable',
  'vlog-edge-template': 'flip-flop template',
  'vlog-level-storage': 'latch',
  'vlog-assign-delay': 'assign #',
  'vlog-display': '$display',
  'sim-clock': 'simulator clock',
};
