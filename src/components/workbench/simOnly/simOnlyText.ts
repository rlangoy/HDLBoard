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
  'vlog-assign-delay': { headline: 'The `#` delay is ignored on the hardware.', explanation: 'Synthesis drops the delay, so on the board the wire changes at once. Only the simulation shows the delay.' },
  'vlog-display': { headline: '`$display` only prints in simulation.', explanation: 'Synthesis ignores it. It is harmless; the board just never prints it.' },
};

/** Who the tooltip says the message is from: HDLBoard's own check, not the compiler. */
export const CHECK_SOURCE = 'HDLBoard design check';

/** The console line at Start for one SIM-only file. */
export const simOnlySummary = (fileName: string, lines: number): string =>
  `${fileName} is SIM-only: ${lines} ${lines === 1 ? 'line only works' : 'lines only work'} in simulation; they run here but not on the board.`;

/** Added to the run's first console line when the check is off. */
export const DESIGN_CHECK_OFF = 'Design check: Simulation only';
