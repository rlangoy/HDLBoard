// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/* ------------------------------------------------------------------ *
 * The Examples pane's catalogue: one card per example and language,
 * each naming the built-in files (files.ts) it copies into the project.
 * The built-in files themselves are never edited — opening an example
 * adds a copy to the Files panel, and that copy is what the student edits.
 * ------------------------------------------------------------------ */

import { EXAMPLE_FILES, type VhdlFile } from './files';

export type ExampleLanguage = 'vhdl' | 'verilog';

export const EXAMPLE_LANGUAGES: readonly ExampleLanguage[] = ['vhdl', 'verilog'];

export const LANGUAGE_LABEL: Record<ExampleLanguage, string> = { vhdl: 'VHDL', verilog: 'Verilog' };

export interface Example {
  id: string;
  title: string;
  description: string;
  language: ExampleLanguage;
  /** A design or a testbench — picks the card's dot colour, as the editor's pane roles do. */
  role: 'design' | 'testbench';
  /** EXAMPLE_FILES ids. The first is the one opened in the editor; the rest come along so it runs (a testbench's design). */
  fileIds: readonly string[];
}

/** One catalogue entry, written once for both languages. */
interface ExampleEntry {
  key: string;
  title: string;
  description: string;
  role: Example['role'];
  /** EXAMPLE_FILES ids in each language, the file to open first. */
  files: Record<ExampleLanguage, readonly string[]>;
}

const CATALOGUE: readonly ExampleEntry[] = [
  {
    key: 'de1_soc',
    title: 'DE1-SoC Top Level',
    description: "The board's top-level interface, with the switches wired to the LEDs.",
    role: 'design',
    files: { vhdl: ['de1_soc'], verilog: ['de1_soc_v'] },
  },
  {
    key: 'blink',
    title: 'Blink LED',
    description: 'Simple blinking LED example using a counter.',
    role: 'design',
    files: { vhdl: ['blink_test'], verilog: ['blink_test_v'] },
  },
  {
    key: 'key_counter',
    title: 'Key Counter to LED',
    description: 'Counts key presses and displays the count on the LEDs.',
    role: 'design',
    files: { vhdl: ['key_counter_2_led'], verilog: ['key_counter_2_led_v'] },
  },
  {
    key: 'key_counter_7seg',
    title: 'Key Counter to 7-Segment',
    description: 'Press KEY0 to count up on the 7-segment displays (00-99); KEY1 resets.',
    role: 'design',
    files: { vhdl: ['key_counter_7seg'], verilog: ['key_counter_7seg_v'] },
  },
  {
    key: 'and_gate',
    title: 'AND Gate',
    description: 'Basic AND gate implementation.',
    role: 'design',
    files: { vhdl: ['and_gate'], verilog: ['and_gate_v'] },
  },
  {
    key: 'and_gate_tb',
    title: 'AND Gate Testbench',
    description: 'Self-checking testbench for the AND gate. Copies the AND gate too.',
    role: 'testbench',
    files: { vhdl: ['and_gate_tb', 'and_gate'], verilog: ['and_gate_tb_v', 'and_gate_v'] },
  },
  {
    key: 'and_gate_truthtable_tb',
    title: 'AND Gate Truth Table Testbench',
    description: 'Tests the AND gate and prints its truth table. Copies the AND gate too.',
    role: 'testbench',
    files: {
      vhdl: ['and_gate_truthtable_tb', 'and_gate'],
      verilog: ['and_gate_truthtable_tb_v', 'and_gate_v'],
    },
  },
];

/** One card per catalogue entry and language. */
export const EXAMPLES: readonly Example[] = CATALOGUE.flatMap(({ key, files, ...text }) =>
  EXAMPLE_LANGUAGES.map((language) => ({ ...text, id: `${key}_${language}`, language, fileIds: files[language] })),
);

/** The built-in file an example names. The catalogue is fixed (and tested), so a missing id is a bug. */
function exampleFile(id: string): VhdlFile {
  const file = EXAMPLE_FILES.find((f) => f.id === id);
  if (!file) throw new Error(`No built-in file "${id}"`);
  return file;
}

/** Everything a search matches against: title, description, language and file names. */
function searchText(example: Example): string {
  const fileNames = example.fileIds.map((id) => exampleFile(id).name);
  return [example.title, example.description, LANGUAGE_LABEL[example.language], ...fileNames].join(' ').toLowerCase();
}

/** The examples in one of `languages` whose search text contains every word of `query`. */
export function filterExamples(
  examples: readonly Example[],
  query: string,
  languages: ReadonlySet<ExampleLanguage> = new Set(EXAMPLE_LANGUAGES),
): readonly Example[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  return examples.filter(
    (example) => languages.has(example.language) && words.every((word) => searchText(example).includes(word)),
  );
}

export interface ExampleCopy {
  /** Copies to append to the project — only files whose name it does not already have. */
  added: VhdlFile[];
  /** Names left alone because the project already has a file by that name. */
  kept: string[];
  /** The project file to open: the new copy of the first file, or the existing one it matched. */
  openId: string;
}

/**
 * What opening `example` does to `files`: each of its files is copied in under
 * a fresh id (`newId`), unless a file of the same name (ignoring case) is already
 * there — that one is kept untouched, so a student's edits are never overwritten.
 */
export function copyExample(example: Example, files: readonly VhdlFile[], newId: () => string): ExampleCopy {
  const added: VhdlFile[] = [];
  const kept: string[] = [];
  const projectIdOf = (source: VhdlFile): string => {
    const existing = files.find((f) => f.name.toLowerCase() === source.name.toLowerCase());
    if (existing) {
      kept.push(existing.name);
      return existing.id;
    }
    const copy = { ...source, id: newId() };
    added.push(copy);
    return copy.id;
  };
  const [openId] = example.fileIds.map((id) => projectIdOf(exampleFile(id)));
  return { added, kept, openId };
}
