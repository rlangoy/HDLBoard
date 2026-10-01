// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * Turns the text GHDL and Icarus Verilog print into structured diagnostics —
 * docs/editor_diagnostics_implementation_plan.md § 4.1–4.3. Pure: no React, no
 * DOM. A line is recognized by its shape alone, never by which tool ran.
 */

export type DiagnosticSeverity = 'error' | 'warning';

/** One problem as the simulator reported it, before it is matched to a project file. */
export interface Diagnostic {
  /** The file name as printed, with a leading "./" removed. */
  readonly fileName: string;
  /** 1-based. */
  readonly line: number;
  /** 1-based; GHDL only. Unused by the first version of the UI but kept, as LSP does. */
  readonly column?: number;
  readonly severity: DiagnosticSeverity;
  readonly message: string;
  /** Related notes printed right after it: Icarus "declared here", GHDL "(found: 'end')". */
  readonly details: readonly string[];
  /**
   * A warning about something that may well be intended — HDLBoard's own "not a board
   * port" — shown only as the gutter's `!` and its tooltip: no inline text, no tint,
   * not on the file's tab.
   */
  readonly quiet?: boolean;
}

export type LineResult =
  | { readonly kind: 'diagnostic'; readonly diagnostic: Diagnostic }
  /** GHDL compile message that starts with "(" — § 4.3 rule 2. Only recognizer 1 returns this. */
  | { readonly kind: 'continuation'; readonly diagnostic: Diagnostic }
  | { readonly kind: 'note'; readonly message: string }
  | { readonly kind: 'declined' }
  | { readonly kind: 'none' };

type Groups = Readonly<Record<string, string>>;

interface Recognizer {
  readonly pattern: RegExp;
  /** Builds the result from the named groups of a match. */
  readonly interpret: (groups: Groups) => LineResult;
}

/** Icarus prints included headers as "./defs.vh" because the backend compiles with -I. */
const LEADING_CURRENT_DIR = './';

/**
 * Icarus reports a missing include one line after the `include (measured:
 * an include on line 3 is reported as line 4, also as the last line of a file).
 */
const INCLUDE_LINE_OFFSET = -1;

/**
 * Icarus reports a syntax error where it *noticed* it — the next token. On
 * DE1_SoC.v with the ";" of line 19 removed it says line 23 (the next code
 * after a blank line and two comments), and separately reports line 19 as
 * "Syntax error in left side of continuous assignment."
 */
export const ICARUS_SYNTAX_HINT =
  "Icarus reports the line where it noticed the problem. If this line looks right, check the end of the previous line of code (a missing ';' is the usual cause).";

const GHDL_LEVEL: Readonly<Record<string, DiagnosticSeverity | undefined>> = {
  error: 'error',
  fatal: 'error',
  warning: 'warning',
};

const GHDL_REPORT_LEVEL: Readonly<Record<string, DiagnosticSeverity | undefined>> = {
  error: 'error',
  failure: 'error',
  warning: 'warning',
};

const ICARUS_LEVEL: Readonly<Record<string, DiagnosticSeverity | undefined>> = {
  error: 'error',
  sorry: 'error',
  warning: 'warning',
};

const VVP_LEVEL: Readonly<Record<string, DiagnosticSeverity | undefined>> = {
  ERROR: 'error',
  FATAL: 'error',
  WARNING: 'warning',
};

/** GHDL compile messages that continue the previous one: "(found: 'end')". */
function isGhdlContinuation(message: string): boolean {
  return message.startsWith('(');
}

/** Normalization of the printed file name: the only place that changes it (§ 4.4.1). */
export function normalizeFileName(printed: string): string {
  return printed.startsWith(LEADING_CURRENT_DIR) ? printed.slice(LEADING_CURRENT_DIR.length) : printed;
}

function build(
  groups: Groups,
  severity: DiagnosticSeverity,
  options: { readonly lineOffset?: number; readonly details?: readonly string[] } = {},
): Diagnostic | undefined {
  const line = Number(groups.line) + (options.lineOffset ?? 0);
  if (!(line >= 1)) return undefined;
  const column = groups.column === undefined ? undefined : Number(groups.column);
  return {
    fileName: normalizeFileName(groups.file),
    line,
    ...(column === undefined ? {} : { column }),
    severity,
    message: groups.message.trimEnd(),
    details: options.details ?? [],
  };
}

function diagnosticOrNone(diagnostic: Diagnostic | undefined): LineResult {
  return diagnostic ? { kind: 'diagnostic', diagnostic } : { kind: 'none' };
}

/** Maps a captured level through a severity table; a level missing from it is declined (e.g. `note`). */
function byLevel(
  levels: Readonly<Record<string, DiagnosticSeverity | undefined>>,
  groups: Groups,
  options?: Parameters<typeof build>[2],
): LineResult {
  const severity = levels[groups.level];
  return severity ? diagnosticOrNone(build(groups, severity, options)) : { kind: 'declined' };
}

const RECOGNIZERS: readonly Recognizer[] = [
  {
    // GHDL analysis/elaboration: "syntax.vhdl:13:15:error: ';' expected at end of signal assignment"
    pattern: /^(?<file>.+?):(?<line>\d+):(?<column>\d+):(?<level>error|warning|fatal|note):\s*(?<message>.*)$/,
    interpret: (groups) => {
      const result = byLevel(GHDL_LEVEL, groups);
      if (result.kind === 'diagnostic' && isGhdlContinuation(result.diagnostic.message)) {
        return { kind: 'continuation', diagnostic: result.diagnostic };
      }
      return result;
    },
  },
  {
    // GHDL run, report/assertion: "tb.vhdl:8:9:@0ms:(assertion error): values differ"
    pattern: /^(?<file>.+?):(?<line>\d+):(?<column>\d+):@[^:]*:\((?:assertion|report) (?<level>note|warning|error|failure)\):\s*(?<message>.*)$/,
    interpret: (groups) => byLevel(GHDL_REPORT_LEVEL, groups),
  },
  {
    // GHDL run, failed check: "ghdl:error: index (5) out of bounds (0 to 3) at bound.vhdl:9"
    pattern: /^(?:.*[\\/])?ghdl[^\\/:]*:error: (?<message>.+) at (?<file>[^:]+):(?<line>\d+)$/,
    interpret: (groups) => diagnosticOrNone(build(groups, 'error')),
  },
  {
    // vvp run: "ERROR: tb.v:6: values differ"
    pattern: /^(?<level>ERROR|WARNING|FATAL): (?<file>.+?):(?<line>\d+): (?<message>.*)$/,
    interpret: (groups) => byLevel(VVP_LEVEL, groups),
  },
  {
    // Icarus note under an error: "regassign.v:3:      : LEDR is declared here as wire."
    // Must run before the Icarus recognizers below.
    pattern: /^(?<file>.+?):(?<line>\d+):\s+: (?<message>.*)$/,
    interpret: (groups) => ({ kind: 'note', message: groups.message.trimEnd() }),
  },
  {
    // Icarus compile: "undeclared.v:5: error: Unable to bind wire/reg/memory `SWX' in `undeclared'"
    pattern: /^(?<file>.+?):(?<line>\d+): (?<level>error|warning|sorry): (?<message>.*)$/,
    interpret: (groups) => byLevel(ICARUS_LEVEL, groups),
  },
  {
    // Icarus bare syntax error, no "error:" word: "syntax.v:6: syntax error"
    pattern: /^(?<file>.+?):(?<line>\d+): (?<message>syntax error)$/,
    interpret: (groups) => diagnosticOrNone(build(groups, 'error', { details: [ICARUS_SYNTAX_HINT] })),
  },
  {
    // Icarus missing include: "miss.v:2: Include file nope.vh not found"
    pattern: /^(?<file>.+?):(?<line>\d+): (?<message>Include file .+ not found)$/,
    interpret: (groups) => diagnosticOrNone(build(groups, 'error', { lineOffset: INCLUDE_LINE_OFFSET })),
  },
  {
    // HDLBoard's backend, a port the board does not connect (server/src/engines/extraPorts.ts):
    // "Warning: `Dummy` (DE1_SoC.vhdl, line 21) is not a board input, so the board holds it at 0."
    pattern: /^Warning: (?<message>`[^`]+` \((?<file>[^,()]+), line (?<line>\d+)\) .*)$/,
    interpret: (groups) => {
      const diagnostic = build(groups, 'warning');
      return diagnostic ? { kind: 'diagnostic', diagnostic: { ...diagnostic, quiet: true } } : { kind: 'none' };
    },
  },
];

/**
 * Tries the recognizers in order; the first that matches decides. A `declined`
 * result stops the search too, so a looser pattern further down cannot pick up
 * a line that was deliberately refused (a GHDL `note`, a `report note`).
 */
export function recognizeLine(text: string): LineResult {
  const line = text.endsWith('\r') ? text.slice(0, -1) : text;
  for (const recognizer of RECOGNIZERS) {
    const match = recognizer.pattern.exec(line);
    if (match?.groups) return recognizer.interpret(match.groups);
  }
  return { kind: 'none' };
}

interface Builder {
  diagnostic: Diagnostic;
  details: string[];
}

/**
 * Walks the lines once, keeping the last diagnostic (`previous`) so notes and
 * continuations can attach to it (§ 4.3).
 *
 * `declined` and `none` lines keep `previous` on purpose: GHDL prints the source
 * echo and the caret line *between* an error and its continuation:
 *
 *   syntax.vhdl:13:15:error: ';' expected at end of signal assignment
 *       LEDR <= SW
 *                 ^
 *   syntax.vhdl:13:15:error: (found: 'end')
 *
 * Resetting `previous` on unmatched lines would lose the "(found: 'end')" detail.
 */
export function parseDiagnostics(text: string): Diagnostic[] {
  const finished: Builder[] = [];
  let previous: Builder | undefined;

  const start = (diagnostic: Diagnostic): void => {
    previous = { diagnostic, details: [...diagnostic.details] };
    finished.push(previous);
  };

  for (const line of text.split('\n')) {
    const result = recognizeLine(line);
    if (result.kind === 'note') {
      previous?.details.push(result.message);
    } else if (result.kind === 'continuation') {
      const sameFile = previous?.diagnostic.fileName === result.diagnostic.fileName;
      if (previous && sameFile) previous.details.push(result.diagnostic.message);
      else start(result.diagnostic);
    } else if (result.kind === 'diagnostic') {
      start(result.diagnostic);
    }
  }
  return finished.map(({ diagnostic, details }) => ({ ...diagnostic, details }));
}
