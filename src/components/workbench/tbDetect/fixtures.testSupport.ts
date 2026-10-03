// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/** The detector's fixtures (tests/fixtures/tbdetect/), for the tests only. */

import type { SourceFile } from './analyzeProject';

const texts = import.meta.glob<string>('../../../../tests/fixtures/tbdetect/{vhdl,verilog}/*.{vhd,v}', {
  query: '?raw',
  import: 'default',
  eager: true,
});

/** `vhdl/counter.vhd` -> its text, line endings normalised to LF. */
export const FIXTURES: ReadonlyMap<string, string> = new Map(
  Object.entries(texts).map(([path, text]) => [path.slice(path.indexOf('tbdetect/') + 9), text.replace(/\r\n/g, '\n')]),
);

export function fixture(path: string): string {
  const text = FIXTURES.get(path);
  if (text === undefined) throw new Error(`No fixture ${path}`);
  return text;
}

/** A project file made from a fixture; the id is the path, the folder its first part unless given. */
export function fixtureFile(path: string, folder?: SourceFile['folder'], name?: string): SourceFile {
  const [dir, file] = path.split('/');
  const fileName = name ?? file;
  return { id: `${folder ?? dir}/${fileName}`, name: fileName, folder: folder ?? (dir as SourceFile['folder']), content: fixture(path) };
}

/** A project file from inline text. */
export function sourceFile(path: string, content: string): SourceFile {
  const [folder, name] = path.split('/');
  return { id: path, name, folder: folder as SourceFile['folder'], content };
}
