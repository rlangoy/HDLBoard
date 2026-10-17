// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * Whether a student's Verilog asks for a waveform dump of its own
 * (docs/waveform_viewer_spec.md § 7.3). Icarus allows one dump per run, so HDLBoard adds
 * its own helper module only when the sources do not ask for one. The scan skips
 * comments and string literals; it does not try to understand the code – a `$dumpvars`
 * inside an `if` counts as present. Pure.
 */

const DUMP_TASKS: ReadonlySet<string> = new Set(['$dumpfile', '$dumpvars', '$dumpon', '$dumpall']);
/** Icarus's own file name when `$dumpfile` is not called. */
export const DEFAULT_DUMP_FILE = 'dump.vcd';
/** A file name HDLBoard can offer: plain, in the session directory, `.vcd`. */
const PLAIN_VCD_NAME = /^[A-Za-z0-9_.-]+\.vcd$/;
/** `(`, the name, `)`. */
const ARGUMENT_TOKENS = 3;
/** Comments, string literals, names (system tasks included) and single characters, in that order of trying. */
const TOKEN = /\/\/[^\n]*|\/\*[\s\S]*?(?:\*\/|$)|"((?:[^"\\\n]|\\.)*)"?|([$A-Za-z_][\w$]*)|(\S)/g;

export interface OwnDump {
  /** The sources call one of the dump tasks. */
  readonly present: boolean;
  /**
   * The file it writes when that can be known and offered: the literal argument of
   * `$dumpfile` when it is a plain `.vcd` name, Icarus's `dump.vcd` without `$dumpfile`;
   * undefined for a path, another extension, or a name computed at run time.
   */
  readonly file?: string;
}

interface Token {
  readonly kind: 'name' | 'string' | 'other';
  readonly text: string;
}

/** The tokens of a source, with comments left out. */
function tokens(source: string): Token[] {
  const found: Token[] = [];
  for (const [, text, name, other] of source.matchAll(TOKEN)) {
    if (text !== undefined) found.push({ kind: 'string', text });
    else if (name !== undefined) found.push({ kind: 'name', text: name });
    else if (other !== undefined) found.push({ kind: 'other', text: other });
  }
  return found;
}

/** `$dumpfile ( "name" )`: only a literal can be known before the run; null for anything else. */
function dumpFileArgument(list: readonly Token[], at: number): string | null {
  const [open, name, close] = list.slice(at + 1, at + ARGUMENT_TOKENS + 1);
  const literal = open?.text === '(' && name?.kind === 'string' && close?.text === ')';
  return literal ? name.text : null;
}

/** The student's own dump request across all of a run's sources and headers. */
export function findOwnDump(sources: readonly string[]): OwnDump {
  let present = false;
  // undefined: no `$dumpfile` seen; null: one whose name cannot be known.
  let dumpFile: string | null | undefined;
  for (const list of sources.map(tokens)) {
    list.forEach((token, i) => {
      if (token.kind !== 'name' || !DUMP_TASKS.has(token.text)) return;
      present = true;
      if (token.text === '$dumpfile' && dumpFile === undefined) dumpFile = dumpFileArgument(list, i);
    });
  }
  if (!present) return { present };
  if (dumpFile === undefined) return { present, file: DEFAULT_DUMP_FILE };
  return dumpFile !== null && PLAIN_VCD_NAME.test(dumpFile) ? { present, file: dumpFile } : { present };
}
