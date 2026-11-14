// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * Explaining a circular `include. Icarus expands an unguarded loop of headers until it
 * runs out of open files, then reports the header it was opening as "not found" —
 * although the student's project holds it. When Icarus names a header that exists, the
 * loop is traced and added to the compiler's message, which is kept as it was.
 *
 * The loop is the one Icarus expands, not merely one in the text: the sources are read in
 * compile order, macros are defined and undefined as they go (the project's `-D` macros
 * and Icarus's own first), and only the includes in active `ifdef branches are followed.
 * `ifdef asks only whether a name is defined, so this is exact — include guards and
 * inactive loops are never named. Where it cannot be exact (an `include of a macro or in
 * angle brackets, `undefineall, or a project too large or too deeply nested to trace) the
 * trace is abandoned: nothing is added, and the compiler's message stands alone.
 * Pure: it reads text and touches nothing.
 *
 * The frontend recognises the note by its wording (src/components/workbench/diagnostics.ts).
 */

import type { VhdlFileInput } from '../protocol.js';

/** What Icarus preprocessed: every project file, the sources in compile order, and the macros defined before them. */
export interface IncludeContext {
  readonly files: readonly VhdlFileInput[];
  readonly sources: readonly string[];
  readonly predefined: readonly string[];
}

/** `./cycle_a.vh:3: Include file cycle_b.vh not found` — the header is the captured group. */
const MISSING_INCLUDE = /^.+?:\d+: Include file (.+) not found\r?$/gm;

/**
 * Comments and strings are skipped. A `define's body runs to the end of its line,
 * continuations included, so an `include inside a macro body is not taken for one.
 * Captured last: an untraceable `include of anything but a quoted name, `undefineall or
 * `undef of no plain name; then a conditional whose argument is not a plain name
 * (`ifdef (A && B)), which cannot be skipped even when inactive — its `endif would close
 * the wrong block.
 */
const DIRECTIVE =
  /\/\/[^\n]*|\/\*[\s\S]*?(?:\*\/|$)|"(?:[^"\\\n]|\\.)*"|`define\s+([\w$]+)(?:\\\r?\n|\\.|[^\\\n])*|`(ifdef|ifndef|elsif|undef)\s+([\w$]+)|`(else|endif)\b|`include\s+"([^"\n]+)"|(`(?:include|undefineall|undef)\b)|(`(?:ifdef|ifndef|elsif)\b)/g;

/** Project files have plain names, so `./name` and `name` are the same file. */
const SESSION_DIRECTORY_PREFIX = /^(?:\.\/)+/;

/** How many file expansions are traced before giving up: far above any real project, low enough to stay instant. */
const MAX_EXPANSIONS = 10_000;

/**
 * How deeply nested includes are traced before giving up. Icarus runs out of open files
 * near 500 levels; tracing much deeper would only risk the call stack, three frames a level.
 */
const MAX_INCLUDE_DEPTH = 1_000;

/** The DIRECTIVE groups these come from can only hold these words. */
type NamedDirective = 'undef' | 'ifdef' | 'ifndef' | 'elsif';
type BareDirective = 'else' | 'endif';

type Directive =
  | { readonly kind: 'define' | NamedDirective; readonly name: string }
  | { readonly kind: BareDirective }
  | { readonly kind: 'include'; readonly file: string }
  | { readonly kind: 'untraceable' | 'unreadableConditional' };

const projectFileName = (included: string): string => included.replace(SESSION_DIRECTORY_PREFIX, '');

/** The directive one DIRECTIVE match is, or undefined for a comment or a string. */
function directiveOf([, defined, conditional, name, bare, included, untraceable, unreadable]: RegExpExecArray): Directive | undefined {
  if (defined !== undefined) return { kind: 'define', name: defined };
  if (name !== undefined) return { kind: conditional as NamedDirective, name };
  if (bare !== undefined) return { kind: bare as BareDirective };
  if (included !== undefined) return { kind: 'include', file: projectFileName(included) };
  if (untraceable !== undefined) return { kind: 'untraceable' };
  if (unreadable !== undefined) return { kind: 'unreadableConditional' };
  return undefined;
}

/** The preprocessor directives HDLBoard follows, in source order, outside comments and strings. */
export function directivesOf(source: string): Directive[] {
  return [...source.matchAll(DIRECTIVE)].map(directiveOf).filter((directive) => directive !== undefined);
}

/** Raised inside a trace that can no longer follow Icarus exactly; the trace then names no loop. */
class TraceAbandoned extends Error {}

interface Branch {
  readonly enclosingActive: boolean;
  active: boolean;
  taken: boolean;
}

/** The `ifdef … `elsif … `else … `endif blocks open in one file, and whether its text is active. */
class Conditionals {
  private readonly open: Branch[] = [];

  get active(): boolean {
    return this.open.at(-1)?.active ?? true;
  }

  /** Applies a conditional directive and returns true; any other directive is left to the caller. */
  track(directive: Directive, isDefined: (name: string) => boolean): boolean {
    switch (directive.kind) {
      case 'ifdef':
        this.begin(isDefined(directive.name));
        return true;
      case 'ifndef':
        this.begin(!isDefined(directive.name));
        return true;
      case 'elsif':
        this.alternative(isDefined(directive.name));
        return true;
      case 'else':
        this.alternative(true);
        return true;
      case 'endif':
        this.open.pop();
        return true;
      case 'unreadableConditional':
        throw new TraceAbandoned();
      default:
        return false;
    }
  }

  private begin(condition: boolean): void {
    const enclosingActive = this.active;
    this.open.push({ enclosingActive, active: enclosingActive && condition, taken: condition });
  }

  /** `elsif` with its condition, `else` with `true`: active only if no earlier branch was. */
  private alternative(condition: boolean): void {
    const branch = this.open.at(-1);
    if (branch === undefined) return;
    branch.active = branch.enclosingActive && !branch.taken && condition;
    branch.taken ||= condition;
  }
}

/** A file being expanded, and the macros that were defined when it was opened. */
interface Opened {
  readonly file: string;
  readonly macros: string;
}

/**
 * Expands the sources as Icarus does, as far as includes go. Opening a file again is not
 * yet a loop — its include guard may make it empty. It is one when the file is opened
 * with the same macros defined as when it was opened further out: what a file expands to
 * depends on nothing else, so from there the expansion repeats forever.
 */
class IncludeExpansion {
  private readonly sources = new Map<string, string>();
  private readonly directives = new Map<string, readonly Directive[]>();
  private readonly defined: Set<string>;
  /** Outermost first. */
  private readonly expanding: Opened[] = [];
  private expansionsLeft = MAX_EXPANSIONS;

  constructor({ files, predefined }: IncludeContext) {
    for (const file of files) this.sources.set(file.name, file.content);
    this.defined = new Set(predefined);
  }

  /**
   * The loop as a chain that starts and ends with the same file; undefined when there is
   * none, or when the trace was abandoned before it could tell.
   */
  loopIn(sources: readonly string[]): string[] | undefined {
    try {
      return this.firstLoopIn(sources);
    } catch (error) {
      if (error instanceof TraceAbandoned) return undefined;
      throw error;
    }
  }

  private firstLoopIn(sources: readonly string[]): string[] | undefined {
    for (const source of sources) {
      const loop = this.expand(source);
      if (loop !== undefined) return loop;
    }
    return undefined;
  }

  /**
   * A file outside the project is passed by: the session directory holds only the
   * project's files, so Icarus cannot open it either, and it defines nothing.
   */
  private expand(file: string): string[] | undefined {
    const directives = this.directivesIn(file);
    if (directives === undefined) return undefined;
    const opened: Opened = { file, macros: [...this.defined].sort().join(' ') };
    const repeated = this.expanding.findIndex(({ file: outer, macros }) => outer === file && macros === opened.macros);
    if (repeated >= 0) return [...this.expanding.slice(repeated).map((outer) => outer.file), file];
    this.spendExpansion();
    this.expanding.push(opened);
    const loop = this.follow(directives);
    this.expanding.pop();
    return loop;
  }

  /** Abandons the trace once it has expanded too many files, or nested them too deeply. */
  private spendExpansion(): void {
    this.expansionsLeft -= 1;
    if (this.expansionsLeft < 0 || this.expanding.length >= MAX_INCLUDE_DEPTH) throw new TraceAbandoned();
  }

  private directivesIn(file: string): readonly Directive[] | undefined {
    const source = this.sources.get(file);
    if (source === undefined) return undefined;
    const known = this.directives.get(file) ?? directivesOf(source);
    this.directives.set(file, known);
    return known;
  }

  private follow(directives: readonly Directive[]): string[] | undefined {
    const conditionals = new Conditionals();
    const isDefined = (name: string): boolean => this.defined.has(name);
    for (const directive of directives) {
      if (conditionals.track(directive, isDefined) || !conditionals.active) continue;
      const loop = this.apply(directive);
      if (loop !== undefined) return loop;
    }
    return undefined;
  }

  private apply(directive: Directive): string[] | undefined {
    switch (directive.kind) {
      case 'define':
        this.defined.add(directive.name);
        return undefined;
      case 'undef':
        this.defined.delete(directive.name);
        return undefined;
      case 'include':
        return this.expand(directive.file);
      case 'untraceable':
        throw new TraceAbandoned();
      default:
        return undefined;
    }
  }
}

/** The include loop Icarus expands for these sources, or undefined when it expands none. */
export function findActiveIncludeLoop(context: IncludeContext): string[] | undefined {
  return new IncludeExpansion(context).loopIn(context.sources);
}

/** The same loop told from `header`, when it is on it: `[b, a, b]` told from `a` is `[a, b, a]`. */
function startingAt(header: string, loop: readonly string[]): readonly string[] {
  const files = loop.slice(0, -1);
  const at = files.indexOf(header);
  if (at < 0) return loop;
  const rotated = [...files.slice(at), ...files.slice(0, at)];
  return [...rotated, header];
}

function cycleNote(header: string, loop: readonly string[]): string {
  return (
    `${header} exists, but its includes form a loop: ${startingAt(header, loop).join(' → ')}. ` +
    'Icarus opens the headers again on every pass until it runs out of files, then reports one as not found. ' +
    'Guard each header with `ifndef NAME / `define NAME … `endif, or remove one of the includes.'
  );
}

/** The first header Icarus reported as not found that the project holds. */
function existingHeaderReported(compilerText: string, files: readonly VhdlFileInput[]): string | undefined {
  const names = new Set(files.map((file) => file.name));
  return [...compilerText.matchAll(MISSING_INCLUDE)]
    .map(([, reported = '']) => projectFileName(reported))
    .find((header) => names.has(header));
}

/**
 * The compiler's text, followed by the include loop when Icarus reports a header of the
 * project as missing and the sources it compiled loop; otherwise the text unchanged.
 */
export function explainMissingInclude(compilerText: string, context: IncludeContext): string {
  const header = existingHeaderReported(compilerText, context.files);
  if (header === undefined) return compilerText;
  const loop = findActiveIncludeLoop(context);
  return loop === undefined ? compilerText : `${compilerText}\n\n${cycleNote(header, loop)}`;
}
