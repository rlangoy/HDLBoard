// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * Why a simulation run failed: what the student is told, and whether the server log
 * should hear of it as a crash. Pure: the session (session.ts) feeds it the run's
 * stdout lines and its exit.
 */

import type { SimEngine } from './engines/types.js';

/** How a failed simulator process ended. */
export interface SimulatorExit {
  readonly code: number | null;
  readonly stderr: string;
  readonly signal: NodeJS.Signals | null;
}

/** A line where the simulator reported an error on stdout, and whether the student got it. */
export interface SimulatorReport {
  readonly line: string;
  /** False when the per-second output limit (outputLimiter.ts) dropped the line. */
  readonly shown: boolean;
  /** It ends the run (`$fatal`, a GHDL error), rather than letting it go on (`$error`). */
  readonly stops: boolean;
}

/**
 * A simulator's own report, written to stdout with the design's output. GHDL names
 * itself by its program, as the front end reads it too (diagnostics.ts): `ghdl:error: …`,
 * `C:\…\ghdl.exe:error: …`, `/usr/bin/ghdl-mcode:error: …`, and `simulation stopped @5ns
 * with status 1` for a design's own `std.env.stop(1)`. Icarus gives its `FATAL:`
 * (`$fatal`) and `ERROR:` (`$error`) a place, `FATAL: my test.v:7: …` — a file name may
 * hold spaces — which a student's own `$display("ERROR: mismatch")` does not have.
 */
const GHDL_ERROR = String.raw`(?:.*[\\/])?ghdl[^\\/:\s]*:error:`;
const GHDL_STOP = String.raw`simulation (?:stopped|finished) @\S+ with status \d+`;
const ICARUS_PLACE = String.raw`[^:]+:\d+:`;
const STOPPING_REPORT = new RegExp(String.raw`^\s*(?:${GHDL_ERROR}|${GHDL_STOP}|FATAL: ${ICARUS_PLACE})`);
/** Icarus's `$error`: reported, but the run goes on. */
const CONTINUING_REPORT = new RegExp(String.raw`^\s*ERROR: ${ICARUS_PLACE}`);

/** `line` as a simulator report, or undefined when it is the design's own output. */
export function reportOf(line: string, shown: boolean): SimulatorReport | undefined {
  if (STOPPING_REPORT.test(line)) return { line: line.trim(), shown, stops: true };
  if (CONTINUING_REPORT.test(line)) return { line: line.trim(), shown, stops: false };
  return undefined;
}

/**
 * The report that explains the run: the first that stopped it, else the first it
 * reported. A `$fatal` after an `$error` is the reason, even when the error was shown and
 * the fatal dropped; GHDL's `simulation failed` after its own error adds nothing.
 */
export function explainingReport(current: SimulatorReport | null, next: SimulatorReport): SimulatorReport {
  if (current === null) return next;
  if (current.stops) return current;
  return next.stops ? next : current;
}

const SIMULATOR_NAMES: Readonly<Record<SimEngine['language'], string>> = { vhdl: 'GHDL', verilog: 'Icarus Verilog' };

export function simulatorName(language: SimEngine['language']): string {
  return SIMULATOR_NAMES[language];
}

// ------------------------------------------------------------ crashes, for the server log

/** What a process that crashed, rather than failed, says on stderr. */
const CRASH_TEXT = /segmentation fault|sigsegv|sigbus|sigabrt|core dumped|out of memory|bad_alloc|cannot allocate|stack overflow/i;
/**
 * Exit codes from 128 up are a death by signal as a POSIX shell reports it (128 + its
 * number), or a Windows status such as 0xC0000005, an access violation.
 */
const FIRST_SIGNAL_EXIT_CODE = 128;
/** Windows statuses (top bit set) read as hex: 0xC0000005, not 3221225477. */
const FIRST_WINDOWS_STATUS = 0x80000000;
const HEX = 16;
/** The longest piece of stderr a crash line quotes: the server log is no place for a dump. */
const CRASH_QUOTE_CHARS = 200;

/**
 * How a simulator crashed — killed by a signal, an exit code a shell gives a signal's
 * death, or stderr naming a crash — whatever the run printed before. Undefined when it
 * did not crash.
 */
export function crashOf({ code, stderr, signal }: SimulatorExit): string | undefined {
  if (signal !== null) return `crashed on ${signal}${quotedLine(stderr)}`;
  const diedOnSignal = code !== null && code >= FIRST_SIGNAL_EXIT_CODE;
  if (diedOnSignal || CRASH_TEXT.test(stderr)) return `crashed ${withExitCode(code)}${quotedLine(stderr)}`;
  return undefined;
}

/**
 * How the simulator crashed, unless its own report of a stop explains the exit: a design's
 * `std.env.stop(200)` makes GHDL exit with 200, which would otherwise read as a death by
 * signal. A signal, or stderr naming a crash, is a crash whatever was reported.
 */
export function crashBeyondReport(exit: SimulatorExit, report: SimulatorReport | null): string | undefined {
  const reportedStop = report?.stops === true;
  const crashSaidOutright = exit.signal !== null || CRASH_TEXT.test(exit.stderr);
  return reportedStop && !crashSaidOutright ? undefined : crashOf(exit);
}

/**
 * A failure with no word at all, on stderr or (the caller knows) stdout: the server log
 * hears of it too, since the student is told only a guess. Undefined when stderr says why.
 */
export function silentExitOf({ code, stderr }: SimulatorExit): string | undefined {
  return stderr.trim() === '' ? `exited ${withExitCode(code)} and no message` : undefined;
}

/** `with exit code 1`, `with exit code 0xC0000005`, or `with no exit code`. */
function withExitCode(code: number | null): string {
  return code === null ? 'with no exit code' : `with exit code ${exitCodeText(code)}`;
}

function exitCodeText(code: number): string {
  return code >= FIRST_WINDOWS_STATUS ? `0x${code.toString(HEX).toUpperCase()}` : String(code);
}

/** `: ` and the first line of `stderr`, printable and cut short, or nothing: it must not write lines of its own into the log. */
function quotedLine(stderr: string): string {
  const firstLine = (stderr.trim().split(/\r?\n/)[0] ?? '').replace(/[^\x20-\x7e]/g, '?').slice(0, CRASH_QUOTE_CHARS);
  return firstLine === '' ? '' : `: ${firstLine}`;
}

// ------------------------------------------------------------ what the student is told

/** A failed run whose simulator already said why, in the console above: an error, or a design's `std.env.stop(1)`. */
const STOPPED_AS_REPORTED_TEXT = 'The simulation stopped as reported above.';

/**
 * What a failed run's ERROR says: stderr, else the simulator's report (pointed at when
 * the student saw it, quoted whole when the output limit dropped it, so the editor can
 * still mark its line), else a guess. `report` is null for a crash, which a report
 * before it does not explain. `memoryCapMb`: the host's cap on one run (`readMemoryCapMb`).
 */
export function failedRunText(stderr: string, report: SimulatorReport | null, memoryCapMb: number | undefined): string {
  if (stderr.trim() !== '') return stderr;
  if (report === null) return unexplainedExitText(memoryCapMb);
  return report.shown ? STOPPED_AS_REPORTED_TEXT : `The simulation stopped:\n${report.line}`;
}

/**
 * A simulator that died without a word still owes the student a reason. Where every run
 * is memory-capped (the Docker image's `simlimit.sh`), running out is the likely one:
 * GHDL then dies on a segfault without printing anything.
 */
function unexplainedExitText(memoryCapMb: number | undefined): string {
  if (memoryCapMb === undefined) return 'Simulation exited unexpectedly.';
  return (
    `Simulation exited unexpectedly, possibly out of memory: each simulation on this server gets ${memoryCapMb} MB. ` +
    'GHDL needs about 350 bytes per std_logic bit of a signal, so a large RAM signal can use it up.'
  );
}

/**
 * The host's memory cap on one simulator run, `HDLBOARD_SIM_MEMORY_MB`, in MB: read as
 * the whole number `simlimit.sh` itself needs. Unset or anything else is no cap.
 */
export function readMemoryCapMb(env: NodeJS.ProcessEnv = process.env): number | undefined {
  const text = env.HDLBOARD_SIM_MEMORY_MB?.trim() ?? '';
  return /^\d+$/.test(text) ? Number(text) : undefined;
}
