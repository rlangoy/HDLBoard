// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * Every message of the design check (docs/impl_sim_only_warnings.md § 5.2), one
 * entry per construct: what the student reads after the line, and in the tooltip
 * why the board can't run it and what to write instead. English; one file is all a
 * translation needs. Pure.
 */

import type { SimOnlyConstructId } from './types';

export interface ConstructText {
  /** Shown after the line: one short sentence. */
  readonly headline: string;
  /** The tooltip: why the FPGA can't do it, and what to write instead. */
  readonly explanation: string;
}

const COUNT_CYCLES = "On the board, count cycles of the board's clock instead: at 50 MHz, 1 ms is 50 000 cycles.";
const NO_FILES = 'The FPGA has no file system, so this only works in the simulator.';
const ONE_EDGE = 'Quartus builds a flip-flop from one clock edge, plus an optional asynchronous reset or set tested as a level before it';
const SAMPLE_IT = "To react to a button press, sample the button on the board's clock and compare it with its value one clock earlier.";
const NO_END = 'Hardware runs for as long as it has power; there is no simulation to end.';

export const CONSTRUCT_TEXT: Readonly<Record<SimOnlyConstructId, ConstructText>> = {
  'vhdl-wait-for': { headline: '`wait for` only works in simulation.', explanation: `The FPGA has no timer that \`wait for\` could use, so Quartus rejects this process. ${COUNT_CYCLES}` },
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
  'vhdl-edge-template': { headline: "Quartus can't build a flip-flop from this `if`.", explanation: `${ONE_EDGE}: \`if rst = '0' then … elsif rising_edge(clk) then … end if;\`. Here a second edge, or a branch after the edge, is part of the same \`if\`, so Quartus stops with "can't infer register" (Error 10818, 10819 or 10820). The simulator runs it anyway. Test the reset as a level, as above. ${SAMPLE_IT}` },
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
  'vlog-edge-template': { headline: "Quartus can't match this `if` to the edges of the `always`.", explanation: `${ONE_EDGE}. With more than one edge in \`@( … )\`, every edge but the clock is a reset or set, and the \`if\` right after it must test one: \`always @(posedge clk or negedge rst_n) if (!rst_n) … else …\`. Here the first \`if\` tests none of them, so Quartus stops with Error 10200. ${SAMPLE_IT}` },
  'vlog-level-storage': { headline: 'Without a clock edge, this `always` makes latches, not flip-flops.', explanation: `The block has no \`posedge\` or \`negedge\`, but it reads a variable it assigns with \`<=\`, so it keeps a value. The simulator runs the block once per change; Quartus builds latches (Warning 10240) that react all the time, so the board does not behave like the simulation. ${ONE_EDGE}: use \`always @(posedge clk)\`. ${SAMPLE_IT}` },
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
    explanation: `\`${signal}\` is also driven on ${others}. On the FPGA a signal is one wire with one source, so Quartus refuses two: "can't resolve multiple constant drivers". In the simulator the value turns into X. Drive it from one process, or one statement: combine the cases with if / else, or \`when … else\`.`,
  };
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
