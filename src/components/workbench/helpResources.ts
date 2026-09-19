// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * The self-study links shown in the Help dialog. Kept apart from the
 * component so the list can be curated without touching any markup. Every
 * URL was opened and checked when it was added; if one goes stale, fix it
 * here.
 */

export interface HelpResource {
  title: string;
  url: string;
  /** Who publishes it — shown small, under the title. */
  source: string;
  /** What it is, in a few words: "Free book · PDF", "Video course", … */
  kind: string;
  description: string;
}

/** The one cheat sheet. */
export const CHEAT_SHEET: HelpResource = {
  title: 'VHDL Cheat Sheet',
  url: 'https://cheatsheets.zip/vhdl',
  source: 'cheatsheets.zip',
  kind: 'Web page · free',
  description:
    'One browsable page with the syntax you reach for every day: entity and architecture, data types, processes, operators, control structures, state machines and testbenches.',
};

/** Guides and courses for learning the language — best first, five at most. */
export const GUIDES: HelpResource[] = [
  {
    title: 'Free Range VHDL',
    url: 'https://github.com/fabriziotappero/Free-Range-VHDL-book',
    source: 'Bryan Mealy & Fabrizio Tappero',
    kind: 'Free book · PDF',
    description:
      'An open-source textbook written for students, covering introductory and intermediate digital design with VHDL. The best place to start, and to keep beside you.',
  },
  {
    title: 'Learn VHDL',
    url: 'https://nandland.com/learn-vhdl/',
    source: 'Nandland',
    kind: 'Tutorials with code',
    description:
      'Short lessons with worked code examples: the fundamentals, reserved words and operators, then small modules such as adders and a UART.',
  },
  {
    title: 'Basic VHDL Course',
    url: 'https://vhdlwhiz.com/basic-vhdl-tutorials/',
    source: 'VHDLwhiz',
    kind: 'Video course · free',
    description:
      '23 video lessons in four parts. It needs no hardware, only a simulator, so it fits alongside this workbench.',
  },
  {
    title: 'Complete VHDL Tutorials for Beginners',
    url: 'https://fpgatutorial.com/vhdl/',
    source: 'FPGA Tutorial',
    kind: 'Tutorials',
    description: 'A series that introduces FPGA design and simulation with VHDL, written for newcomers.',
  },
  {
    title: 'VHDL for FPGA Design',
    url: 'https://en.wikibooks.org/wiki/VHDL_for_FPGA_Design',
    source: 'Wikibooks',
    kind: 'Open textbook',
    description: 'Combinational and sequential circuits, state machines and practice exercises for FPGA design.',
  },
];

/** The board and the tool this workbench imitates and runs on. */
export const REFERENCES: HelpResource[] = [
  {
    title: 'DE1-SoC User Manual',
    url: 'https://courses.cs.washington.edu/courses/cse371/references/DE1-SoC_User_Manual.pdf',
    source: 'Terasic (2014 edition, hosted by the University of Washington)',
    kind: 'Manual · PDF',
    description:
      'The real board: switches, KEYs, LEDs and 7-segment displays, with pin names and how each is driven.',
  },
  {
    title: 'GHDL Quick Start Guide',
    url: 'https://ghdl.github.io/ghdl/quick_start/index.html',
    source: 'GHDL documentation',
    kind: 'Documentation',
    description: 'The open-source simulator that runs your design here: how VHDL is analysed, elaborated and run.',
  },
];
