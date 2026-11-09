// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * A project's compiler options (the project file's `compilerOptions`), as the `OPTIONS`
 * frame carries them: a short list of named options, never raw flags. A raw flag could
 * load a library into the simulator (GHDL's `--vpi=`) or read the server's own files
 * (Icarus's `-y`, `-f`); a named option only ever becomes the flag HDLBoard maps it to
 * (engines/ghdlFlags.ts, verilog/optionFlags.ts). Pure.
 */

/** `auto`: on when a file of the run uses a legacy Synopsys package (engines/legacyPackages.ts). */
export type SynopsysMode = 'auto' | boolean;

export interface GhdlOptions {
  /** GHDL's `-fsynopsys`: the packages std_logic_arith, std_logic_signed and std_logic_unsigned. */
  readonly synopsys: SynopsysMode;
  /** GHDL's `-frelaxed`: some rules of the standard reported as warnings instead of errors. */
  readonly relaxed: boolean;
}

/** The language standards Icarus is offered with `-g`; older ones cannot compile the board testbench. */
export const VERILOG_GENERATIONS = ['2001', '2005', '2009', '2012'] as const;
export type VerilogGeneration = (typeof VERILOG_GENERATIONS)[number];

export interface IverilogOptions {
  /** Icarus's `-g<generation>`; absent, Icarus's own default. */
  readonly generation?: VerilogGeneration;
  /** Icarus's `-D<name>=<value>`: macros defined before the first file, by name. */
  readonly defines: Readonly<Record<string, string>>;
}

export interface CompilerOptions {
  readonly ghdl: GhdlOptions;
  readonly iverilog: IverilogOptions;
}

export const DEFAULT_COMPILER_OPTIONS: CompilerOptions = {
  ghdl: { synopsys: 'auto', relaxed: false },
  iverilog: { defines: {} },
};

export type DecodedCompilerOptions =
  | { readonly ok: true; readonly options: CompilerOptions }
  | { readonly ok: false; readonly reason: string };

/** An option that takes one of a few values: where it is, what it may be, and what it is when left out. */
interface Choice<T> {
  readonly path: string;
  readonly allowed: readonly T[];
  readonly fallback: T;
}

const SYNOPSYS: Choice<SynopsysMode> = { path: 'ghdl.synopsys', allowed: ['auto', true, false], fallback: DEFAULT_COMPILER_OPTIONS.ghdl.synopsys };
const RELAXED: Choice<boolean> = { path: 'ghdl.relaxed', allowed: [true, false], fallback: DEFAULT_COMPILER_OPTIONS.ghdl.relaxed };
const GENERATION: Choice<VerilogGeneration | undefined> = { path: 'iverilog.generation', allowed: VERILOG_GENERATIONS, fallback: undefined };
const MAX_DEFINES = 32;
const DEFINE_NAME = /^[A-Za-z_]\w{0,63}$/;
/** No backtick: a macro's value cannot become a compiler directive (`include). No control characters. */
const DEFINE_VALUE = /^[^`\x00-\x1f\x7f]{0,64}$/;

class OptionsRejection extends Error {}

type JsonObject = Readonly<Record<string, unknown>>;

const isJsonObject = (value: unknown): value is JsonObject =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** `OPTIONS`'s body: JSON, every option optional. An unknown name is refused, so a typo is not silently ignored. */
export function decodeCompilerOptions(body: string): DecodedCompilerOptions {
  try {
    const root = objectWithKeys(parseJson(body), 'compilerOptions', ['ghdl', 'iverilog']);
    return { ok: true, options: { ghdl: decodeGhdl(root.ghdl), iverilog: decodeIverilog(root.iverilog) } };
  } catch (error) {
    if (error instanceof OptionsRejection) return { ok: false, reason: `Invalid compiler options: ${error.message}` };
    throw error;
  }
}

export function encodeCompilerOptions(options: CompilerOptions): string {
  return JSON.stringify(options);
}

function parseJson(body: string): unknown {
  try {
    return JSON.parse(body);
  } catch {
    throw new OptionsRejection('the body is not valid JSON');
  }
}

/** An object holding only `keys`; absent, an empty one (every option at its default). */
function objectWithKeys(value: unknown, path: string, keys: readonly string[]): JsonObject {
  if (value === undefined) return {};
  if (!isJsonObject(value)) throw new OptionsRejection(`${path} must be an object`);
  const unknown = Object.keys(value).find((key) => !keys.includes(key));
  if (unknown !== undefined) throw new OptionsRejection(`${path}.${unknown} is not a known option`);
  return value;
}

/** One of the allowed values, or the fallback when the option is left out. */
function choice<T>(value: unknown, { path, allowed, fallback }: Choice<T>): T {
  if (value === undefined) return fallback;
  if (allowed.includes(value as T)) return value as T;
  throw new OptionsRejection(`${path} must be one of ${allowed.map((item) => JSON.stringify(item)).join(', ')}`);
}

function decodeGhdl(value: unknown): GhdlOptions {
  const ghdl = objectWithKeys(value, 'ghdl', ['synopsys', 'relaxed']);
  return { synopsys: choice(ghdl.synopsys, SYNOPSYS), relaxed: choice(ghdl.relaxed, RELAXED) };
}

function decodeIverilog(value: unknown): IverilogOptions {
  const iverilog = objectWithKeys(value, 'iverilog', ['generation', 'defines']);
  const generation = choice(iverilog.generation, GENERATION);
  const defines = decodeDefines(iverilog.defines);
  return generation === undefined ? { defines } : { generation, defines };
}

function decodeDefines(value: unknown): Record<string, string> {
  if (value === undefined) return {};
  if (!isJsonObject(value)) throw new OptionsRejection('iverilog.defines must be an object');
  const entries = Object.entries(value);
  if (entries.length > MAX_DEFINES) throw new OptionsRejection(`iverilog.defines holds more than ${MAX_DEFINES} macros`);
  for (const [name, text] of entries) {
    if (!DEFINE_NAME.test(name)) throw new OptionsRejection(`iverilog.defines: ${JSON.stringify(name)} is not a macro name`);
    if (typeof text !== 'string' || !DEFINE_VALUE.test(text)) {
      throw new OptionsRejection(`iverilog.defines.${name} must be text of up to 64 characters, without a backtick`);
    }
  }
  return Object.fromEntries(entries) as Record<string, string>;
}
