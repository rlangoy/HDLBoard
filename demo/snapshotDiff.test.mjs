// SPDX-License-Identifier: GPL-2.0-only
// Usage: node --test demo/snapshotDiff.test.mjs
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { differences, drawnLines, failureCount } from './snapshotDiff.mjs';

const line = (index, text) => `${index} ${text}`;

test('drawnLines drops the element index', () => {
  assert.deepEqual(drawnLines([line(0, 'DIV .a red')]), ['DIV .a red']);
});

test('drawnLines drops <head> elements', () => {
  assert.deepEqual(drawnLines([line(0, 'STYLE . x'), line(1, 'DIV .a red')]), ['DIV .a red']);
});

test('identical captures have no differences', () => {
  const capture = [line(0, 'DIV .a red'), line(1, 'P .b blue')];
  assert.deepEqual(differences(capture, capture), { removed: [], added: [] });
});

test('an added element does not shift the elements after it', () => {
  const before = [line(0, 'DIV .a red'), line(1, 'P .b blue')];
  const after = [line(0, 'DIV .a red'), line(1, 'SPAN .new green'), line(2, 'P .b blue')];
  assert.deepEqual(differences(before, after), { removed: [], added: ['SPAN .new green'] });
});

test('a changed colour shows as removed and added', () => {
  const before = [line(0, 'DIV .a red')];
  const after = [line(0, 'DIV .a blue')];
  assert.deepEqual(differences(before, after), { removed: ['DIV .a red'], added: ['DIV .a blue'] });
});

test('a removed element shows as removed', () => {
  const before = [line(0, 'DIV .a red'), line(1, 'P .b blue')];
  assert.deepEqual(differences(before, [line(0, 'DIV .a red')]), { removed: ['P .b blue'], added: [] });
});

test('failureCount counts added elements by default', () => {
  assert.equal(failureCount({ removed: ['x'], added: ['y', 'z'] }, false), 3);
});

test('failureCount ignores added elements when they are allowed', () => {
  assert.equal(failureCount({ removed: ['x'], added: ['y', 'z'] }, true), 1);
});
