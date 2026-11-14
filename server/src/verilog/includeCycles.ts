// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * Circular `includes. Icarus expands an unguarded loop of headers until it runs out of
 * open files, then reports the header it was opening as "not found" — although the
 * project holds it. How long that takes depends on the open-file limit: a fraction of a
 * second at Windows' 512, but where the limit is raised, as in many containers, the run
 * can last until the compile timeout.
 *
 * So the loop is found before Icarus runs, by tracing what Icarus would expand: the
 * sources in compile order, macros defined and undefined as they go (Icarus's own and the
 * project's `-D` macros first), and only the includes in active `ifdef branches. `ifdef
 * asks only whether a name is defined, so the trace is exact — include guards, inactive
 * loops and headers no source includes never stop a run. Where it cannot be exact (an
 * `include of a macro or in angle brackets, `undefineall, a conditional on an expression,
 * or a project too large or too deeply nested) it gives up, and Icarus runs as usual.
 * If Icarus then reports a header of the project as missing, a hint says why it likely
 * did, without naming a loop the trace could not establish.
 *
 * Pure: it reads text and touches nothing. The frontend recognises the hint by its
 * wording (src/components/workbench/diagnostics.ts).
 */

import type { VhdlFileInput } from '../protocol.js';

/** What Icarus preprocesses: every project file, the sources in compile order, and the macros defined before them. */
export interface IncludeContext {
  readonly files: readonly VhdlFileInput[];
  readonly sources: readonly string[];
  readonly predefined: readonly string[];
}

/** A loop Icarus would expand: the file reopened, the chain from it back to it, and the include that reopens it. */
export interface IncludeLoop {
  readonly reopened: string;
  readonly chain: readonly string[];
  readonly closingFile: string;
  readonly closingLine: number;
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
 * How deeply nested includes are traced before giving up. A real loop is found within a
 * few levels of its length; tracing much deeper would only risk the call stack.
 */
const MAX_INCLUDE_DEPTH = 1_000;

/** The DIRECTIVE groups these come from can only hold these words. */
type NamedDirective = 'undef' | 'ifdef' | 'ifndef' | 'elsif';
type BareDirective = 'else' | 'endif';

interface IncludeDirective {
  readonly kind: 'include';
  readonly file: string;
  readonly line: number;
}

type Directive =
  | { readonly kind: 'define' | NamedDirective; readonly name: string }
  | { readonly kind: BareDirective }
  | IncludeDirective
  | { readonly kind: 'untraceable' | 'unreadableConditional' };

const projectFileName = (included: string): string => included.replace(SESSION_DIRECTORY_PREFIX, '');

/** The 1-based line of each offset, asked for in increasing order, counted in one pass. */
class LineCounter {
  private line = 1;
  private counted = 0;

  constructor(private readonly text: string) {}

  lineAt(offset: number): number {
    for (; this.counted < offset; this.counted += 1) {
      if (this.text[this.counted] === '\n') this.line += 1;
    }
    return this.line;
  }
}

/** The directive one DIRECTIVE match is, or undefined for a comment or a string. */
function directiveOf(match: RegExpExecArray, lines: LineCounter): Directive | undefined {
  const [, defined, conditional, name, bare, included, untraceable, unreadable] = match;
  if (defined !== undefined) return { kind: 'define', name: defined };
  if (name !== undefined) return { kind: conditional as NamedDirective, name };
  if (bare !== undefined) return { kind: bare as BareDirective };
  if (included !== undefined) return { kind: 'include', file: projectFileName(included), line: lines.lineAt(match.index) };
  if (untraceable !== undefined) return { kind: 'untraceable' };
  if (unreadable !== undefined) return { kind: 'unreadableConditional' };
  return undefined;
}

/** The preprocessor directives HDLBoard follows, in source order, outside comments and strings. */
export function directivesOf(source: string): Directive[] {
  const lines = new LineCounter(source);
  return [...source.matchAll(DIRECTIVE)].map((match) => directiveOf(match, lines)).filter((directive) => directive !== undefined);
}

/** Raised inside a trace that can no longer follow Icarus exactly; the trace then names no loop. */
class TraceAbandoned extends Error {}

interface Branch {
  readonly enclosingActive: boolean;
  active: boolean;
  taken: boolean;
}

/** The `ifdef … `elsif … `else … `endif blocks open so far, and whether the text is active. */
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
 *
 * A file outside the project is passed by: the session directory holds only the
 * project's files, so Icarus cannot open it either, and it defines nothing.
 */
class IncludeExpansion {
  private readonly sources = new Map<string, string>();
  private readonly directives = new Map<string, readonly Directive[]>();
  private readonly defined: Set<string>;
  /** Outermost first. */
  private readonly expanding: Opened[] = [];
  private expansionsLeft = MAX_EXPANSIONS;
  /** One for the whole trace: Icarus lets a header open a block its includer closes. */
  private readonly conditionals = new Conditionals();

  constructor({ files, predefined }: IncludeContext) {
    for (const file of files) this.sources.set(file.name, file.content);
    this.defined = new Set(predefined);
  }

  /** The first loop the sources expand; undefined when there is none, or when the trace gave up before it could tell. */
  loopIn(sources: readonly string[]): IncludeLoop | undefined {
    try {
      return this.firstLoopIn(sources);
    } catch (error) {
      if (error instanceof TraceAbandoned) return undefined;
      throw error;
    }
  }

  private firstLoopIn(sources: readonly string[]): IncludeLoop | undefined {
    for (const source of sources) {
      const directives = this.directivesIn(source);
      const loop = directives === undefined ? undefined : this.expand(this.opening(source), directives);
      if (loop !== undefined) return loop;
    }
    return undefined;
  }

  private include(includer: string, { file, line }: IncludeDirective): IncludeLoop | undefined {
    const directives = this.directivesIn(file);
    if (directives === undefined) return undefined;
    const opened = this.opening(file);
    const reopened = this.expanding.findIndex((outer) => outer.file === file && outer.macros === opened.macros);
    if (reopened < 0) return this.expand(opened, directives);
    const chain = [...this.expanding.slice(reopened).map((outer) => outer.file), file];
    return { reopened: file, chain, closingFile: includer, closingLine: line };
  }

  private opening(file: string): Opened {
    return { file, macros: [...this.defined].sort().join(' ') };
  }

  private expand(opened: Opened, directives: readonly Directive[]): IncludeLoop | undefined {
    this.spendExpansion();
    this.expanding.push(opened);
    const loop = this.follow(opened.file, directives);
    this.expanding.pop();
    return loop;
  }

  /** Gives up once the trace has expanded too many files, or nested them too deeply. */
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

  private follow(file: string, directives: readonly Directive[]): IncludeLoop | undefined {
    const isDefined = (name: string): boolean => this.defined.has(name);
    for (const directive of directives) {
      if (this.conditionals.track(directive, isDefined) || !this.conditionals.active) continue;
      const loop = this.apply(file, directive);
      if (loop !== undefined) return loop;
    }
    return undefined;
  }

  private apply(file: string, directive: Directive): IncludeLoop | undefined {
    switch (directive.kind) {
      case 'define':
        this.defined.add(directive.name);
        return undefined;
      case 'undef':
        this.defined.delete(directive.name);
        return undefined;
      case 'include':
        return this.include(file, directive);
      case 'untraceable':
        throw new TraceAbandoned();
      default:
        return undefined;
    }
  }
}

/** The include loop Icarus would expand for these sources, or undefined when it expands none or the trace gave up. */
export function findIncludeLoop(context: IncludeContext): IncludeLoop | undefined {
  return new IncludeExpansion(context).loopIn(context.sources);
}

const GUARD_ADVICE = 'Guard each header with `ifndef NAME / `define NAME … `endif, or remove one of the includes.';

/** The loop as an error at the include that closes it, in Icarus's own `file:line: error:` form. */
export function describeIncludeLoop({ reopened, chain, closingFile, closingLine }: IncludeLoop): string {
  return (
    `${closingFile}:${closingLine}: error: Including ${reopened} here closes a loop: ${chain.join(' → ')}. ` +
    `Icarus would open the headers again and again until it ran out of files. ${GUARD_ADVICE}`
  );
}

/** The first header Icarus reported as not found that the project holds. */
function existingHeaderReported(compilerText: string, files: readonly VhdlFileInput[]): string | undefined {
  const names = new Set(files.map((file) => file.name));
  return [...compilerText.matchAll(MISSING_INCLUDE)]
    .map(([, reported = '']) => projectFileName(reported))
    .find((header) => names.has(header));
}

function missingHeaderHint(header: string): string {
  return (
    `${header} exists, but Icarus could not open it. That most likely means the includes form a loop ` +
    `and Icarus ran out of files. ${GUARD_ADVICE}`
  );
}

/**
 * The compiler's text, followed by a hint when Icarus reports a header of the project as
 * missing; otherwise the text unchanged.
 */
export function explainMissingInclude(compilerText: string, files: readonly VhdlFileInput[]): string {
  const header = existingHeaderReported(compilerText, files);
  return header === undefined ? compilerText : `${compilerText}\n\n${missingHeaderHint(header)}`;
}
