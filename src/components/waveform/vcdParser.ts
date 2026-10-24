// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * VCD text → `WaveformData` (docs/waveform_viewer_spec.md § 8.3). Reads the VCD that
 * GHDL writes – with all nine `std_logic` values, outside the VCD standard – and the
 * VCD of Icarus Verilog, with its shared identifier codes and left-compressed vectors.
 *
 * Streaming: `push` takes the text in chunks as they arrive, so a large file never
 * exists as one string. A file from a stopped run is cut off anywhere; `finish` then
 * drops the incomplete last line and time step instead of failing. Pure.
 */

import { WaveParseError, type RunWaveStatus, type SignalKind, type SignalRef, type Ticks, type Trace, type TraceId, type WaveformData } from './model';
import { ScopeTree } from './scopeTree';
import { TraceBuilder } from './traceBuilder';

const FS_PER_UNIT: Readonly<Record<string, number>> = { fs: 1, ps: 1e3, ns: 1e6, us: 1e9, ms: 1e12, s: 1e15 };
const TIMESCALE = /^(\d+)\s*(fs|ps|ns|us|ms|s)$/;
/** `q[3:0]`, `q [3:0]` (Icarus) and a single index, `q[5]`. */
const RANGE = /^\[(-?\d+)(?::(-?\d+))?\]$/;
const ATTACHED_RANGE = /^(.*?)(\[-?\d+(?::-?\d+)?\])$/;
/** A time below this many digits is always below 2^53; longer ones are checked exactly. */
const SAFE_TIME_DIGITS = 15;
const MAX_TIME = BigInt(Number.MAX_SAFE_INTEGER);
/** GHDL's `integer` and Verilog's `integer` are 32-bit two's complement. */
const SIGNED_INTEGER_WIDTH = 32;
const BIGINT_ONE = 1n;

const SCALAR_VALUE = /^[01xzuwlh-]$/i;
const HASH = '#'.charCodeAt(0);
const ZERO = '0'.charCodeAt(0);
const MAX_DIGIT = 9;
const DECIMAL_BASE = 10;
const NOT_HANDLED = 'is not handled';
/** By character code: the upper-case text of a scalar value character, e.g. `x` → `X`. */
const SCALAR_TEXT: Array<string | undefined> = [];
for (const c of '01xzuwlh-XZUWLH') SCALAR_TEXT[c.charCodeAt(0)] = c.toUpperCase();
const DUMP_KEYWORDS = new Set(['$dumpvars', '$dumpall', '$dumpon', '$dumpoff', '$end']);

type Conversion = 'scalar' | 'vector' | 'integer' | 'real';

interface Code {
  readonly trace: TraceId;
  readonly conversion: Conversion;
  readonly width: number;
}

type Phase = 'header' | 'body';

/** A vector value without its leading `b`, extended on the left to `width` (VCD rules). */
export function extendVector(bits: string, width: number): string {
  const upper = bits.toUpperCase();
  if (upper.length >= width) return upper.slice(upper.length - width);
  const lead = upper[0] === 'X' || upper[0] === 'Z' ? upper[0] : '0';
  return lead.repeat(width - upper.length) + upper;
}

/** A bit string as a decimal integer, two's complement at 32 bits; `X` when any bit is not 0 or 1. */
export function vectorToInteger(bits: string): string {
  if (!/^[01]+$/.test(bits)) return 'X';
  const value = BigInt(`0b${bits}`);
  const signed = bits.length === SIGNED_INTEGER_WIDTH && bits[0] === '1' ? value - (BIGINT_ONE << BigInt(bits.length)) : value;
  return signed.toString();
}

function parseTime(digits: string): Ticks {
  if (!/^\d+$/.test(digits)) throw new WaveParseError(`The waveform has a time that is not a number: #${digits}.`);
  if (digits.length > SAFE_TIME_DIGITS && BigInt(digits) > MAX_TIME) {
    throw new WaveParseError('The simulation ran too long to be shown exactly (more than 2^53 time steps).');
  }
  return Number(digits);
}

function kindOf(type: string, width: number): SignalKind {
  if (type === 'real') return 'real';
  if (type === 'integer') return 'integer';
  return width === 1 ? 'logic' : 'vector';
}

function conversionOf(kind: SignalKind): Conversion {
  if (kind === 'real') return 'real';
  if (kind === 'integer') return 'integer';
  return kind === 'logic' ? 'scalar' : 'vector';
}

/** The name and, when it has one, the range of a `$var`: `q[3:0]` and `q [3:0]` alike. */
function splitName(name: string, rest: readonly string[]): { name: string; range?: { left: number; right: number } } {
  const separate = rest.find((token) => RANGE.test(token));
  const attached = separate === undefined ? ATTACHED_RANGE.exec(name) : null;
  const rangeText = separate ?? attached?.[2];
  const base = attached ? attached[1] : name;
  const match = rangeText === undefined ? null : RANGE.exec(rangeText);
  if (!match) return { name };
  // A single index is part of the name (`q[5]`): one bit of a vector.
  if (match[2] === undefined) return { name: `${base}[${match[1]}]` };
  return { name: base, range: { left: Number(match[1]), right: Number(match[2]) } };
}

export class VcdParser {
  private phase: Phase = 'header';
  private pending = '';
  /** Tokens of the header command being read, from its keyword to its `$end`. */
  private command: string[] | null = null;
  private skippingComment = false;
  /** A vector, real or string value was read; its identifier code comes next. */
  private awaitingCode: ((code: string) => void) | null = null;

  private tickFs = 1;
  private readonly tree = new ScopeTree();
  private readonly codes = new Map<string, Code>();
  private readonly builders: TraceBuilder[] = [];
  /** The time step being read; it is complete only once the next `#` arrives. */
  private stepTime: Ticks = 0;
  private sawTime = false;

  push(text: string): void {
    const all = this.pending + text;
    let end = all.length;
    while (end > 0 && !isSpace(all.charCodeAt(end - 1))) end--;
    this.pending = all.slice(end);
    this.scan(all, end);
  }

  /** `complete`: the run ended normally, so the file's last time step is whole. */
  finish(status: RunWaveStatus): WaveformData {
    const complete = status === 'complete';
    if (complete && this.pending !== '') this.token(this.pending);
    this.pending = '';
    if (this.phase === 'header') throw new WaveParseError('The waveform file ends before its list of signals is complete.');
    const truncated = !complete;
    if (truncated && this.sawTime) for (const builder of this.builders) builder.dropFrom(this.stepTime);
    const traces = new Map<TraceId, Trace>();
    this.builders.forEach((builder, id) => traces.set(id, builder.build()));
    return {
      source: { format: 'vcd', status, truncated },
      tickFs: this.tickFs,
      endTime: this.stepTime,
      root: this.tree.build(),
      traces,
    };
  }

  private scan(text: string, end: number): void {
    for (let i = skipSpace(text, 0, end); i < end; ) {
      const start = i;
      i = skipToken(text, i, end);
      if (this.phase !== 'body' || !this.fastBodyToken(text, start, i)) this.token(text.slice(start, i));
      i = skipSpace(text, i, end);
    }
  }

  /**
   * The value changes – nearly all of a file – read straight from the text, without
   * making a string of every token. Returns false for anything else, which then goes
   * through `bodyToken`.
   */
  private fastBodyToken(text: string, start: number, end: number): boolean {
    if (this.skippingComment || this.awaitingCode !== null) return false;
    const first = text.charCodeAt(start);
    if (first === HASH) return this.fastTime(text, start, end);
    const scalar = first < SCALAR_TEXT.length ? SCALAR_TEXT[first] : undefined;
    if (scalar === undefined) return false;
    this.setValue(text.slice(start + 1, end), scalar);
    return true;
  }

  /** `#<digits>` short enough to be exact as a number. */
  private fastTime(text: string, start: number, end: number): boolean {
    if (end === start + 1 || end - start > SAFE_TIME_DIGITS) return false;
    let time = 0;
    for (let i = start + 1; i < end; i++) {
      const digit = text.charCodeAt(i) - ZERO;
      if (digit < 0 || digit > MAX_DIGIT) return false;
      time = time * DECIMAL_BASE + digit;
    }
    this.setTime(time);
    return true;
  }

  private setTime(time: Ticks): void {
    this.stepTime = time;
    this.sawTime = true;
  }

  private token(token: string): void {
    if (this.phase === 'header') this.headerToken(token);
    else this.bodyToken(token);
  }

  private headerToken(token: string): void {
    if (this.command === null) {
      this.command = [token];
      if (token === '$end') this.command = null;
      return;
    }
    if (token !== '$end') {
      this.command.push(token);
      return;
    }
    const [keyword, ...args] = this.command;
    this.command = null;
    this.headerCommand(keyword, args);
  }

  /** The header commands the viewer uses; `$date`, `$version` and the like are skipped. */
  private readonly headerCommands: Readonly<Record<string, (args: readonly string[]) => void>> = {
    $timescale: (args) => this.setTimescale(args.join('')),
    $scope: (args) => this.tree.enter(args[1] ?? args[0] ?? '', 'instance'),
    $upscope: () => this.tree.leave(),
    $var: (args) => this.declareVariable(args),
    $comment: (args) => this.headerComment(args),
    $enddefinitions: () => {
      this.phase = 'body';
    },
  };

  private headerCommand(keyword: string, args: readonly string[]): void {
    this.headerCommands[keyword]?.(args);
  }

  /** GHDL: `$comment state is not handled $end` for an enumeration, a record or `character`. */
  private headerComment(args: readonly string[]): void {
    if (args.slice(1).join(' ') === NOT_HANDLED) this.tree.addUnavailable({ name: args[0], reason: 'vcd-type' });
  }

  private setTimescale(text: string): void {
    const match = TIMESCALE.exec(text);
    if (!match) throw new WaveParseError(`The waveform has a timescale the viewer does not know: ${text}.`);
    this.tickFs = Number(match[1]) * FS_PER_UNIT[match[2]];
  }

  /** `$var`: a signal. Icarus also records each parameter and localparam, which never change: left out, as GHDL leaves out VHDL constants. */
  private declareVariable(args: readonly string[]): void {
    const [type] = args;
    if (type === 'parameter') return;
    this.declare(args);
  }

  private declare(args: readonly string[]): void {
    const [type = '', widthText = '', code = '', rawName = '', ...rest] = args;
    const width = Number(widthText) || 1;
    const kind = kindOf(type, width);
    const { name, range } = splitName(rawName, rest);
    let known = this.codes.get(code);
    if (known === undefined) {
      known = { trace: this.builders.length, conversion: conversionOf(kind), width };
      this.builders.push(new TraceBuilder());
      this.codes.set(code, known);
    }
    const signal: SignalRef = range === undefined ? { name, trace: known.trace, kind, width } : { name, trace: known.trace, kind, width, range };
    this.tree.addSignal(signal);
  }

  /** What a body token starting with each character is (§ 8.3 rules 6–9). */
  private readonly bodyTokens: Readonly<Record<string, (token: string) => void>> = {
    '#': (token) => this.setTime(parseTime(token.slice(1))),
    b: (token) => this.awaitCode((code) => this.setValue(code, token.slice(1))),
    r: (token) => this.awaitCode((code) => this.setReal(code, token.slice(1))),
    // A string value (Icarus) is not shown; its code follows and is skipped.
    s: () => this.awaitCode(() => {}),
    $: (token) => this.bodyCommand(token),
  };

  private awaitCode(apply: (code: string) => void): void {
    this.awaitingCode = apply;
  }

  private bodyToken(token: string): void {
    if (this.skippingComment) {
      this.skippingComment = token !== '$end';
      return;
    }
    const apply = this.awaitingCode;
    if (apply !== null) {
      this.awaitingCode = null;
      apply(token);
      return;
    }
    const lead = token[0].toLowerCase();
    const handle = this.bodyTokens[lead];
    if (handle !== undefined) handle(token);
    else if (SCALAR_VALUE.test(lead)) this.setValue(token.slice(1), token[0]);
  }

  private bodyCommand(token: string): void {
    if (token === '$comment') this.skippingComment = true;
    else if (!DUMP_KEYWORDS.has(token)) throw new WaveParseError(`The waveform has a command the viewer does not know: ${token}.`);
  }

  private setValue(code: string, raw: string): void {
    const known = this.codes.get(code);
    if (known === undefined) return;
    const builder = this.builders[known.trace];
    switch (known.conversion) {
      case 'scalar':
        builder.change(this.stepTime, raw.toUpperCase());
        break;
      case 'vector':
        builder.change(this.stepTime, extendVector(raw, known.width));
        break;
      case 'integer':
        builder.change(this.stepTime, vectorToInteger(extendVector(raw, known.width)));
        break;
      case 'real':
        builder.change(this.stepTime, raw);
        break;
    }
  }

  private setReal(code: string, raw: string): void {
    const known = this.codes.get(code);
    if (known === undefined || raw === '') return;
    const value = Number(raw);
    this.builders[known.trace].change(this.stepTime, Number.isNaN(value) ? raw : String(value));
  }
}

const SPACE = ' '.charCodeAt(0);
const LINE_FEED = '\n'.charCodeAt(0);
const CARRIAGE_RETURN = '\r'.charCodeAt(0);
const TAB = '\t'.charCodeAt(0);

/** Direct comparisons, not a set lookup: this runs for every character of the file. */
function isSpace(code: number): boolean {
  return code === SPACE || code === LINE_FEED || code === CARRIAGE_RETURN || code === TAB;
}

function skipSpace(text: string, i: number, end: number): number {
  while (i < end && isSpace(text.charCodeAt(i))) i++;
  return i;
}

function skipToken(text: string, i: number, end: number): number {
  while (i < end && !isSpace(text.charCodeAt(i))) i++;
  return i;
}

/** Parses a whole VCD text at once; for tests and small files. */
export function parseVcd(text: string, status: RunWaveStatus = 'complete'): WaveformData {
  const parser = new VcdParser();
  parser.push(text);
  return parser.finish(status);
}
