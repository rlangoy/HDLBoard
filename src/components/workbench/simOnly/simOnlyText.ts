// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * Every message of the design check (docs/impl_sim_only_warnings.md § 5.2), one
 * entry per construct: what the student reads after the line, and in the tooltip
 * why the board can't run it and what to write instead. English; one file is all a
 * translation needs. Pure.
 */

import type { RegisterProblem, RegisterProblemKind, SimOnlyConstructId } from './types';

export interface ConstructText {
  /** Shown after the line: one short sentence. */
  readonly headline: string;
  /** The tooltip: why the FPGA can't do it, and what to write instead. */
  readonly explanation: string;
}

const COUNT_CYCLES = "On the board, count cycles of the board's clock instead: at 50 MHz, 1 ms is 50 000 cycles.";
const NO_FILES = 'The FPGA has no file system, so this only works in the simulator.';
const ONE_EDGE = 'On an FPGA a register (a flip-flop) has one clock. Synthesis builds one from a single clock edge, plus an optional asynchronous reset or set tested as a level before it';
const VHDL_TEMPLATE = "`if rst = '0' then … elsif rising_edge(clk) then … end if;`";
const VERILOG_TEMPLATE = '`always @(posedge clk or negedge rst_n) if (!rst_n) … else …`';
const SIM_RUNS = 'The simulator runs it anyway, but synthesis stops here.';
const SAMPLE_IT = "To react to a button press, sample the button on the board's clock and compare it with its value one clock earlier.";
const NO_END = 'Hardware runs for as long as it has power; there is no simulation to end.';

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
  'vhdl-edge-template': { headline: "Can't infer a register from this `if`.", explanation: `${ONE_EDGE}: ${VHDL_TEMPLATE}. Here a second edge, or a branch after the edge, is part of the same \`if\`. ${SIM_RUNS} ${SAMPLE_IT}` },
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
  'vlog-edge-template': { headline: "Can't infer a register: the `if` tests none of the edges of the `always`.", explanation: `${ONE_EDGE}: ${VERILOG_TEMPLATE}. Every edge in \`@( … )\` but the clock must be a reset or set that the first \`if\` tests. ${SIM_RUNS} ${SAMPLE_IT}` },
  'vlog-level-storage': { headline: 'This `always` keeps a value without a clock edge: synthesis makes a latch, not a register.', explanation: `The block has no \`posedge\` or \`negedge\`, but it reads a variable it assigns with \`<=\`. The simulator runs the block once per change; a latch reacts all the time, so the board does not behave like the simulation. ${ONE_EDGE}: ${VERILOG_TEMPLATE}. ${SAMPLE_IT}` },
  'vlog-assign-delay': { headline: 'The `#` delay is ignored on the hardware.', explanation: 'Synthesis drops the delay, so on the board the wire changes at once. Only the simulation shows the delay.' },
  'vlog-display': { headline: '`$display` only prints in simulation.', explanation: 'Synthesis ignores it. It is harmless; the board just never prints it.' },
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
  latch: `The simulator runs the block once per change; a latch reacts all the time, so the board does not behave like the simulation. Use an edge: \`always @(posedge clk)\`. ${SAMPLE_IT}`,
};

interface HeadlineWords {
  /** `a register for \`count\``. */
  readonly target: string;
  readonly its: string;
  readonly itChanges: string;
  readonly clocks: string;
  readonly registers: string;
}

const REGISTER_HEADLINE: Readonly<Record<RegisterProblemKind, (w: HeadlineWords) => string>> = {
  'two-clocks': (w) => `Can't infer ${w.target}: ${w.its} behavior depends on the edges of two clocks, ${w.clocks}.`,
  'both-edges': (w) => `Can't infer ${w.target}: ${w.itChanges} on both the rising and the falling edge of ${w.clocks}.`,
  'outside-edge': (w) => `Can't infer ${w.target}: ${w.itChanges} outside the clock edge of ${w.clocks} too.`,
  'combined-edges': (w) => `Can't infer ${w.target}: one condition combines the edges of ${w.clocks}.`,
  'no-reset-tested': (w) => `Can't infer ${w.target}: the \`if\` tests none of the edges ${w.clocks}, so none of them is a reset.`,
  latch: (w) => `${w.registers} ${w.its === 'its' ? 'keeps its' : 'keep their'} value without a clock edge: synthesis makes a latch, not a register.`,
};

function registerHeadline({ kind, registers, clocks }: RegisterProblem): string {
  const many = registers.length > 1;
  const target = registers.length === 0 ? 'a register' : `${many ? 'registers for' : 'a register for'} ${listed(registers)}`;
  const [its, itChanges] = many ? ['their', 'they change'] : ['its', 'it changes'];
  return REGISTER_HEADLINE[kind]({ target, its, itChanges, clocks: listed(clocks), registers: listed(registers) });
}

/**
 * Why no register can be built (§ 3.4), naming the registers and clocks as synthesis
 * tools do ("can't infer register for count[0] because its behavior depends on the
 * edges of multiple distinct clocks"; "Register count_reg … is clocked by two different
 * clocks in the same process"), without naming a tool: the board may be Intel or AMD.
 */
export function registerText(problem: RegisterProblem): ConstructText {
  const verilog = problem.kind === 'no-reset-tested' || problem.kind === 'latch';
  const template = `${ONE_EDGE}: ${verilog ? VERILOG_TEMPLATE : VHDL_TEMPLATE}.`;
  const fix = REGISTER_FIX[problem.kind];
  const explanation = problem.kind === 'latch' ? `${fix} ${template}` : `${template} ${SIM_RUNS} ${fix}`;
  return { headline: registerHeadline(problem), explanation };
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
};
