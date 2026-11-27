// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * Which modules of the project an instance may give other parameter values
 * (docs/impl_sim_only_warnings.md § 3.4). A module nothing overrides is built with its
 * defaults, as the top of a design or with plain instances, so the latch check may use
 * them; one that something overrides is checked for every value its parameters may take.
 * Overrides are a Verilog instance with `#( … )` or `#2`, a `defparam`, a macro whose
 * expansion holds `#` (`child `PARAMS u (…)`), and a VHDL instance with a `generic map`.
 * A `defparam` reaches every instance of the name its path ends in: those of the module
 * that holds it for `u.R`, those of the whole project for a deeper path (`g2.u.R`,
 * `ua.u.R`). What cannot be resolved (no such instance, a macro used anywhere but after a
 * module name or as a delay) is taken to reach every module. Macros are the
 * `` `define ``s of active code (`blank.ts`), expanded through each other. Read from the
 * code synthesis sees; a testbench's override counts too. Pure.
 */

import type { MacroDefinition } from '../tbDetect/blank';
import type { FileAnalysis, ProjectAnalysis } from '../tbDetect/types';
import { closingBracket } from './brackets';
import { escapeRegExp } from './constructText';
import { scannedFile } from './scan';

/** Whether something in the project may override the parameters of the module of this name. */
export type OverriddenModules = (moduleName: string) => boolean;

/** Every module may be overridden: what a check without the project assumes. */
export const ALL_OVERRIDDEN: OverriddenModules = () => true;

/** `sub #(.W(2)) u (…)`, `sub #2 u (…)`: a name before `#`, not the one a module header declares. */
const VERILOG_OVERRIDE = /(?<!\bmodule\s+)\b([A-Za-z_]\w*)\s*#\s*[\w(]/g;
const DEFPARAM = /\bdefparam\b([^;]*);/g;
/** `u: entity work.sub generic map`, `u: sub generic map`, `u: component sub generic map`. */
const VHDL_GENERIC_MAP = /:\s*(?:entity\s+\w+\s*\.\s*|component\s+)?([A-Za-z_]\w*)(?:\s*\(\s*\w+\s*\))?\s+generic\s+map\b/gi;
const PATH = /^\s*([A-Za-z_]\w*(?:\s*\.\s*[A-Za-z_]\w*)+)\s*=/;
const MODULE = /\bmodule\b[\s\S]*?\bendmodule\b/g;
const MACRO_USE = /`([A-Za-z_]\w*)/g;
/** How deep macros are expanded through each other. */
const MAX_EXPANSION_DEPTH = 8;
/** How many texts one macro may expand to before it counts as unresolved. */
const MAX_EXPANSIONS = 64;
/** Words a macro use may follow that are no module name. */
const NOT_A_MODULE = new Set(['begin', 'end', 'else', 'assign', 'always', 'initial', 'generate', 'endgenerate', 'module', 'endmodule']);

/** Something that may override any module's parameters was found. */
class Unresolved extends Error {}

/** `sub u (`, `sub #(…) u (`, `sub #2 u [3:0] (`: the start of an instantiation, its module and its first instance. */
const INSTANTIATION = /\b([A-Za-z_]\w*)\s+(?:#\s*(?:\([^;]*?\)|\w+)\s*)?([A-Za-z_]\w*)\s*(?:\[[^\]]*\]\s*)?\(/g;
/** `, v (` or `, v [3:0] (`: the next instance of the same instantiation. */
const NEXT_INSTANCE = /^\s*,\s*([A-Za-z_]\w*)\s*(?:\[[^\]]*\]\s*)?\(/;
/** Words an instantiation's first word cannot be. */
const NOT_AN_INSTANTIATION = new Set(['module', 'macromodule', 'function', 'task', 'primitive']);

/**
 * Every instance in `scope` with its module, those of an instantiation that declares
 * several included: `child v (…), u (…);` is `v` and `u`, both of `child`.
 */
function instancesIn(scope: string): { readonly module: string; readonly name: string }[] {
  return [...scope.matchAll(INSTANTIATION)].flatMap((m) => {
    if (NOT_AN_INSTANTIATION.has(m[1])) return [];
    const instances = [{ module: m[1], name: m[2] }];
    let close = closingBracket(scope, (m.index ?? 0) + m[0].length - 1);
    for (let next = NEXT_INSTANCE.exec(scope.slice(close + 1)); close >= 0 && next; next = NEXT_INSTANCE.exec(scope.slice(close + 1))) {
      instances.push({ module: m[1], name: next[1] });
      close = closingBracket(scope, close + 1 + next[0].length - 1);
    }
    return instances;
  });
}

/** The modules of every instance named `instance` in `scope`. */
const instanceModules = (scope: string, instance: string): string[] =>
  instancesIn(scope).filter((i) => i.name === instance).map((i) => i.module);

/**
 * The modules the `defparam`s of `module` reach. `u.R` reaches every instance named `u`
 * in that module (two `generate` blocks may each have one); a deeper path, or a name the
 * module has no instance of, every instance of that name in the project.
 */
function defparamTargets(module: string, allModules: readonly string[]): string[] {
  return [...module.matchAll(DEFPARAM)].flatMap((statement) =>
    statement[1].split(',').flatMap((assignment) => {
      const path = PATH.exec(assignment)?.[1].split('.').map((s) => s.trim());
      if (path === undefined) throw new Unresolved();
      const instance = path[path.length - 2];
      const local = path.length === 2 ? instanceModules(module, instance) : [];
      const targets = local.length > 0 ? local : allModules.flatMap((m) => instanceModules(m, instance));
      if (targets.length === 0) throw new Unresolved();
      return targets;
    }),
  );
}

/** The project's macros: each name with the texts its active `` `define ``s give it. */
class Macros {
  private readonly texts = new Map<string, string[]>();

  constructor(definitions: readonly MacroDefinition[]) {
    for (const { name, text } of definitions) this.texts.set(name, [...(this.texts.get(name) ?? []), text]);
  }

  /**
   * Every text a macro may expand to, other macros expanded in it (`` `define OUTER `INNER ``),
   * one text per combination of their definitions: an `INNER` defined twice gives `OUTER`
   * two texts, each with its own module name. Too many combinations to list are unresolved.
   */
  expansions(name: string, depth = 0): string[] {
    const texts = this.texts.get(name) ?? [];
    const expanded = depth >= MAX_EXPANSION_DEPTH ? texts : texts.flatMap((text) => this.expandIn(text, depth));
    if (expanded.length > MAX_EXPANSIONS) throw new Unresolved();
    return expanded;
  }

  /** `text` with its first known macro use replaced by each of its expansions, the rest in turn (a macro naming itself stops at the depth). */
  private expandIn(text: string, depth: number): string[] {
    const use = depth >= MAX_EXPANSION_DEPTH ? undefined : [...text.matchAll(MACRO_USE)].find((m) => this.texts.has(m[1]));
    if (use === undefined) return [text];
    const [before, after] = [text.slice(0, use.index), text.slice((use.index ?? 0) + use[0].length)];
    const texts = this.expansions(use[1], depth + 1).flatMap((inner) => this.expandIn(before + inner + after, depth + 1));
    if (texts.length > MAX_EXPANSIONS) throw new Unresolved();
    return texts;
  }

  /** The macros whose expansion holds `#`: a use of one may pass an override. */
  overriding(): string[] {
    return [...this.texts.keys()].filter((name) => this.expansions(name).some((text) => text.includes('#')));
  }
}

/**
 * The modules the uses of overriding macros in `code` reach: `child `PARAMS u (…)` the module
 * before it, `` `define CHILD child #(…) `` the module its expansion starts with. A use after
 * `=` or `<=` is a delay (`q <= `DLY d;`); any other use reaches every module.
 */
function macroTargets(code: string, macros: Macros, overriding: readonly string[]): string[] {
  if (overriding.length === 0) return [];
  const uses = new RegExp(`\`(${overriding.map(escapeRegExp).join('|')})\\b`, 'g');
  return [...code.matchAll(uses)].flatMap((use) => {
    const before = code.slice(0, use.index).trimEnd();
    if (/<?=$/.test(before)) return [];
    const preceding = /([A-Za-z_]\w*)$/.exec(before)?.[1];
    if (preceding !== undefined && !NOT_A_MODULE.has(preceding)) return [preceding];
    return macros.expansions(use[1]).map((text) => {
      const leading = /^\s*([A-Za-z_]\w*)\s*#/.exec(text)?.[1];
      if (leading === undefined) throw new Unresolved();
      return leading;
    });
  });
}

interface Found {
  readonly verilog: Set<string>;
  readonly vhdl: Set<string>;
}

function overriddenIn(file: FileAnalysis, project: { macros: Macros; overriding: readonly string[]; modules: readonly string[] }, found: Found): void {
  const { code } = scannedFile(file);
  if (file.language === 'vhdl') {
    for (const m of code.matchAll(VHDL_GENERIC_MAP)) found.vhdl.add(m[1].toLowerCase());
    return;
  }
  for (const m of code.matchAll(VERILOG_OVERRIDE)) found.verilog.add(m[1]);
  for (const module of code.matchAll(MODULE)) for (const target of defparamTargets(module[0], project.modules)) found.verilog.add(target);
  for (const target of macroTargets(code, project.macros, project.overriding)) found.verilog.add(target);
}

export function overriddenModules(raw: ProjectAnalysis): OverriddenModules {
  const files = [...raw.byFile.values()];
  const verilog = files.filter((f) => f.language === 'verilog').map((f) => scannedFile(f));
  const macros = new Macros(verilog.flatMap((scan) => scan.defines));
  const modules = verilog.flatMap((scan) => [...scan.code.matchAll(MODULE)].map((m) => m[0]));
  const found: Found = { verilog: new Set(), vhdl: new Set() };
  try {
    const project = { macros, overriding: macros.overriding(), modules };
    for (const file of files) overriddenIn(file, project, found);
  } catch (e) {
    if (e instanceof Unresolved) return ALL_OVERRIDDEN;
    throw e;
  }
  return (name) => found.verilog.has(name) || found.vhdl.has(name.toLowerCase());
}
