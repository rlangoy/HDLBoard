// SPDX-License-Identifier: GPL-2.0-only
// Usage: node --test tools/themeLiteralRules.test.mjs
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { isScannedFile, literalLines } from './themeLiteralRules.mjs';

const css = (text) => literalLines('src/x.css', text);
const tsx = (text) => literalLines('src/x.tsx', text);

test('a hex colour in CSS is a literal', () => {
  assert.deepEqual(css('a { color: #fff; }'), [1]);
});

test('rgba() in CSS is a literal', () => {
  assert.deepEqual(css('a { color: rgba(0, 0, 0, 0.5); }'), [1]);
});

test('rgba(var(…)) in CSS is not a literal', () => {
  assert.deepEqual(css('a { box-shadow: 0 0 4px rgba(var(--pb-led-glow), 0.7); }'), []);
});

test('the word white in CSS is a literal', () => {
  assert.deepEqual(css('a { background: white; }'), [1]);
});

test('white-space is not a colour', () => {
  assert.deepEqual(css('a { white-space: nowrap; }'), []);
});

test('a colour inside a CSS comment is not a literal', () => {
  assert.deepEqual(css('/* was #fff */\na { color: var(--x); }'), []);
});

test('a line marked theme-exempt is allowed its literal', () => {
  assert.deepEqual(css('a { box-shadow: 0 2px 8px #0003; /* theme-exempt: shadow */ }'), []);
});

test('the line number counts from one', () => {
  assert.deepEqual(css('a {\n  color: #000;\n}'), [2]);
});

test('a hex string in TSX is a literal', () => {
  assert.deepEqual(tsx('<path stroke="#6B7280" />'), [1]);
});

test('a named colour attribute in TSX is a literal', () => {
  assert.deepEqual(tsx('<path stroke="white" />'), [1]);
});

test('currentColor in TSX is not a literal', () => {
  assert.deepEqual(tsx('<svg fill="currentColor" />'), []);
});

test('component CSS is scanned', () => {
  assert.equal(isScannedFile('src/components/workbench/Dialog.css'), true);
});

test('the theme profiles are not scanned', () => {
  assert.equal(isScannedFile('src/theme/themes/dark.css'), false);
});

test('tests are not scanned', () => {
  assert.equal(isScannedFile('src/theme/themeContrast.test.ts'), false);
});

test('type declarations are not scanned', () => {
  assert.equal(isScannedFile('src/vite-env.d.ts'), false);
});
