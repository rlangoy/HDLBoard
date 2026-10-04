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

interface ExampleText {
  key: string;
  title: string;
  description: string;
  role: Example['role'];
  /** File ids per language, primary file first. */
  vhdl: readonly string[];
  verilog: readonly string[];
}

const EXAMPLE_TEXTS: readonly ExampleText[] = [
  {
    key: 'de1_soc',
    title: 'DE1-SoC Top Level',
    description: "The board's top-level interface, with the switches wired to the LEDs.",
    role: 'design',
    vhdl: ['de1_soc'],
    verilog: ['de1_soc_v'],
  },
  {
    key: 'blink',
    title: 'Blink LED',
    description: 'Simple blinking LED example using a counter.',
    role: 'design',
    vhdl: ['blink_test'],
    verilog: ['blink_test_v'],
  },
  {
    key: 'key_counter',
    title: 'Key Counter to LED',
    description: 'Counts key presses and displays the count on the LEDs.',
    role: 'design',
    vhdl: ['key_counter_2_led'],
    verilog: ['key_counter_2_led_v'],
  },
  {
    key: 'key_counter_7seg',
    title: 'Key Counter to 7-Segment',
    description: 'Press KEY0 to count up on the 7-segment displays (00-99); KEY1 resets.',
    role: 'design',
    vhdl: ['key_counter_7seg'],
    verilog: ['key_counter_7seg_v'],
  },
  {
    key: 'and_gate',
    title: 'AND Gate',
    description: 'Basic AND gate implementation.',
    role: 'design',
    vhdl: ['and_gate'],
    verilog: ['and_gate_v'],
  },
  {
    key: 'and_gate_tb',
    title: 'AND Gate Testbench',
    description: 'Self-checking testbench for the AND gate. Copies the AND gate too.',
    role: 'testbench',
    vhdl: ['and_gate_tb', 'and_gate'],
    verilog: ['and_gate_tb_v', 'and_gate_v'],
  },
];

export const EXAMPLES: readonly Example[] = EXAMPLE_TEXTS.flatMap(({ key, vhdl, verilog, ...text }) =>
  (['vhdl', 'verilog'] as const).map((language) => ({
    ...text,
    id: `${key}_${language}`,
    language,
    fileIds: language === 'vhdl' ? vhdl : verilog,
  })),
);

export const LANGUAGE_LABEL: Record<ExampleLanguage, string> = { vhdl: 'VHDL', verilog: 'Verilog' };

/** The examples whose title, description, language or file names contain every word of `query`. */
export function filterExamples(examples: readonly Example[], query: string): readonly Example[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return examples;
  return examples.filter((example) => {
    const haystack = [
      example.title,
      example.description,
      LANGUAGE_LABEL[example.language],
      ...example.fileIds.map((id) => EXAMPLE_FILES.find((f) => f.id === id)?.name ?? ''),
    ]
      .join(' ')
      .toLowerCase();
    return words.every((word) => haystack.includes(word));
  });
}

export interface ExampleCopy {
  /** Copies to append to the project — only files whose name it does not already have. */
  added: VhdlFile[];
  /** Names left alone because the project already has a file by that name. */
  kept: string[];
  /** The project file to open: the new copy of the primary file, or the existing one it matched. */
  openId: string | null;
}

/**
 * What opening `example` does to `files`: each of its files is copied in under
 * a fresh id (`newId`), unless a file of the same name (ignoring case) is already
 * there — that one is kept untouched, so a student's edits are never overwritten.
 */
export function copyExample(example: Example, files: readonly VhdlFile[], newId: () => string): ExampleCopy {
  const added: VhdlFile[] = [];
  const kept: string[] = [];
  let openId: string | null = null;
  example.fileIds.forEach((fileId, i) => {
    const source = EXAMPLE_FILES.find((f) => f.id === fileId);
    if (!source) return;
    const existing = files.find((f) => f.name.toLowerCase() === source.name.toLowerCase());
    let id: string;
    if (existing) {
      kept.push(existing.name);
      id = existing.id;
    } else {
      id = newId();
      added.push({ ...source, id });
    }
    if (i === 0) openId = id;
  });
  return { added, kept, openId };
}
