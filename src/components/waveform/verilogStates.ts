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
 * becomes an `enum` signal whose values are those names – when it, or a register it
 * is assigned from, is used as a state: `case (State)`, or `State == IDLE`. A register
 * is also a state register when it is assigned another one: `state <= next_state`, or
 * a testbench's `assign state = uut.State;`, which follows the instance to its module.
 * Anything else – an expression, a name of a second group, constants never used as
 * states – leaves it as bits, so a guess never shows a wrong name. Pure: what one call
 * works out is kept in its own `Analysis`, which nothing outlives.
 */

import { escapeForRegExp } from '../workbench/regExpText';
import type { Scope, SignalRef, Trace, TraceId, WaveformData } from './model';
import type { VerilogModule } from './verilogModules';

/** Names for the values of one state register: one `localparam` statement. */
interface StateGroup {
  /** The value each name stands for, in declaration order. */
  readonly values: ReadonlyMap<string, bigint>;
  /** The declared width (`[1:0]`, or the literals' own size); undefined when unsized. */
  readonly width: number | undefined;
}

/** One module of the sources: its text without comments, and its groups. */
interface ModuleSource extends VerilogModule {
  readonly groups: readonly StateGroup[];
}

/** One call's modules, and what it has worked out about them so far – so nothing is worked out twice. */
interface Analysis {
  readonly modules: readonly ModuleSource[];
  /** By module, the right-hand sides assigned to each name asked about. */
  readonly assignments: Map<ModuleSource, Map<string, readonly string[]>>;
  /** By module, the module each instance label asked about instantiates. */
  readonly instances: Map<ModuleSource, Map<string, ModuleSource | undefined>>;
  /** Whether each group asked about is used as states. */
  readonly stateGroups: Map<StateGroup, boolean>;
}

/**
 * `localparam` only: a `parameter` can be given another value where the module is
 * instantiated (`#(.IDLE(1))`), and the names read from the source would then be wrong.
 */
const LOCALPARAM_STATEMENT = /\blocalparam\b\s*(?:signed\b\s*)?(?:\[\s*(\d+)\s*:\s*(\d+)\s*\])?([^;]*);/g;
const NAMED_VALUE = /^\s*([A-Za-z_]\w*)\s*=\s*(.+?)\s*$/;
/** `2'd1`, `2'b01`, `4'hA`, `'d3`; the size is optional. */
const BASED_LITERAL = /^(\d+)?\s*'\s*[sS]?([dDbBhHoO])\s*([0-9a-fA-F_]+)$/;
const DECIMAL_LITERAL = /^\d[\d_]*$/;
const IDENTIFIER = /^[A-Za-z_]\w*$/;
const RADIX: Readonly<Record<string, string>> = { d: '', b: '0b', h: '0x', o: '0o' };
/**
 * What comes right before a name that starts an assignment statement: the end of the
 * one before, a condition or `@*`, a case label, a delay, a declaration's type or range.
 * Never `(`, so the comparison in `if (State <= STOP_BIT)` is not taken for an assignment.
 */
const STATEMENT_START = String.raw`(?<=(?:[;:,)\]*\d]|\b(?:begin|else|end|default|assign|reg|wire|logic|integer|initial|always))\s*)`;
const CASE_SUBJECT = /\bcase[zx]?\s*\(\s*([A-Za-z_]\w*)\s*\)/g;
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

/** A module with the state groups its `localparam` statements declare. */
function withGroups(module: VerilogModule): ModuleSource {
  const groups = [...module.text.matchAll(LOCALPARAM_STATEMENT)].flatMap((statement) => groupOf(statement[1], statement[2], statement[3]) ?? []);
  return { ...module, groups };
}

/** The value kept for `key`, made by `make` the first time it is asked for. */
function remembered<K, V>(store: Map<K, V>, key: K, make: () => V): V {
  if (store.has(key)) return store.get(key) as V;
  const value = make();
  store.set(key, value);
  return value;
}

/** The analysis's store for one module, made empty the first time. */
const storeOf = <V>(stores: Map<ModuleSource, Map<string, V>>, module: ModuleSource): Map<string, V> =>
  remembered(stores, module, () => new Map<string, V>());

/** The right-hand sides of the statements that assign `name`: `name <= x;`, `name = x;`, `reg [1:0] name = x;`. */
function assignmentsTo(module: ModuleSource, name: string, analysis: Analysis): readonly string[] {
  return remembered(storeOf(analysis.assignments, module), name, () => {
    // The name is looked for first, so the statement-start lookbehind runs only where it is.
    const assignment = new RegExp(`(?=${escapeForRegExp(name)})${STATEMENT_START}(?<![\\w.$])${escapeForRegExp(name)}\\s*<?=(?!=)\\s*([^;]*);`, 'g');
    return [...module.text.matchAll(assignment)].map((match) => match[1].trim());
  });
}

/** A register in one module of the sources, with the analysis to follow instances through. */
interface Register {
  readonly module: ModuleSource;
  readonly name: string;
  readonly analysis: Analysis;
}

/** What one right-hand side says about a register: a group it names, another register, or neither. */
type Source = { readonly group: StateGroup } | { readonly register: Register } | 'other';

/** `uut.State`, `top.uut.State`: the register a hierarchical name reads, down through the instances. */
function registerAt(from: Register, path: readonly string[]): Register | undefined {
  const [label, ...rest] = path;
  if (rest.length === 0) return { ...from, name: label };
  const child = instantiated(from.module, label, from.analysis);
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

/** A register and every register it is assigned from, followed to the end: the groups they name. */
interface Chain {
  readonly groups: ReadonlySet<StateGroup>;
  /** Some assignment is neither a group's name nor a register: the chain names no states. */
  readonly other: boolean;
}

/** What one register's assignments say: the groups they name, the registers they read, and whether any is neither. */
interface Reading {
  readonly groups: readonly StateGroup[];
  readonly registers: readonly Register[];
  readonly other: boolean;
}

/**
 * Whether `name` is also written some way other than a whole assignment: a part-select
 * (`State[0] <= x`), a concatenation target (`{State, f} <= y`), a compound operator
 * (`State += 1`) or a `for` loop. A register written like that is not a state register.
 */
function hasOtherWrites(module: ModuleSource, name: string): boolean {
  const target = `(?<![\\w.$])${escapeForRegExp(name)}`;
  const otherWrites = [
    `${target}\\s*\\[[^\\]]*\\]\\s*<?=(?!=)`,
    `\\{[^{};]*${target}\\b[^{};]*\\}\\s*<?=(?!=)`,
    `${target}\\s*(?:[-+*/%&|^]|<<<?|>>>?)=`,
    `\\bfor\\s*\\(\\s*${target}\\s*=`,
  ];
  return new RegExp(otherWrites.join('|')).test(module.text);
}

function readingOf(register: Register): Reading {
  const sources = assignmentsTo(register.module, register.name, register.analysis).map((text) => sourceOf(text, register));
  return {
    groups: sources.flatMap((source) => (source !== 'other' && 'group' in source ? [source.group] : [])),
    registers: sources.flatMap((source) => (source !== 'other' && 'register' in source ? [source.register] : [])),
    other: sources.length === 0 || sources.includes('other') || hasOtherWrites(register.module, register.name),
  };
}

/**
 * The chain from `start`. A register already in it is not followed again, so the usual
 * `next_state = state;` default next to `state <= next_state;` does not hide the states.
 */
function chainOf(start: Register): Chain {
  const groups = new Set<StateGroup>();
  const seen = new Set<string>();
  const pending = [start];
  for (let register = pending.pop(); register !== undefined; register = pending.pop()) {
    if (seen.has(keyOf(register))) continue;
    seen.add(keyOf(register));
    const reading = readingOf(register);
    if (reading.other) return { groups, other: true };
    reading.groups.forEach((group) => groups.add(group));
    pending.push(...reading.registers);
  }
  return { groups, other: false };
}

/** The names a module uses as states of `group`: `case (state)`, `state == IDLE`, `IDLE != state`. */
function stateSubjects(module: ModuleSource, group: StateGroup): string[] {
  const names = [...group.values.keys()].map(escapeForRegExp).join('|');
  const compared = [
    new RegExp(`(?<![\\w.$])([A-Za-z_]\\w*)\\s*[!=]==?\\s*(?:${names})\\b`, 'g'),
    new RegExp(`\\b(?:${names})\\s*[!=]==?\\s*([A-Za-z_]\\w*)\\b`, 'g'),
  ];
  return [CASE_SUBJECT, ...compared].flatMap((pattern) => [...module.text.matchAll(pattern)].map((match) => match[1]));
}

const namesOnly = (chain: Chain, group: StateGroup) => !chain.other && chain.groups.size === 1 && chain.groups.has(group);

/**
 * Whether a register whose chain names only `group` is used as a state somewhere – so
 * constants that are not states (`localparam FULL = 5208, HALF = 2604;` loaded into a
 * counter) do not turn the counter into names. `next_state` counts through `state`.
 */
function isStateGroup(group: StateGroup, analysis: Analysis): boolean {
  return remembered(analysis.stateGroups, group, () =>
    analysis.modules.some((module) =>
      stateSubjects(module, group).some((name) => namesOnly(chainOf({ module, name, analysis }), group)),
    ),
  );
}

/** The one group a register's chain names, when that group is used as states. */
function groupOfRegister(register: Register): StateGroup | undefined {
  const chain = chainOf(register);
  const [group] = chain.groups;
  if (group === undefined || !namesOnly(chain, group)) return undefined;
  return isStateGroup(group, register.analysis) ? group : undefined;
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

/** Whether `parent` has an instance of `module` whose label `labelled` matches. */
function instantiates(parent: ModuleSource, module: ModuleSource, labelled: RegExp): boolean {
  return [...parent.text.matchAll(new RegExp(`\\b${escapeForRegExp(module.name)}\\b`, 'g'))].some((use) =>
    labelled.test(parent.text.slice(afterParameters(parent.text, (use.index ?? 0) + module.name.length))),
  );
}

/** The module an instance label in `parent` instantiates: `UART_Tx #( … ) uut (`. */
function instantiated(parent: ModuleSource, label: string, analysis: Analysis): ModuleSource | undefined {
  return remembered(storeOf(analysis.instances, parent), label, () => {
    const labelled = new RegExp(`^\\s*${escapeForRegExp(label)}\\s*\\(`);
    return analysis.modules.find((module) => instantiates(parent, module, labelled));
  });
}

/** The enum a signal shows, or undefined when it is not a state register of a group that fits it. */
function stateGroupOf(signal: SignalRef, register: Register): StateGroup | undefined {
  if (signal.kind !== 'vector' && signal.kind !== 'logic') return undefined;
  const group = groupOfRegister(register);
  if (group === undefined || (group.width !== undefined && group.width !== signal.width)) return undefined;
  const fits = [...group.values.values()].every((value) => value < ONE << BigInt(signal.width));
  return fits ? group : undefined;
}

/** A bit string as the state it names: the name; the bits when no state has that value; X or Z when every bit is. */
function stateName(bits: string, names: ReadonlyMap<bigint, string>): string {
  if (/^[01]+$/.test(bits)) return names.get(BigInt(`0b${bits}`)) ?? bits;
  // All X reads X and all Z reads Z, as for a bit; anything mixed (`X1`) keeps its bits.
  const [first] = bits;
  return [...bits].every((bit) => bit === first) ? first : bits;
}

/** The trace with its values named, interned again: two values can take one name (`XX` and `xx`). */
function namedTrace(trace: Trace, names: ReadonlyMap<bigint, string>): Trace {
  const labels = trace.values.map((bits) => stateName(bits, names));
  const values = [...new Set(labels)];
  const indexOf = new Map(values.map((label, index) => [label, index] as const));
  const valueIndex = Uint32Array.from(trace.valueIndex, (index) => indexOf.get(labels[index]) ?? 0);
  return { ...trace, values, valueIndex };
}

/** One past the highest trace id: a loop, as spreading a big waveform's ids as arguments overflows the stack. */
function nextTraceId(traces: ReadonlyMap<TraceId, Trace>): TraceId {
  let highest = -1;
  for (const id of traces.keys()) highest = Math.max(highest, id);
  return highest + 1;
}

/** Builds the named traces, one per trace and group (Icarus's aliases share theirs), beside the waveform's own. */
class NamedTraces {
  private next: TraceId;
  private readonly added = new Map<TraceId, Trace>();
  private readonly made = new Map<string, TraceId>();
  private readonly groupIds = new Map<StateGroup, number>();

  constructor(private readonly original: ReadonlyMap<TraceId, Trace>) {
    this.next = nextTraceId(original);
  }

  /** Whether any trace was named: when none was, the waveform stays as it is. */
  get namedAny(): boolean {
    return this.added.size > 0;
  }

  /** The waveform's traces with the named ones added. */
  all(): ReadonlyMap<TraceId, Trace> {
    return new Map([...this.original, ...this.added]);
  }

  /** The trace of `id` with its values named after `group`. */
  named(id: TraceId, group: StateGroup): TraceId {
    const key = `${id}/${remembered(this.groupIds, group, () => this.groupIds.size)}`;
    const existing = this.made.get(key);
    const trace = this.original.get(id);
    if (existing !== undefined || trace === undefined) return existing ?? id;
    const names = new Map([...group.values].map(([name, value]) => [value, name] as const));
    this.added.set(this.next, namedTrace(trace, names));
    this.made.set(key, this.next);
    return this.next++;
  }
}

interface Walk {
  readonly analysis: Analysis;
  readonly traces: NamedTraces;
}

function namedSignal(signal: SignalRef, module: ModuleSource, walk: Walk): SignalRef {
  const group = stateGroupOf(signal, { module, name: signal.name, analysis: walk.analysis });
  if (group === undefined) return signal;
  return { ...signal, kind: 'enum', trace: walk.traces.named(signal.trace, group), enumType: { name: signal.name, literals: [...group.values.keys()] } };
}

/** The scope with its state registers named, and its instances' below it. */
function namedScope(scope: Scope, module: ModuleSource | undefined, walk: Walk): Scope {
  const scopes = scope.scopes.map((child) => namedScope(child, module && instantiated(module, child.name, walk.analysis), walk));
  const signals = module === undefined ? scope.signals : scope.signals.map((signal) => namedSignal(signal, module, walk));
  return { ...scope, scopes, signals };
}

/** The waveform with every Verilog state register the sources name shown by its state names. */
export function withVerilogStateNames(data: WaveformData, verilogModules: readonly VerilogModule[]): WaveformData {
  const modules = verilogModules.map(withGroups);
  if (!modules.some((module) => module.groups.length > 0)) return data;
  const analysis: Analysis = { modules, assignments: new Map(), instances: new Map(), stateGroups: new Map() };
  const walk: Walk = { analysis, traces: new NamedTraces(data.traces) };
  const scopes = data.root.scopes.map((top) => namedScope(top, modules.find((module) => module.name === top.name), walk));
  if (!walk.traces.namedAny) return data;
  return { ...data, root: { ...data.root, scopes }, traces: walk.traces.all() };
}
