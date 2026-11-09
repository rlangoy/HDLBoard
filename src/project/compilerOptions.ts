// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * Reads a project file's `compilerOptions`: options for GHDL and Icarus, set by editing
 * the project file (there is no page for them yet). What is valid is kept as written;
 * anything else is left out with a warning, so the project still opens. The backend
 * checks them again (server/src/compilerOptions.ts): this is for the warning on load.
 */

import { isObject } from './jsonValue';
import { SYNOPSYS_MODES, VERILOG_GENERATIONS, type CompilerOptions, type Diagnostic } from './types';

const FIELD = 'compilerOptions';
const MAX_DEFINES = 32;
const DEFINE_NAME = /^[A-Za-z_]\w{0,63}$/;
/** No backtick (a macro could otherwise hold a compiler directive) and no control characters. */
const DEFINE_VALUE = /^[^`\x00-\x1f\x7f]{0,64}$/;

type GhdlOptions = NonNullable<CompilerOptions['ghdl']>;
type IverilogOptions = NonNullable<CompilerOptions['iverilog']>;

export function parseCompilerOptions(raw: unknown, warnings: Diagnostic[]): CompilerOptions | undefined {
  const reader = new OptionReader(warnings);
  const options = reader.objectOf(raw, '', ['ghdl', 'iverilog']);
  if (options === undefined) return undefined;
  return withoutUndefined({ ghdl: parseGhdl(options.ghdl, reader), iverilog: parseIverilog(options.iverilog, reader) });
}

function parseGhdl(raw: unknown, reader: OptionReader): GhdlOptions | undefined {
  const ghdl = reader.objectOf(raw, '.ghdl', ['synopsys', 'relaxed']);
  if (ghdl === undefined) return undefined;
  return withoutUndefined({
    synopsys: reader.oneOf(ghdl.synopsys, '.ghdl.synopsys', SYNOPSYS_MODES),
    relaxed: reader.oneOf(ghdl.relaxed, '.ghdl.relaxed', [true, false]),
  });
}

function parseIverilog(raw: unknown, reader: OptionReader): IverilogOptions | undefined {
  const iverilog = reader.objectOf(raw, '.iverilog', ['generation', 'defines']);
  if (iverilog === undefined) return undefined;
  return withoutUndefined({
    generation: reader.oneOf(iverilog.generation, '.iverilog.generation', VERILOG_GENERATIONS),
    defines: parseDefines(iverilog.defines, reader),
  });
}

function parseDefines(raw: unknown, reader: OptionReader): Record<string, string> | undefined {
  const defines = reader.objectOf(raw, '.iverilog.defines');
  if (defines === undefined) return undefined;
  const usable = Object.entries(defines).filter(([name, value]) => {
    const problem = defineProblem(name, value);
    if (problem !== undefined) reader.leaveOut(`.iverilog.defines.${name}`, problem);
    return problem === undefined;
  });
  for (const [name] of usable.slice(MAX_DEFINES)) reader.leaveOut(`.iverilog.defines.${name}`, `is past the first ${MAX_DEFINES} macros`);
  return Object.fromEntries(usable.slice(0, MAX_DEFINES)) as Record<string, string>;
}

function defineProblem(name: string, value: unknown): string | undefined {
  if (!DEFINE_NAME.test(name)) return 'is not a macro name';
  if (typeof value !== 'string' || !DEFINE_VALUE.test(value)) return 'must be text of up to 64 characters, without a backtick';
  return undefined;
}

/** Reads options and says, in the project's warnings, which ones it left out and why. */
class OptionReader {
  constructor(private readonly warnings: Diagnostic[]) {}

  leaveOut(path: string, problem: string): void {
    this.warnings.push({ severity: 'warning', message: `"${FIELD}${path}" ${problem}; it was left out` });
  }

  /** The object at `path`, without the keys not in `keys` (all kept when omitted); undefined when missing or not an object. */
  objectOf(raw: unknown, path: string, keys?: readonly string[]): Record<string, unknown> | undefined {
    if (raw === undefined) return undefined;
    if (!isObject(raw)) {
      this.leaveOut(path, 'is not an object');
      return undefined;
    }
    if (keys === undefined) return raw;
    for (const key of Object.keys(raw).filter((key) => !keys.includes(key))) this.leaveOut(`${path}.${key}`, 'is not a known option');
    return Object.fromEntries(Object.entries(raw).filter(([key]) => keys.includes(key)));
  }

  oneOf<T>(value: unknown, path: string, allowed: readonly T[]): T | undefined {
    if (value === undefined || allowed.includes(value as T)) return value as T | undefined;
    this.leaveOut(path, `must be one of ${allowed.map((item) => JSON.stringify(item)).join(', ')}`);
    return undefined;
  }
}

/** The object without its undefined fields, so an option left out is not written back as `null`. */
function withoutUndefined<T extends object>(value: T): T {
  return Object.fromEntries(Object.entries(value).filter(([, field]) => field !== undefined)) as T;
}
