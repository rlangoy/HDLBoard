// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { explainMissingInclude, findIncludeCycle, includedNames } from './includeCycles.js';

/** What the bundled Icarus 13.0 prints for an unguarded a.vh → b.vh → a.vh. */
const CYCLE_FAILURE = './a.vh:3: Include file b.vh not found\nPreprocessor failed with 1 errors.';

const header = (name: string, ...includes: string[]) => ({
  name,
  content: includes.map((included) => `\`include "${included}"\n`).join(''),
});

describe('includedNames', () => {
  test('lists the included names in source order', () => {
    assert.deepEqual(includedNames('`include "a.vh"\nmodule m; endmodule\n`include  "b.vh"\n'), ['a.vh', 'b.vh']);
  });

  test('skips an include inside a line comment', () => {
    assert.deepEqual(includedNames('// `include "a.vh"\n'), []);
  });

  test('skips an include inside a block comment', () => {
    assert.deepEqual(includedNames('/* old:\n`include "a.vh"\n*/\n'), []);
  });

  test('names a header written as ./name by its project file name', () => {
    assert.deepEqual(includedNames('`include "./a.vh"\n'), ['a.vh']);
  });

  test('skips an include spelled inside a string literal', () => {
    assert.deepEqual(includedNames('initial $display("`include \\"a.vh\\"");\n'), []);
  });
});

describe('findIncludeCycle', () => {
  const graph = (...files: ReturnType<typeof header>[]) => new Map(files.map((file) => [file.name, includedNames(file.content)]));

  test('finds a header that includes itself', () => {
    assert.deepEqual(findIncludeCycle(graph(header('self.vh', 'self.vh')), 'self.vh'), ['self.vh', 'self.vh']);
  });

  test('finds a loop of three headers, starting from any of them', () => {
    const loop = graph(header('a.vh', 'b.vh'), header('b.vh', 'c.vh'), header('c.vh', 'a.vh'));
    assert.deepEqual(findIncludeCycle(loop, 'b.vh'), ['b.vh', 'c.vh', 'a.vh', 'b.vh']);
  });

  test('returns the shortest loop when there are several', () => {
    const loops = graph(header('a.vh', 'long.vh', 'b.vh'), header('long.vh', 'longer.vh'), header('longer.vh', 'a.vh'), header('b.vh', 'a.vh'));
    assert.deepEqual(findIncludeCycle(loops, 'a.vh'), ['a.vh', 'b.vh', 'a.vh']);
  });

  test('finds nothing in a chain without a loop', () => {
    assert.equal(findIncludeCycle(graph(header('a.vh', 'b.vh'), header('b.vh')), 'a.vh'), undefined);
  });

  test('finds nothing for a loop the start only leads into', () => {
    const tail = graph(header('start.vh', 'a.vh'), header('a.vh', 'b.vh'), header('b.vh', 'a.vh'));
    assert.equal(findIncludeCycle(tail, 'start.vh'), undefined);
  });
});

describe('explainMissingInclude', () => {
  const cycle = [header('top.v', 'a.vh'), header('a.vh', 'b.vh'), header('b.vh', 'a.vh')];

  test('keeps the compiler text first', () => {
    assert.ok(explainMissingInclude(CYCLE_FAILURE, cycle).startsWith(CYCLE_FAILURE));
  });

  test('names the loop through the header Icarus reported', () => {
    assert.match(explainMissingInclude(CYCLE_FAILURE, cycle), /b\.vh exists, but its includes form a loop: b\.vh → a\.vh → b\.vh\./);
  });

  test('recognises the message when the compiler ends its lines with CRLF', () => {
    assert.match(explainMissingInclude(CYCLE_FAILURE.replace('\n', '\r\n'), cycle), /form a loop/);
  });

  test('names the loop when Icarus reports the header as ./name', () => {
    const dotted = [header('a.vh', './b.vh'), header('b.vh', 'a.vh')];
    assert.match(explainMissingInclude('./a.vh:3: Include file ./b.vh not found', dotted), /form a loop: b\.vh → a\.vh → b\.vh\./);
  });

  test('looks past a genuinely missing header to a loop reported after it', () => {
    const both = `top.v:1: Include file nowhere.vh not found\n${CYCLE_FAILURE}`;
    assert.match(explainMissingInclude(both, cycle), /b\.vh exists, but its includes form a loop/);
  });

  test('names a header whose name holds a space', () => {
    const spaced = [header('my defs.vh', 'my defs.vh')];
    assert.match(explainMissingInclude('./my defs.vh:2: Include file my defs.vh not found', spaced), /^my defs\.vh exists/m);
  });

  test('leaves a genuinely missing header as the compiler said it', () => {
    const missing = 'top.v:1: Include file nowhere.vh not found\nPreprocessor failed with 1 errors.';
    assert.equal(explainMissingInclude(missing, [header('top.v', 'nowhere.vh')]), missing);
  });

  test('leaves an existing header that is on no loop as the compiler said it', () => {
    assert.equal(explainMissingInclude(CYCLE_FAILURE, [header('a.vh', 'b.vh'), header('b.vh')]), CYCLE_FAILURE);
  });

  test('leaves any other failure as the compiler said it', () => {
    const syntax = 'top.v:2: syntax error';
    assert.equal(explainMissingInclude(syntax, cycle), syntax);
  });
});
