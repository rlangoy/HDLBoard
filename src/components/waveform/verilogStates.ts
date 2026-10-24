// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * Verilog state registers shown by their state names, as GHW shows a VHDL enumeration.
 * Icarus writes a state register to the VCD as plain bits – `State` reads 0, 1, 2, 3 –
 * and no dump format it has keeps the names, not even of a SystemVerilog `typedef
 * enum`. So the names are read from the testbench's own sources: a register that is
 * only ever assigned names of one `localparam` group,
 *
 *     localparam [1:0] IDLE = 2'd0, START_BIT = 2'd1, DATA_BITS = 2'd2, STOP_BIT = 2'd3;
 *     reg [1:0] State = IDLE;  …  State <= START_BIT;
 *
 * becomes an `enum` signal whose values are those names. A register is also a state
 * register when it is assigned another one: `state <= next_state`, or a testbench's
 * `assign state = uut.State;`, which follows the instance to its module. Anything else –
 * an expression, a name of a second group – leaves it as bits, so a guess never shows
 * a wrong name. Pure.
 */

import type { Scope, SignalRef, Trace, TraceId, WaveformData } from './model';

/** Names for the values of one state register: one `localparam` statement. */
interface StateGroup {
  /** The value each name stands for, in declaration order. */
  readonly values: ReadonlyMap<string, bigint>;
  /** The declared width (`[1:0]`, or the literals' own size); undefined when unsized. */
  readonly width: number | undefined;
}

/** One module of the sources: its text without comments, and its groups. */
interface ModuleSource {
  readonly name: string;
  readonly text: string;
  readonly groups: readonly StateGroup[];
}

const COMMENTS = /\/\/[^\n]*|\/\*[\s\S]*?\*\//g;
const MODULE = /\bmodule\s+(\w+)[\s\S]*?\bendmodule\b/g;
const PARAMETER_STATEMENT = /\b(?:localparam|parameter)\b\s*(?:signed\b\s*)?(?:\[\s*(\d+)\s*:\s*(\d+)\s*\])?([^;]*);/g;
const NAMED_VALUE = /^\s*([A-Za-z_]\w*)\s*=\s*(.+?)\s*$/;
/** `2'd1`, `2'b01`, `4'hA`, `'d3`; the size is optional. */
const BASED_LITERAL = /^(\d+)?\s*'\s*[sS]?([dDbBhHoO])\s*([0-9a-fA-F_]+)$/;
const DECIMAL_LITERAL = /^\d[\d_]*$/;
const IDENTIFIER = /^[A-Za-z_]\w*$/;
const RADIX: Readonly<Record<string, string>> = { d: '', b: '0b', h: '0x', o: '0o' };
/** A group names at least two states. */
const MIN_STATES = 2;
const ONE = BigInt(1);

/** The value and size of a constant literal; undefined for anything else (an expression, x or z). */
function literalOf(text: string): { value: bigint; size: number | undefined } | undefined {
  const compact = text.replace(/\s+/g, ' ').trim();
  if (DECIMAL_LITERAL.test(compact)) return { value: BigInt(compact.replace(/_/g, '')), size: undefined };
  const based = BASED_LITERAL.exec(compact);
  if (based === null) return undefined;
  const [, size, radix, digits] = based;
  const prefix = RADIX[radix.toLowerCase()];
  try {
    return { value: BigInt(prefix + digits.replace(/_/g, '')), size: size === undefined ? undefined : Number(size) };
  } catch {
    return undefined;
  }
}

/** The widest size the literals give themselves, or undefined when none is sized. */
function sizeOf(sizes: ReadonlyArray<number | undefined>): number | undefined {
  const known = sizes.filter((size): size is number => size !== undefined);
  return known.length === 0 ? undefined : Math.max(...known);
}

/** One `localparam` statement as a group, or undefined when it does not name distinct constant states. */
function groupOf(range: string | undefined, rangeEnd: string | undefined, body: string): StateGroup | undefined {
  const parts = body.split(',').map((part) => NAMED_VALUE.exec(part));
  if (parts.length < MIN_STATES || parts.some((part) => part === null)) return undefined;
  const named = parts.flatMap((part) => {
    const literal = literalOf(part?.[2] ?? '');
    return literal === undefined ? [] : [{ name: part?.[1] ?? '', literal }];
  });
  if (named.length !== parts.length) return undefined;
  const values = new Map(named.map(({ name, literal }) => [name, literal.value] as const));
  if (new Set(values.values()).size !== named.length) return undefined;
  const width = range === undefined || rangeEnd === undefined ? sizeOf(named.map(({ literal }) => literal.size)) : Math.abs(Number(range) - Number(rangeEnd)) + 1;
  return { values, width };
}

function modulesIn(sources: readonly string[]): ModuleSource[] {
  return sources.flatMap((source) =>
    [...source.replace(COMMENTS, '').matchAll(MODULE)].map((match) => {
      const groups = [...match[0].matchAll(PARAMETER_STATEMENT)].flatMap((statement) => groupOf(statement[1], statement[2], statement[3]) ?? []);
      return { name: match[1], text: match[0], groups };
    }),
  );
}

const escaped = (name: string) => name.replace(/[$]/g, '\\$&');

/** The right-hand sides assigned to `name` in a module: `name <= x;`, `name = x;`, `reg [1:0] name = x;`. */
function assignedTo(text: string, name: string): string[] {
  const assignment = new RegExp(`(?<![\\w.$])${escaped(name)}\\s*<?=(?!=)\\s*([^;]*);`, 'g');
  return [...text.matchAll(assignment)].map((match) => match[1].trim());
}

/** A register in one module of the sources, with every module to follow instances through. */
interface Register {
  readonly module: ModuleSource;
  readonly name: string;
  readonly modules: readonly ModuleSource[];
}

/** What one right-hand side says about a register: a group it names, another register, or neither. */
type Source = { readonly group: StateGroup } | { readonly register: Register } | 'other';

/** `uut.State`, `top.uut.State`: the register a hierarchical name reads, down through the instances. */
function registerAt(from: Register, path: readonly string[]): Register | undefined {
  const [label, ...rest] = path;
  if (rest.length === 0) return { ...from, name: label };
  const child = instantiated(from.module, label, from.modules);
  return child === undefined ? undefined : registerAt({ ...from, module: child }, rest);
}

function sourceOf(rhs: string, register: Register): Source {
  const path = rhs.split(/\s*\.\s*/);
  if (!path.every((part) => IDENTIFIER.test(part))) return 'other';
  const group = path.length === 1 ? register.module.groups.find((candidate) => candidate.values.has(rhs)) : undefined;
  if (group !== undefined) return { group };
  const read = registerAt(register, path);
  return read === undefined ? 'other' : { register: read };
}

const keyOf = (register: Register) => `${register.module.name}.${register.name}`;

/** The one group every assignment to a register leads to, following the registers it is assigned from. */
function groupOfRegister(register: Register, seen: ReadonlySet<string> = new Set()): StateGroup | undefined {
  const rhs = assignedTo(register.module.text, register.name);
  if (rhs.length === 0 || seen.has(keyOf(register))) return undefined;
  const reached = new Set<StateGroup | undefined>();
  for (const source of rhs.map((text) => sourceOf(text, register))) {
    if (source === 'other') return undefined;
    reached.add('group' in source ? source.group : groupOfRegister(source.register, new Set([...seen, keyOf(register)])));
  }
  const [group] = reached;
  return reached.size === 1 ? group : undefined;
}

/** Skips `#( … )` from `at`, returning the index after it, or `at` when there is none. */
function afterParameters(text: string, at: number): number {
  const hash = /^\s*#\s*\(/.exec(text.slice(at));
  if (hash === null) return at;
  let depth = 0;
  for (let i = at + hash[0].length - 1; i < text.length; i++) {
    if (text[i] === '(') depth++;
    else if (text[i] === ')' && --depth === 0) return i + 1;
  }
  return at;
}

/** The module an instance label in `parent` instantiates: `UART_Tx #( … ) uut (`. */
function instantiated(parent: ModuleSource, label: string, modules: readonly ModuleSource[]): ModuleSource | undefined {
  return modules.find((module) =>
    [...parent.text.matchAll(new RegExp(`\\b${escaped(module.name)}\\b`, 'g'))].some((use) => {
      const rest = parent.text.slice(afterParameters(parent.text, (use.index ?? 0) + module.name.length));
      return new RegExp(`^\\s*${escaped(label)}\\s*\\(`).test(rest);
    }),
  );
}

/** The enum a signal shows, or undefined when it is not a state register of a group that fits it. */
function stateGroupOf(signal: SignalRef, register: Register): StateGroup | undefined {
  if (signal.kind !== 'vector' && signal.kind !== 'logic') return undefined;
  const group = groupOfRegister(register);
  if (group === undefined || (group.width !== undefined && group.width !== signal.width)) return undefined;
  const fits = [...group.values.values()].every((value) => value < ONE << BigInt(signal.width));
  return fits ? group : undefined;
}

/** A bit string as the state it names: the name, the bits when no state has that value, `X` when it is unknown. */
function stateName(bits: string, names: ReadonlyMap<bigint, string>): string {
  if (!/^[01]+$/.test(bits)) return 'X';
  return names.get(BigInt(`0b${bits}`)) ?? bits;
}

/** Builds the named traces, one per trace and group (Icarus's aliases share theirs). */
class NamedTraces {
  readonly traces: Map<TraceId, Trace>;
  private next: TraceId;
  private readonly made = new Map<string, TraceId>();
  private readonly groupIds = new Map<StateGroup, number>();

  constructor(traces: ReadonlyMap<TraceId, Trace>) {
    this.traces = new Map(traces);
    this.next = Math.max(-1, ...traces.keys()) + 1;
  }

  /** The trace of `id` with its values named after `group`. */
  named(id: TraceId, group: StateGroup): TraceId {
    if (!this.groupIds.has(group)) this.groupIds.set(group, this.groupIds.size);
    const key = `${id}/${this.groupIds.get(group)}`;
    const existing = this.made.get(key);
    const trace = this.traces.get(id);
    if (existing !== undefined || trace === undefined) return existing ?? id;
    const names = new Map([...group.values].map(([name, value]) => [value, name] as const));
    this.traces.set(this.next, { ...trace, values: trace.values.map((bits) => stateName(bits, names)) });
    this.made.set(key, this.next);
    return this.next++;
  }
}

interface Walk {
  readonly modules: readonly ModuleSource[];
  readonly traces: NamedTraces;
}

function namedSignal(signal: SignalRef, module: ModuleSource, walk: Walk): SignalRef {
  const group = stateGroupOf(signal, { module, name: signal.name, modules: walk.modules });
  if (group === undefined) return signal;
  return { ...signal, kind: 'enum', trace: walk.traces.named(signal.trace, group), enumType: { name: signal.name, literals: [...group.values.keys()] } };
}

/** The scope with its state registers named, and its instances' below it. */
function namedScope(scope: Scope, module: ModuleSource | undefined, walk: Walk): Scope {
  const scopes = scope.scopes.map((child) => namedScope(child, module && instantiated(module, child.name, walk.modules), walk));
  const signals = module === undefined ? scope.signals : scope.signals.map((signal) => namedSignal(signal, module, walk));
  return { ...scope, scopes, signals };
}

/** The waveform with every Verilog state register the sources name shown by its state names. */
export function withVerilogStateNames(data: WaveformData, sources: readonly string[]): WaveformData {
  const modules = modulesIn(sources);
  if (!modules.some((module) => module.groups.length > 0)) return data;
  const walk: Walk = { modules, traces: new NamedTraces(data.traces) };
  const scopes = data.root.scopes.map((top) => namedScope(top, modules.find((module) => module.name === top.name), walk));
  return { ...data, root: { ...data.root, scopes }, traces: walk.traces.traces };
}
