// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * Which modules of the project an instance may give other parameter values
 * (docs/impl_sim_only_warnings.md § 3.4). A module nothing overrides is built with its
 * defaults, as the top of a design or with plain instances, so the latch check may use
 * them; one that something overrides is checked for every value its parameters may take.
 * Overrides are a Verilog instance with `#( … )` or `#2`, a `defparam`, a macro whose
 * expansion holds `#` (`child `PARAMS u (…)`), and a VHDL instance with a `generic map`.
 * A module named through a macro (`` `CELL #(.R(1)) u (…) ``) is each module the macro may
 * expand to. A `defparam` reaches every instance of the name its path ends in: those of the
 * module that holds it for `u.R`, those of the whole project for a deeper path (`g2.u.R`,
 * `ua.u.R`). What cannot be resolved (no such instance, an unknown macro, a macro used
 * anywhere but after a module name or as a delay) is taken to reach every module.
 *
 * Every `ifdef branch is read, and every `` `define `` in any branch is one of a macro's
 * texts: a branch the file alone leaves out may test a macro an included file defines, and
 * synthesis may take it. Reading more can only find more overrides. Pure.
 */

import type { MacroDefinition } from '../tbDetect/blank';
import type { FileAnalysis, ProjectAnalysis } from '../tbDetect/types';
import { closingBracket } from './brackets';
import { escapeRegExp, wordBefore } from './constructText';
import { scannedFile, type ScannedFile } from './scan';

/** Whether something in the project may override the parameters of the module of this name. */
export type OverriddenModules = (moduleName: string) => boolean;

/** Every module may be overridden: what a check without the project assumes. */
export const ALL_OVERRIDDEN: OverriddenModules = () => true;

/** `sub #(.W(2)) u (…)`, `sub #2 u (…)`, ``sub #`W u (…)``: a name before `#` (not the one a module header declares, see `HEADER_WORDS`). */
const VERILOG_OVERRIDE = /\b([A-Za-z_]\w*)\s*#\s*[\w(`]/g;
/** The words before a module header's name, whose `#( … )` declares parameters. */
const HEADER_WORDS = new Set(['module', 'macromodule']);
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

/** Something that may override any module's parameters was found. */
class Unresolved extends Error {}

/** `sub u (`, `sub #(…) u (`, `sub #2 u [3:0] (`: the start of an instantiation, its module and its first instance. */
const INSTANTIATION = /\b([A-Za-z_]\w*)\s+(?:#\s*(?:\([^;]*?\)|`?\w+)\s*)?([A-Za-z_]\w*)\s*(?:\[[^\]]*\]\s*)?\(/g;
/** `, v (` or `, v [3:0] (`: the next instance of the same instantiation. */
const NEXT_INSTANCE = /\s*,\s*([A-Za-z_]\w*)\s*(?:\[[^\]]*\]\s*)?\(/;
/** Words an instantiation's first word cannot be. */
const NOT_AN_INSTANTIATION = new Set(['module', 'macromodule', 'function', 'task', 'primitive']);
/** What a function-like macro's formal becomes in its text: no name starts with it. */
const FORMAL = '\u0000';
const DEFPARAM_WORD = /\bdefparam\b/;
/** Compiler directives: `` `define F(a) … `` is no instance of a module `define`. */
const DIRECTIVES = new Set(['define', 'undef', 'ifdef', 'ifndef', 'elsif', 'else', 'endif', 'include', 'timescale', 'resetall', 'celldefine', 'endcelldefine', 'default_nettype', 'line', 'pragma']);

/** The project's macros: each name with the texts its `` `define ``s give it. */
class Macros {
  private readonly texts = new Map<string, string[]>();

  /**
   * A function-like macro's formals are replaced by a mark no name starts with: what
   * `` `define INST(M) M #(.R(1)) `` names depends on the call's argument, unknown here.
   */
  constructor(definitions: readonly MacroDefinition[]) {
    for (const { name, text, params } of definitions) {
      const formals = params.filter((p) => /^[A-Za-z_]\w*$/.test(p));
      const unbound = formals.length === 0 ? text : text.replace(new RegExp(`\\b(?:${formals.join('|')})\\b`, 'g'), FORMAL);
      this.texts.set(name, [...(this.texts.get(name) ?? []), unbound]);
    }
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

  /** The macros whose expansion holds `#` or a `defparam`: a use of one may pass an override. */
  overriding(): string[] {
    return [...this.texts.keys()].filter((name) => this.expansions(name).some((text) => text.includes('#') || DEFPARAM_WORD.test(text)));
  }

  /** Whether a use of the macro may emit a `defparam`, whose path the check does not follow through the expansion. */
  emitsDefparam(name: string): boolean {
    return this.expansions(name).some((text) => DEFPARAM_WORD.test(text));
  }

  /** The module a name at `at` in `code` stands for: itself, or each module a macro there may expand to (`` `CELL ``); a directive stands for none. */
  modulesAt(code: string, at: number, name: string): string[] {
    if (code[at - 1] !== '`') return [name];
    return DIRECTIVES.has(name) ? [] : this.leadingNames(name);
  }

  /** The module names a macro's expansions start with: `` `define CELL child `` is `child`. A macro that names none, or is unknown, is unresolved. */
  leadingNames(name: string): string[] {
    const expansions = this.expansions(name);
    if (expansions.length === 0) throw new Unresolved();
    return expansions.map((text) => {
      const leading = /^\s*([A-Za-z_]\w*)/.exec(text)?.[1];
      if (leading === undefined) throw new Unresolved();
      return leading;
    });
  }
}

/** One file's code for the search, and its macros' own texts, which are no code there. */
interface Source {
  readonly code: string;
  readonly inDefine: (at: number) => boolean;
}

const sourceOf = (scan: ScannedFile): Source => ({
  code: scan.everyBranch,
  inDefine: (at) => scan.defines.some((d) => at >= d.from && at < d.to),
});

/**
 * Every instance in `scope` with its module, those of an instantiation that declares
 * several included: `child v (…), u (…);` is `v` and `u`, both of `child`.
 */
function instancesIn(scope: string, macros: Macros): { readonly module: string; readonly name: string }[] {
  return [...scope.matchAll(INSTANTIATION)].flatMap((m) => {
    if (NOT_AN_INSTANTIATION.has(m[1])) return [];
    const names = [m[2]];
    // Read at each `)` in place (a sticky search), never copying the text after it.
    const next = new RegExp(NEXT_INSTANCE.source, 'y');
    for (let close = closingBracket(scope, (m.index ?? 0) + m[0].length - 1); close >= 0; ) {
      next.lastIndex = close + 1;
      const instance = next.exec(scope);
      if (instance === null) break;
      names.push(instance[1]);
      close = closingBracket(scope, next.lastIndex - 1);
    }
    const modules = macros.modulesAt(scope, m.index ?? 0, m[1]);
    return modules.flatMap((module) => names.map((name) => ({ module, name })));
  });
}

/** The modules of instances by instance name: `u` is each module an instance named `u` has. */
type InstanceIndex = ReadonlyMap<string, readonly string[]>;

/** Every instance of `scopes`, indexed once: a netlist of thousands of `defparam`s reads each module once, not once per `defparam`. */
function instanceIndex(scopes: readonly string[], macros: Macros): InstanceIndex {
  const index = new Map<string, string[]>();
  for (const scope of scopes) {
    for (const { module, name } of instancesIn(scope, macros)) {
      const modules = index.get(name);
      if (modules) modules.push(module);
      else index.set(name, [module]);
    }
  }
  return index;
}

/**
 * The modules some `defparam` statements reach. `u.R` reaches every instance named `u` in
 * the module that holds it (`local`; two `generate` blocks may each have one); a deeper
 * path, a name the module has no instance of, or a `defparam` outside any module (a
 * fragment an `include puts inside one), every instance of that name in the project.
 */
function defparamTargets(statements: readonly string[], local: InstanceIndex | undefined, project: Project): string[] {
  return statements.flatMap((statement) =>
    statement.split(',').flatMap((assignment) => {
      const path = PATH.exec(assignment)?.[1].split('.').map((s) => s.trim());
      if (path === undefined) throw new Unresolved();
      const targets = pathTargets(path, local, project);
      if (targets.length === 0) throw new Unresolved();
      return targets;
    }),
  );
}

/** The modules a `defparam` path's last instance may be of (see `defparamTargets`). */
function pathTargets(path: readonly string[], local: InstanceIndex | undefined, project: Project): readonly string[] {
  const instance = path[path.length - 2];
  const near = path.length === 2 ? local?.get(instance) : undefined;
  return near !== undefined && near.length > 0 ? near : (project.instances().get(instance) ?? []);
}

/** The `defparam`s of one file, each module's with its own instances and those outside any module with none. */
function fileDefparamTargets(source: Source, project: Project): string[] {
  const modules = [...source.code.matchAll(MODULE)].map((m) => ({ from: m.index ?? 0, text: m[0] }));
  const statementsIn = (text: string, offset: number) =>
    [...text.matchAll(DEFPARAM)].filter((s) => !source.inDefine(offset + (s.index ?? 0))).map((s) => s[1]);
  const inModules = modules.flatMap((module) => {
    const statements = statementsIn(module.text, module.from);
    return statements.length === 0 ? [] : defparamTargets(statements, instanceIndex([module.text], project.macros), project);
  });
  const outside = [...source.code.matchAll(DEFPARAM)]
    .filter((s) => !modules.some((m) => (s.index ?? 0) >= m.from && (s.index ?? 0) < m.from + m.text.length) && !source.inDefine(s.index ?? 0))
    .map((s) => s[1]);
  return [...inModules, ...defparamTargets(outside, undefined, project)];
}

/**
 * The modules the uses of overriding macros in `source` reach: `child `PARAMS u (…)` the
 * module before it, when it is one of the project or a macro; else the module its expansion
 * starts with (`` `define CHILD child #(…) ``, also after a block label: `begin : g `CHILD
 * u (…)`). A use after `=` or `<=` is a delay (`q <= `DLY d;`); any other use reaches every
 * module.
 */
function macroTargets(source: Source, project: Project): string[] {
  if (project.overriding.length === 0) return [];
  const uses = new RegExp(`\`(${project.overriding.map(escapeRegExp).join('|')})\\b`, 'g');
  return [...source.code.matchAll(uses)].flatMap((use) => (source.inDefine(use.index ?? 0) ? [] : useTargets(source.code, project, use)));
}

/** The modules one use of an overriding macro reaches (see `macroTargets`), from each text it may expand to. */
function useTargets(code: string, project: Project, use: RegExpExecArray | RegExpMatchArray): string[] {
  if (project.macros.emitsDefparam(use[1])) throw new Unresolved();
  const outer = precedingToken(code, use.index ?? 0);
  return project.macros.expansions(use[1]).flatMap((text) =>
    [...text.matchAll(HASH)].flatMap((hash) => {
      const before = precedingToken(text, hash.index ?? 0);
      // A `#` that starts the text follows what stands before the use.
      return before.text === '' ? hashTargets(code, outer, project) : hashTargets(text, before, project);
    }),
  );
}

/** A `#` that may start an override: `#(`, `#5`, `#P`, ``#`P``. */
const HASH = /#\s*[\w(`]/g;

/**
 * The modules the `#` after `before` overrides. After a name: that module (or each one a
 * macro there may expand to), and after a keyword (`always #5`) a module of that name, which
 * no project has. After `=`, `<=`, `)` or `;` it is a delay (`q <= #1 d`,
 * `@(posedge c) #1 q = d`), and overrides nothing. After a function-like macro's formal
 * (`M #(.R(1))` in `` `define INST(M) ``) the module is the argument, which the check does
 * not follow: unresolved.
 */
function hashTargets(code: string, before: { readonly text: string; readonly at: number }, project: Project): string[] {
  if (before.text === FORMAL) throw new Unresolved();
  if (!/^[A-Za-z_]\w*$/.test(before.text)) return [];
  return project.macros.modulesAt(code, before.at, before.text);
}

/**
 * The token right before `at`, past blanks: a name, `<=`, `=`, or one other character.
 * Read backwards from `at`, never the whole text before it: a file of thousands of macro
 * uses stays linear.
 */
function precedingToken(code: string, at: number): { readonly text: string; readonly at: number } {
  let end = at;
  while (end > 0 && /\s/.test(code[end - 1])) end--;
  let start = end;
  while (start > 0 && /\w/.test(code[start - 1])) start--;
  if (start < end && /[A-Za-z_]/.test(code[start])) return { text: code.slice(start, end), at: start };
  if (code.slice(end - 2, end) === '<=') return { text: '<=', at: end - 2 };
  return { text: code.slice(end - 1, end), at: end - 1 };
}

/** The index of the first of the sorted `offsets` at or after `at` (their length when none is). */
function firstFrom(offsets: readonly number[], at: number): number {
  let [low, high] = [0, offsets.length];
  while (low < high) {
    const middle = (low + high) >>> 1;
    if (offsets[middle] < at) low = middle + 1;
    else high = middle;
  }
  return low;
}

/** `` `CELL(0) #(…) ``: a macro called with arguments, whose `)` an override may follow. */
const MACRO_CALL = /`([A-Za-z_]\w*)\s*\(/g;

/**
 * The modules a macro called with arguments names when an override follows its call:
 * `` `CELL(0) #(.R(1)) u (…) `` with `` `define CELL(x) child ``.
 */
function macroCallTargets(source: Source, macros: Macros): string[] {
  const hashes = [...source.code.matchAll(HASH)].map((h) => h.index ?? 0);
  return [...source.code.matchAll(MACRO_CALL)].flatMap((call) => {
    const at = call.index ?? 0;
    if (source.inDefine(at) || DIRECTIVES.has(call[1])) return [];
    const close = closingBracket(source.code, at + call[0].length - 1);
    if (close < 0) return [];
    // `` child `PASS(#(.R(1))) u `` with `` `define PASS(x) x ``: where the argument lands is not followed.
    if ((hashes[firstFrom(hashes, at)] ?? Infinity) < close) throw new Unresolved();
    const followedByOverride = new RegExp(`\\s*${HASH.source}`, 'y');
    followedByOverride.lastIndex = close + 1;
    return followedByOverride.test(source.code) ? macros.leadingNames(call[1]) : [];
  });
}

interface Project {
  readonly macros: Macros;
  readonly overriding: readonly string[];
  /** The names of the project's Verilog modules (every branch read). */
  readonly moduleNames: ReadonlySet<string>;
  /** Every instance in those modules, indexed on first use. */
  readonly instances: () => InstanceIndex;
}

interface Found {
  readonly verilog: Set<string>;
  readonly vhdl: Set<string>;
}

/** The modules one Verilog file overrides: by `#`, by `defparam`, by macros. */
function verilogTargets(scan: ScannedFile, project: Project): string[] {
  const source = sourceOf(scan);
  const byHash = [...source.code.matchAll(VERILOG_OVERRIDE)]
    .filter((m) => !source.inDefine(m.index ?? 0) && !HEADER_WORDS.has(wordBefore(source.code, m.index ?? 0)))
    .flatMap((m) => namesBefore(source.code, m.index ?? 0, m[1]).flatMap((name) => project.macros.modulesAt(source.code, name.at, name.text)));
  return [...byHash, ...fileDefparamTargets(source, project), ...macroTargets(source, project), ...macroCallTargets(source, project.macros)];
}

/**
 * The name before an override at `at`, and the names right before it: with every `ifdef
 * branch read, `` `ifdef A child_a `else child_b `endif #(.R(1)) u `` reads as
 * `child_a child_b #(.R(1)) u`, and either module may be the one overridden. Two names in a
 * row come only from such branches (or a keyword, `else child`, or a block label, which name
 * no module).
 */
function namesBefore(code: string, at: number, name: string): { readonly text: string; readonly at: number }[] {
  const names = [{ text: name, at }];
  for (let before = precedingToken(code, at); /^[A-Za-z_]\w*$/.test(before.text); before = precedingToken(code, before.at)) {
    names.push(before);
    if (code[before.at - 1] === '`') break;
  }
  return names;
}

function overriddenIn(file: FileAnalysis, project: Project, found: Found): void {
  const scan = scannedFile(file);
  if (file.language === 'vhdl') {
    for (const m of scan.code.matchAll(VHDL_GENERIC_MAP)) found.vhdl.add(m[1].toLowerCase());
    return;
  }
  for (const target of verilogTargets(scan, project)) found.verilog.add(target);
}

export function overriddenModules(raw: ProjectAnalysis): OverriddenModules {
  const files = [...raw.byFile.values()];
  const verilog = files.filter((f) => f.language === 'verilog').map((f) => scannedFile(f));
  const macros = new Macros(verilog.flatMap((scan) => scan.defines));
  const modules = verilog.flatMap((scan) => [...scan.everyBranch.matchAll(MODULE)].map((m) => m[0]));
  const found: Found = { verilog: new Set(), vhdl: new Set() };
  try {
    const moduleNames = new Set(modules.map((m) => /\bmodule\s+([A-Za-z_]\w*)/.exec(m)?.[1] ?? ''));
    let all: InstanceIndex | undefined;
    const instances = () => (all ??= instanceIndex(modules, macros));
    const project: Project = { macros, overriding: macros.overriding(), moduleNames, instances };
    for (const file of files) overriddenIn(file, project, found);
  } catch (e) {
    if (e instanceof Unresolved) return ALL_OVERRIDDEN;
    throw e;
  }
  return (name) => found.verilog.has(name) || found.vhdl.has(name.toLowerCase());
}
