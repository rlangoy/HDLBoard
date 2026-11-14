// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import type { VhdlFileInput } from '../protocol.js';
import { directivesOf, explainMissingInclude, findActiveIncludeLoop, type IncludeContext } from './includeCycles.js';

/** What the bundled Icarus 13.0 prints for an unguarded a.vh → b.vh → a.vh. */
const CYCLE_FAILURE = './a.vh:3: Include file b.vh not found\nPreprocessor failed with 1 errors.';

const file = (name: string, content: string): VhdlFileInput => ({ name, content });
const header = (name: string, ...includes: string[]) => file(name, includes.map((included) => `\`include "${included}"\n`).join(''));
const top = (...includes: string[]) => header('top.v', ...includes);

/** The files compiled with `top.v` as the only source, and the macros given on the command line. */
const compiling = (files: VhdlFileInput[], predefined: string[] = []): IncludeContext => ({ files, sources: ['top.v'], predefined });

const loopIn = (files: VhdlFileInput[], predefined?: string[]) => findActiveIncludeLoop(compiling(files, predefined));

describe('directivesOf', () => {
  test('lists the directives in source order', () => {
    const source = '`ifdef A\n`include "a.vh"\n`else\n`define B 1\n`endif\n`undef B\n';
    assert.deepEqual(directivesOf(source).map((directive) => directive.kind), ['ifdef', 'include', 'else', 'define', 'endif', 'undef']);
  });

  test('names a header written as ./name by its project file name', () => {
    assert.deepEqual(directivesOf('`include "./a.vh"\n'), [{ kind: 'include', file: 'a.vh' }]);
  });

  test('skips directives inside comments', () => {
    assert.deepEqual(directivesOf('// `include "a.vh"\n/* `define X\n`include "b.vh" */\n'), []);
  });

  test('skips an include spelled inside a string literal', () => {
    assert.deepEqual(directivesOf('initial $display("`include \\"a.vh\\"");\n'), []);
  });

  test('takes an include inside a macro body for part of the macro', () => {
    assert.deepEqual(directivesOf('`define LOAD \\\n  `include "a.vh"\n'), [{ kind: 'define', name: 'LOAD' }]);
  });
});

describe('findActiveIncludeLoop', () => {
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
    assert.equal(findActiveIncludeLoop({ files, sources: ['first.v', 'second.v'], predefined: [] }), undefined);
  });

  test('follows a loop again once `undef removes its guard', () => {
    const a = file('a.vh', '`undef GUARD\n`ifndef GUARD\n`define GUARD\n`include "a.vh"\n`endif\n');
    assert.deepEqual(loopIn([top('a.vh'), a], ['GUARD']), ['a.vh', 'a.vh']);
  });
});

describe('explainMissingInclude', () => {
  const cycle = compiling([top('a.vh'), header('a.vh', 'b.vh'), header('b.vh', 'a.vh')]);

  test('keeps the compiler text first', () => {
    assert.ok(explainMissingInclude(CYCLE_FAILURE, cycle).startsWith(CYCLE_FAILURE));
  });

  test('tells the loop from the header Icarus reported', () => {
    assert.match(explainMissingInclude(CYCLE_FAILURE, cycle), /b\.vh exists, but its includes form a loop: b\.vh → a\.vh → b\.vh\./);
  });

  test('recognises the message when the compiler ends its lines with CRLF', () => {
    assert.match(explainMissingInclude(CYCLE_FAILURE.replace('\n', '\r\n'), cycle), /form a loop/);
  });

  test('recognises the header when Icarus reports it as ./name', () => {
    assert.match(explainMissingInclude('./a.vh:3: Include file ./b.vh not found', cycle), /^b\.vh exists/m);
  });

  test('looks past a genuinely missing header to an existing one reported after it', () => {
    const both = `top.v:1: Include file nowhere.vh not found\n${CYCLE_FAILURE}`;
    assert.match(explainMissingInclude(both, cycle), /^b\.vh exists/m);
  });

  test('names a header whose name holds a space', () => {
    const spaced = compiling([top('my defs.vh'), header('my defs.vh', 'my defs.vh')]);
    assert.match(explainMissingInclude('./my defs.vh:2: Include file my defs.vh not found', spaced), /^my defs\.vh exists/m);
  });

  test('leaves a genuinely missing header as the compiler said it', () => {
    const missing = 'top.v:1: Include file nowhere.vh not found\nPreprocessor failed with 1 errors.';
    assert.equal(explainMissingInclude(missing, compiling([top('nowhere.vh')])), missing);
  });

  test('leaves an existing header as the compiler said it when nothing loops', () => {
    assert.equal(explainMissingInclude(CYCLE_FAILURE, compiling([top('a.vh'), header('a.vh', 'b.vh'), header('b.vh')])), CYCLE_FAILURE);
  });

  test('leaves any other failure as the compiler said it', () => {
    const syntax = 'top.v:2: syntax error';
    assert.equal(explainMissingInclude(syntax, cycle), syntax);
  });
});
