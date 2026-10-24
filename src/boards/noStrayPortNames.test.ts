// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import { describe, expect, it } from 'vitest';

/**
 * Port names live in the board definitions only (docs/board_io_config_spec.md § 11.1): code that
 * needs "the pushbuttons" asks the board. This scans every production source of both packages for
 * a hard-coded Default name in code (comments may mention them), outside the few places that are
 * allowed to hold one.
 */

const FRONTEND: Record<string, string> = import.meta.glob(['../**/*.{ts,tsx}', '!../**/*.test.{ts,tsx}'], {
  query: '?raw',
  import: 'default',
  eager: true,
});
const BACKEND: Record<string, string> = import.meta.glob(['../../server/src/**/*.ts', '!../../server/src/**/*.test.ts'], {
  query: '?raw',
  import: 'default',
  eager: true,
});

/** Where a Default name belongs: the canonical sources, the backend's default board, and test support. */
const ALLOWED: readonly RegExp[] = [
  /\/components\/workbench\/files\.ts$/, // the canonical example and starter texts
  /\/components\/workbench\/newFile\.ts$/, // the canonical New File template
  /\/components\/workbench\/[^/]*corpus\.ts$/, // diagnostics corpora: recorded compiler output
  /\/server\/src\/engines\/boardPorts\.ts$/, // DEFAULT_BOARD_IO, the compatibility default
  /\/testSupport\//,
  /\.testSupport\.ts$/,
];

const STRAY_NAME = /\b(?:KEY_N|HEX[0-5]_N)\b|'key_n'|'hex[0-5]_n'/;

/** The code without its comments: a line comment, a block comment, or a doc-comment line. */
function codeOf(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');
}

function strayNames(sources: Record<string, string>): string[] {
  return Object.entries(sources)
    .filter(([path]) => !ALLOWED.some((allowed) => allowed.test(path)))
    .filter(([, text]) => STRAY_NAME.test(codeOf(text)))
    .map(([path]) => path);
}

describe('port names outside the board definitions', () => {
  it('finds the sources it scans', () => {
    expect(Object.keys(FRONTEND).length).toBeGreaterThan(100);
    expect(Object.keys(BACKEND).length).toBeGreaterThan(30);
  });

  it('are in no frontend source', () => {
    expect(strayNames(FRONTEND)).toEqual([]);
  });

  it('are in no backend source', () => {
    expect(strayNames(BACKEND)).toEqual([]);
  });
});
