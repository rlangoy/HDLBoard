// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * The console lines that recording a waveform adds or changes
 * (docs/waveform_viewer_spec.md § 7.5, § 7.6). Pure.
 */

const MIB = 1_048_576;

/**
 * Icarus's notice that the dump file was opened. Shown only when the student's own
 * `$dumpfile` opened it; HDLBoard's own recording is not the student's business (§ 7.6).
 */
export function isOwnDumpNotice(line: string, waveFile: string): boolean {
  return line.trim() === `VCD info: dumpfile ${waveFile} opened for output.`;
}

function sizeText(bytes: number): string {
  return bytes % MIB === 0 ? `${bytes / MIB} MiB` : `${(bytes / MIB).toFixed(1)} MiB`;
}

/** Why a run was stopped by the size guard, and what to do about it (§ 7.5). */
export function sizeLimitMessage(maxBytes: number): string {
  return (
    `The waveform got too large (${sizeText(maxBytes)}), so the simulation was stopped there. ` +
    'Your testbench probably never ends – a clock process that runs forever. ' +
    'End it with std.env.stop; (VHDL-2008) or $finish; (Verilog) when the test is done.'
  );
}

/** A run with the student's own `$dumpfile` that left no file HDLBoard can show (§ 7.3). */
export const OWN_DUMP_MISSING_MESSAGE =
  'Your testbench writes its own waveform settings, so HDLBoard could not record this run. Remove $dumpfile/$dumpvars to use the viewer.';
