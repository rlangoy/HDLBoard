// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * Every string of the testbench split view (docs/impl_split_screen.md D16, § 4.14):
 * labels, tooltips, empty states, the suggestion chip, the run dialog, and a
 * sentence on every detection rule (for an explanation view, not shown yet). English; one file is all a later
 * translation needs. Pure.
 */

import type { RuleId } from './tbDetect/types';

export const TEXT = {
  tbLabel: 'TB',
  rtlLabel: 'RTL',
  bothLabel: 'Both',
  tbTooltip: 'Testbench — simulation-only code',
  rtlTooltip: 'Design (RTL) — synthesizable code',
  bothTooltip: 'Testbench and design side by side',
  editorView: 'Editor view',
  tooNarrow: 'Too narrow for side by side — hide the Explorer (Ctrl+B) or the board (Ctrl+Alt+B)',
  resizeTestbenchEditor: 'Resize testbench editor',
  fileRoleTb: 'Testbench',
  fileRoleRtl: 'Design',
  fileRoleMixed: 'Design + testbench',
  treatAsTestbench: 'Treat as testbench',
  treatAsDesign: 'Treat as design',
  useDetection: 'Use detection',
  pairWith: 'Pair with another file…',
  noPairCandidates: 'No other file of the same language to pair with.',
  noEvidence: 'Nothing in this unit is simulation-only code.',
  roleFromOverride: 'You marked this file yourself; detection is not used for it.',
  previousRegion: 'Previous testbench region (Alt+PageUp)',
  nextRegion: 'Next testbench region (Alt+PageDown)',
  createTestbench: 'Create testbench',
  openExisting: 'Open existing…',
  showDesignOnly: 'Show design only',
  showTestbenchOnly: 'Show testbench only',
  noInstance: 'This testbench does not instantiate a design',
  noTestbenchCodeLeft: 'No testbench code left in this file.',
  closeSplit: 'Close split',
  openSplitView: 'Open split view',
  dismiss: 'Dismiss',
  runTestbench: 'Run testbench',
  cancel: 'Cancel',
  runTestbenchQuestion: 'Run it from a testbench instead?',
  settingTitle: 'Testbench split view',
  settingAuto: 'Automatic',
  settingAutoHint: 'Open the split when a file is, or has, a testbench.',
  settingAlways: 'Always',
  settingAlwaysHint: 'Always show testbench and design side by side.',
  settingNever: 'Never',
  settingNeverHint: 'Never open the split on its own; the view switch still works.',
} as const;

export const detectedAs = (role: 'tb' | 'rtl', confidence: string): string =>
  `Detected: ${role === 'tb' ? 'Testbench' : 'Design'} (${confidence})`;
export const noTestbenchFor = (name: string): string => `No testbench for ${name}`;
export const notInProject = (unit: string): string => `${unit} is not in this project`;
export const testbenchFoundIn = (name: string): string => `Testbench code found in ${name}`;
export const tbPaneLabel = (name: string): string => `Testbench editor, ${name}`;
export const rtlPaneLabel = (name: string): string => `Design (RTL) editor, ${name}`;
export const noBoardPorts = (name: string): string => `${name} has no board ports, so the board can't drive it.`;
export const runAnyway = (name: string): string => `Run ${name} anyway`;
export const regionCount = (n: number, m: number): string => `${n}/${m}`;

export interface RuleText {
  /** The construct, as the student would write it. */
  readonly title: string;
  readonly explanation: string;
}

const NO_TIME = 'Hardware has no way to wait for a span of time on its own, so synthesis rejects it.';

export const RULE_TEXT: Readonly<Record<RuleId, RuleText>> = {
  'vhdl-portless': { title: 'no ports', explanation: 'The entity has no port clause. A design talks to the world through ports; a testbench is the world, so it needs none.' },
  'vhdl-wait-for': { title: 'wait for', explanation: `\`wait for\` pauses for a span of simulated time. ${NO_TIME}` },
  'vhdl-wait-forever': { title: 'wait;', explanation: 'A bare `wait;` stops a process for good — the usual last line of a stimulus process. Hardware never stops.' },
  'vhdl-clock-gen': { title: 'clock generator', explanation: '`clk <= not clk after …` makes a clock out of simulated time. A real clock comes from a pin, not from a delay.' },
  'vhdl-after': { title: 'after', explanation: '`after` delays an assignment in simulation only; synthesis ignores it. Designs sometimes use it to make waveforms readable.' },
  'vhdl-wait-until': { title: 'wait until', explanation: '`wait until` / `wait on` waits for a signal. `wait until rising_edge(clk)` can be synthesized, so this alone is a weak hint.' },
  'vhdl-file-io': { title: 'file I/O', explanation: 'TEXTIO reads and writes files. Testbenches use it for test vectors; designs sometimes use it to fill a ROM, so it is only a hint.' },
  'vhdl-end-sim': { title: 'end of simulation', explanation: '`std.env.stop` / `finish` ends the simulation. Hardware has no simulation to end.' },
  'vhdl-drives-dut': { title: 'drives a design', explanation: 'A unit without ports that instantiates another unit is the classic testbench shape: it holds the design under test and drives its inputs.' },
  'vhdl-assert': { title: 'assert / report', explanation: '`assert` and `report` print messages while simulating. Designs use them too, to check generics, so this is a weak hint.' },
  'vhdl-tb-name': { title: 'testbench name', explanation: 'The name looks like a testbench (`*_tb`, `tb_*`, `*_test`…). Only a hint — a name is a promise, not a proof.' },
  'vhdl-framework': { title: 'test framework', explanation: 'VUnit or OSVVM is a verification framework; only testbenches use it.' },
  'vhdl-sim-only': { title: 'translate_off region', explanation: 'Code between `synthesis translate_off` and `translate_on` is hidden from synthesis — simulation-only code inside a design.' },
  'vhdl-board-ports': { title: 'board ports', explanation: 'The entity has DE1-SoC board ports (SW, LEDR, KEY_N…), so it is a board design, never a testbench.' },
  'vlog-portless': { title: 'no ports', explanation: 'The module has no port list. A design talks to the world through ports; a testbench is the world, so it needs none.' },
  'vlog-delay': { title: '# delay', explanation: `A \`#\` delay inside \`initial\` or \`always\` pauses for simulated time. ${NO_TIME}` },
  'vlog-assign-delay': { title: 'assign #', explanation: 'A delay on a continuous assignment is ignored by synthesis. Designs sometimes use it to make waveforms readable.' },
  'vlog-clock-gen': { title: 'clock generator', explanation: '`always #5 clk = ~clk;` makes a clock out of simulated time. A real clock comes from a pin, not from a delay.' },
  'vlog-event-wait': { title: 'event wait', explanation: '`@(posedge clk);` or `wait (…)` as a statement inside `initial` waits during a sequence of stimulus — a testbench habit.' },
  'vlog-initial': { title: 'initial', explanation: '`initial` runs once at time zero. FPGA designs use it to set start values, so it is a weak hint.' },
  'vlog-display': { title: '$display', explanation: '`$display` and friends print while simulating. Designs use them for debugging too, so this is a hint.' },
  'vlog-end-sim': { title: '$finish', explanation: '`$finish` / `$stop` ends the simulation. Hardware has no simulation to end.' },
  'vlog-file-io': { title: 'file I/O', explanation: '`$fopen`, `$fwrite`, `$dumpfile`… read and write files on the simulating computer. Hardware has no file system.' },
  'vlog-drives-dut': { title: 'drives a design', explanation: 'A module without ports that instantiates another module is the classic testbench shape: it holds the design under test and drives its inputs.' },
  'vlog-tb-name': { title: 'testbench name', explanation: 'The name looks like a testbench (`*_tb`, `tb_*`, `*_test`…). Only a hint — a name is a promise, not a proof.' },
  'vlog-sv-verif': { title: 'SystemVerilog verification', explanation: '`program`, `class`, `mailbox`, `randomize()`… are SystemVerilog verification constructs; synthesis does not accept them.' },
  'vlog-uvm': { title: 'UVM', explanation: 'UVM is a verification library; only testbenches use it.' },
  'vlog-sim-only': { title: 'simulation-only region', explanation: 'Code inside `ifndef SYNTHESIS` or `translate_off` is hidden from synthesis — simulation-only code inside a design.' },
  'vlog-assert': { title: 'assert', explanation: 'An immediate `assert` checks a condition while simulating. Designs use it too, so this is a weak hint.' },
  'vlog-board-ports': { title: 'board ports', explanation: 'The module has DE1-SoC board ports (SW, LEDR, KEY_N…), so it is a board design, never a testbench.' },
};
