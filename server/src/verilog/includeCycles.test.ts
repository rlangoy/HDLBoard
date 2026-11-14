// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import type { VhdlFileInput } from '../protocol.js';
import { describeIncludeLoop, directivesOf, explainMissingInclude, findIncludeLoop, type IncludeContext } from './includeCycles.js';

/** What the bundled Icarus 13.0 prints for an unguarded a.vh → b.vh → a.vh. */
const CYCLE_FAILURE = './a.vh:3: Include file b.vh not found\nPreprocessor failed with 1 errors.';

const file = (name: string, content: string): VhdlFileInput => ({ name, content });
const header = (name: string, ...includes: string[]) => file(name, includes.map((included) => `\`include "${included}"\n`).join(''));
const top = (...includes: string[]) => header('top.v', ...includes);

/** The files compiled with `top.v` as the only source, and the macros given on the command line. */
const compiling = (files: VhdlFileInput[], predefined: string[] = []): IncludeContext => ({ files, sources: ['top.v'], predefined });

const loopIn = (files: VhdlFileInput[], predefined?: string[]) => findIncludeLoop(compiling(files, predefined))?.chain;

describe('directivesOf', () => {
  test('lists the directives in source order', () => {
    const source = '`ifdef A\n`include "a.vh"\n`else\n`define B 1\n`endif\n`undef B\n';
    assert.deepEqual(directivesOf(source).map((directive) => directive.kind), ['ifdef', 'include', 'else', 'define', 'endif', 'undef']);
  });

  test('names a header written as ./name by its project file name', () => {
    assert.deepEqual(directivesOf('`include "./a.vh"\n'), [{ kind: 'include', file: 'a.vh', line: 1 }]);
  });

  test('skips directives inside comments', () => {
    assert.deepEqual(directivesOf('// `include "a.vh"\n/* `define X\n`include "b.vh" */\n'), []);
  });

  test('skips an include spelled inside a string literal', () => {
    assert.deepEqual(directivesOf('initial $display("`include \\"a.vh\\"");\n'), []);
  });

  test('takes an include inside a macro body for part of the macro, which it cannot trace', () => {
    assert.deepEqual(directivesOf('`define LOAD \\\n  `include "a.vh"\n'), [{ kind: 'untraceable' }]);
  });

  test('reads a directive word in a macro body\'s comment as no directive', () => {
    assert.deepEqual(directivesOf('`define W 8 // see `include below\n'), [{ kind: 'define', name: 'W' }]);
  });

  test('reads a directive word in a macro body\'s string as no directive', () => {
    assert.deepEqual(directivesOf('`define MSG $display("`ifdef X");\n'), [{ kind: 'define', name: 'MSG' }]);
  });

  test('reads thousands of `defines nested on one line without overflowing the stack', () => {
    assert.deepEqual(directivesOf(`${'`define X '.repeat(6_000)}\n`), [{ kind: 'untraceable' }]);
  });

  test('reads a macro whose body holds no directive as a plain definition', () => {
    assert.deepEqual(directivesOf('`define WIDTH `SIZE + 1\n'), [{ kind: 'define', name: 'WIDTH' }]);
  });
});

describe('findIncludeLoop', () => {
  test('finds a header that includes itself', () => {
    assert.deepEqual(loopIn([top('self.vh'), header('self.vh', 'self.vh')]), ['self.vh', 'self.vh']);
  });

  test('finds a loop of three headers', () => {
    const files = [top('a.vh'), header('a.vh', 'b.vh'), header('b.vh', 'c.vh'), header('c.vh', 'a.vh')];
    assert.deepEqual(loopIn(files), ['a.vh', 'b.vh', 'c.vh', 'a.vh']);
  });

  test('finds nothing in a header included twice without a loop', () => {
    assert.equal(loopIn([top('a.vh', 'a.vh'), header('a.vh')]), undefined);
  });

  test('finds nothing in a loop behind include guards', () => {
    const guarded = (name: string, included: string) => file(name, `\`ifndef ${name[0]}_VH\n\`define ${name[0]}_VH\n\`include "${included}"\n\`endif\n`);
    assert.equal(loopIn([top('a.vh'), guarded('a.vh', 'b.vh'), guarded('b.vh', 'a.vh')]), undefined);
  });

  test('finds nothing in a loop inside an inactive `ifdef', () => {
    assert.equal(loopIn([top('a.vh'), file('a.vh', '`ifdef NEVER\n`include "a.vh"\n`endif\n')]), undefined);
  });

  test('follows a loop inside an `ifdef whose macro the command line defines', () => {
    assert.deepEqual(loopIn([top('a.vh'), file('a.vh', '`ifdef DEBUG\n`include "a.vh"\n`endif\n')], ['DEBUG']), ['a.vh', 'a.vh']);
  });

  test('names the active loop, not a shorter one in an inactive branch', () => {
    const withInactiveSelfInclude = (name: string, other: string) =>
      file(name, `\`ifdef NEVER\n\`include "${name}"\n\`endif\n\`include "${other}"\n`);
    const files = [top('a.vh'), withInactiveSelfInclude('a.vh', 'b.vh'), withInactiveSelfInclude('b.vh', 'a.vh')];
    assert.deepEqual(loopIn(files), ['a.vh', 'b.vh', 'a.vh']);
  });

  test('follows the `elsif branch that is taken', () => {
    const a = file('a.vh', '`ifdef NEVER\n`include "x.vh"\n`elsif ON\n`include "a.vh"\n`else\n`include "y.vh"\n`endif\n');
    assert.deepEqual(loopIn([top('a.vh'), a, header('x.vh', 'x.vh'), header('y.vh', 'y.vh')], ['ON']), ['a.vh', 'a.vh']);
  });

  test('skips `else once an earlier branch was taken', () => {
    const a = file('a.vh', '`ifdef ON\n`define DONE\n`else\n`include "a.vh"\n`endif\n');
    assert.equal(loopIn([top('a.vh'), a], ['ON']), undefined);
  });

  test('keeps a branch nested in an inactive one inactive', () => {
    const a = file('a.vh', '`ifdef NEVER\n`ifndef ALSO_NEVER\n`include "a.vh"\n`endif\n`endif\n');
    assert.equal(loopIn([top('a.vh'), a]), undefined);
  });

  test('carries a macro defined in one source into the next', () => {
    const files = [file('first.v', '`define GUARDED\n'), file('second.v', '`include "a.vh"\n'), file('a.vh', '`ifndef GUARDED\n`include "a.vh"\n`endif\n')];
    assert.equal(findIncludeLoop({ files, sources: ['first.v', 'second.v'], predefined: [] }), undefined);
  });

  test('follows the branch a macro Icarus defines itself selects', () => {
    const a = file('a.vh', '`ifdef __ICARUS__\n`include "b.vh"\n`else\n`include "a.vh"\n`endif\n');
    assert.deepEqual(loopIn([top('a.vh'), a, header('b.vh', 'a.vh')], ['__ICARUS__']), ['a.vh', 'b.vh', 'a.vh']);
  });

  test('lets a header open a block that the file including it closes, as Icarus does', () => {
    const opensBlock = file('opens.vh', '`ifdef NEVER\n');
    const closesIt = file('top.v', '`include "opens.vh"\n`include "self.vh"\n`endif\n');
    assert.equal(loopIn([closesIt, opensBlock, header('self.vh', 'self.vh')]), undefined);
  });

  test('follows a loop again once `undef removes its guard', () => {
    const a = file('a.vh', '`undef GUARD\n`ifndef GUARD\n`define GUARD\n`include "a.vh"\n`endif\n');
    assert.deepEqual(loopIn([top('a.vh'), a], ['GUARD']), ['a.vh', 'a.vh']);
  });
});

describe('findIncludeLoop — abandoning a trace it cannot follow exactly', () => {
  /** `top.v` → h0.vh → h1.vh → … → the last, which includes itself. */
  const chainEndingInLoop = (length: number) => {
    const headers = Array.from({ length }, (_, index) => header(`h${index}.vh`, `h${Math.min(index + 1, length - 1)}.vh`));
    return [top('h0.vh'), ...headers];
  };

  test('names a loop at the end of a moderately deep chain', () => {
    assert.deepEqual(loopIn(chainEndingInLoop(100))?.slice(-2), ['h99.vh', 'h99.vh']);
  });

  test('gives up, rather than overflowing the stack, on a chain thousands of headers deep', () => {
    assert.equal(loopIn(chainEndingInLoop(4_000)), undefined);
  });

  test('gives up once it has expanded more files than any project needs', () => {
    const manyIncludes = `${'`include "empty.vh"\n'.repeat(10_001)}\`include "self.vh"\n`;
    assert.equal(loopIn([file('top.v', manyIncludes), header('empty.vh'), header('self.vh', 'self.vh')]), undefined);
  });

  test('gives up at an active include of a macro, whose file it cannot know', () => {
    assert.equal(loopIn([file('top.v', '`include `HEADER\n`include "a.vh"\n'), header('a.vh', 'a.vh')]), undefined);
  });

  test('gives up at an active include in angle brackets', () => {
    assert.equal(loopIn([file('top.v', '`include <defs.vh>\n`include "a.vh"\n'), header('a.vh', 'a.vh')]), undefined);
  });

  test('gives up at a macro that expands to a `define, which may guard what follows', () => {
    const top = file('top.v', '`define SET `define GUARD\n`include "g.vh"\n');
    const guardedBySet = file('g.vh', '`ifndef GUARD\n`SET\n`include "g.vh"\n`endif\n');
    assert.equal(loopIn([top, guardedBySet]), undefined);
  });

  test('gives up at an include of a file the project lacks, where Icarus stops first', () => {
    assert.equal(loopIn([top('missing.vh', 'a.vh'), header('a.vh', 'a.vh')]), undefined);
  });

  test('gives up at an active `undefineall', () => {
    assert.equal(loopIn([file('top.v', '`undefineall\n`include "a.vh"\n'), header('a.vh', 'a.vh')]), undefined);
  });

  test('gives up at an `ifdef of an expression, whose `endif it could not pair', () => {
    const top = file('top.v', '`ifdef OUTER\n`ifdef (A && B)\n`endif\n`include "a.vh"\n`endif\n');
    assert.equal(loopIn([top, header('a.vh', 'a.vh')]), undefined);
  });

  test('reads a macro name that holds a $', () => {
    assert.deepEqual(directivesOf('`ifdef A$B\n'), [{ kind: 'ifdef', name: 'A$B' }]);
  });

  test('passes an untraceable include in an inactive branch', () => {
    const a = file('top.v', '`ifdef NEVER\n`include `HEADER\n`endif\n`include "a.vh"\n');
    assert.deepEqual(loopIn([a, header('a.vh', 'a.vh')]), ['a.vh', 'a.vh']);
  });
});

describe('findIncludeLoop — where the loop closes', () => {
  const twoHeaders = compiling([top('a.vh'), file('a.vh', '// a\n`include "b.vh"\n'), file('b.vh', '// b\n\n`include "a.vh"\n')]);

  test('names the file whose include reopens the loop', () => {
    assert.equal(findIncludeLoop(twoHeaders)?.closingFile, 'b.vh');
  });

  test('names the line of that include', () => {
    assert.equal(findIncludeLoop(twoHeaders)?.closingLine, 3);
  });

  test('counts lines inside a block comment before the include', () => {
    const commented = compiling([top('a.vh'), file('a.vh', '/* one\ntwo */\n`include "a.vh"\n')]);
    assert.equal(findIncludeLoop(commented)?.closingLine, 3);
  });
});

describe('describeIncludeLoop', () => {
  const loop = { reopened: 'a.vh', chain: ['a.vh', 'b.vh', 'a.vh'], closingFile: 'b.vh', closingLine: 3 };

  test('reads as an Icarus error at the closing include, so the editor marks that line', () => {
    assert.match(describeIncludeLoop(loop), /^b\.vh:3: error: /);
  });

  test('names the reopened header and the whole chain', () => {
    assert.match(describeIncludeLoop(loop), /Including a\.vh here closes a loop: a\.vh → b\.vh → a\.vh\./);
  });
});

describe('explainMissingInclude', () => {
  const headers = [top('a.vh'), header('a.vh', 'b.vh'), header('b.vh', 'a.vh')];

  test('keeps the compiler text first', () => {
    assert.ok(explainMissingInclude(CYCLE_FAILURE, headers).startsWith(CYCLE_FAILURE));
  });

  test('says an existing header could not be opened, and why that most likely is', () => {
    assert.match(explainMissingInclude(CYCLE_FAILURE, headers), /^b\.vh exists, but Icarus could not open it\. That most likely means/m);
  });

  test('recognises the message when the compiler ends its lines with CRLF', () => {
    assert.match(explainMissingInclude(CYCLE_FAILURE.replace('\n', '\r\n'), headers), /^b\.vh exists/m);
  });

  test('recognises the header when Icarus reports it as ./name', () => {
    assert.match(explainMissingInclude('./a.vh:3: Include file ./b.vh not found', headers), /^b\.vh exists/m);
  });

  test('looks past a genuinely missing header to an existing one reported after it', () => {
    const both = `top.v:1: Include file nowhere.vh not found\n${CYCLE_FAILURE}`;
    assert.match(explainMissingInclude(both, headers), /^b\.vh exists/m);
  });

  test('names a header whose name holds a space', () => {
    const spaced = [header('my defs.vh', 'my defs.vh')];
    assert.match(explainMissingInclude('./my defs.vh:2: Include file my defs.vh not found', spaced), /^my defs\.vh exists/m);
  });

  test('leaves a genuinely missing header as the compiler said it', () => {
    const missing = 'top.v:1: Include file nowhere.vh not found\nPreprocessor failed with 1 errors.';
    assert.equal(explainMissingInclude(missing, [top('nowhere.vh')]), missing);
  });

  test('leaves any other failure as the compiler said it', () => {
    const syntax = 'top.v:2: syntax error';
    assert.equal(explainMissingInclude(syntax, headers), syntax);
  });
});
