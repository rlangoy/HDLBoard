// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * A starter top file for any board (docs/board_io_v2_spec.md § 5.5): every port of the
 * board in its own names and widths, and a body that compiles and runs on every valid
 * shape — the LEDs follow the switches, the displays are off, the buttons are declared
 * and unused. The built-in examples are written for the Default shape; this is what a
 * board of another shape starts from. Pure.
 */

import { DEFAULT_BOARD_ID } from './boardCatalog';
import { SEGMENT_COUNT } from './boardLimits';
import { portNameProblem } from './boardNames';
import { groupNames, portList } from './boardShape';
import type { BoardDefinition, BoardPorts, MultiplexedDisplays, SevenSegment } from './types';

export type TopLanguage = 'vhdl' | 'verilog';

const SIMULATOR_ONLY = 'Simulator only (HDLBoard): delete this port before synthesis.';

/**
 * One port of the top: its name, direction and width. A vector stays a vector at width 1
 * (`std_logic_vector(0 downto 0)`), as the generated testbench declares it.
 */
interface TopPort {
  readonly name: string;
  readonly direction: 'in' | 'out';
  readonly width: number;
  readonly vector: boolean;
  readonly note?: string;
}

const scalar = (name: string, direction: TopPort['direction']): TopPort => ({ name, direction, width: 1, vector: false });
const vectorPort = (name: string, direction: TopPort['direction'], width: number): TopPort => ({ name, direction, width, vector: true });

function displayPorts(displays: SevenSegment): TopPort[] {
  if (displays.kind === 'independent') return displays.ports.map((name) => vectorPort(name, 'out', displays.width));
  const segments: TopPort[] =
    displays.segments.kind === 'vector' ? [vectorPort(displays.segments.port, 'out', SEGMENT_COUNT)] : displays.segments.ports.map((name) => scalar(name, 'out'));
  const point = displays.decimalPoint === undefined ? [] : [scalar(displays.decimalPoint, 'out')];
  return [...segments, ...point, vectorPort(displays.digitEnables, 'out', displays.digits)];
}

/** Every port of the board, in the order the starter files declare them. */
function topPorts(ports: BoardPorts): TopPort[] {
  const { group } = ports.pushbuttons;
  const buttons: TopPort[] = group.kind === 'vector' ? [vectorPort(group.port, 'in', group.count)] : groupNames(group).map((name) => scalar(name, 'in'));
  return [
    scalar(ports.clock.port, 'in'),
    { ...scalar(ports.clock500Hz, 'in'), note: SIMULATOR_ONLY },
    ...(ports.switches.count ? [vectorPort(ports.switches.port, 'in', ports.switches.count)] : []),
    ...buttons,
    ...(ports.resetButton === undefined ? [] : [scalar(ports.resetButton.port, 'in')]),
    vectorPort(ports.leds.port, 'out', ports.leds.count),
    ...displayPorts(ports.sevenSegment),
  ];
}

/** An assignment of the body: a target, and its value as each language writes it. */
interface Assignment {
  readonly target: string;
  readonly vhdl: string;
  readonly verilog: string;
}

const bit = (level: 0 | 1): Pick<Assignment, 'vhdl' | 'verilog'> => ({ vhdl: `'${level}'`, verilog: `1'b${level}` });
const allBits = (level: 0 | 1, port: TopPort): Pick<Assignment, 'vhdl' | 'verilog'> =>
  port.vector ? { vhdl: `(others => '${level}')`, verilog: `{${port.width}{1'b${level}}}` } : bit(level);

/** The LEDs follow the switches: as many as there are, the rest held at 0. */
function ledsFollowSwitches({ switches, leds }: BoardPorts): Assignment {
  if (!switches.count) return { target: leds.port, ...allBits(0, vectorPort(leds.port, 'out', leds.count)) };
  const sw = switches.port;
  if (leds.count <= switches.count) {
    return { target: leds.port, vhdl: `${sw}(${leds.count - 1} downto 0)`, verilog: `${sw}[${leds.count - 1}:0]` };
  }
  return {
    target: leds.port,
    vhdl: `(${leds.count - 1} downto ${switches.count} => '0') & ${sw}`,
    verilog: `{{${leds.count - switches.count}{1'b0}}, ${sw}}`,
  };
}

/**
 * Seven scalar segments (`CA` … `CG` on the Nexys A7) driven as one word, `HEX`, so a
 * design writes a segment pattern as a vector: bit 0 is segment a, as everywhere in
 * HDLBoard. Its name is `HEX`, unless the board has a port by that name.
 */
interface SegmentWord {
  readonly name: string;
  /** Segments a … g, bit 0 first. */
  readonly segments: readonly string[];
}

const SEGMENT_WORD_NAMES: readonly string[] = ['HEX', 'HEX_WORD', 'SEGMENT_WORD'];

function segmentWordOf(ports: BoardPorts): SegmentWord | undefined {
  const displays = ports.sevenSegment;
  if (displays.kind !== 'multiplexed' || displays.segments.kind !== 'scalars') return undefined;
  const taken = new Set(portList(ports).map((name) => name.toLowerCase()));
  const name = SEGMENT_WORD_NAMES.find((candidate) => !taken.has(candidate.toLowerCase())) ?? SEGMENT_WORD_NAMES[0];
  return { name, segments: displays.segments.ports };
}

/** Every segment, decimal point and digit enable at its inactive level; scalar segments through their word. */
function displaysOff(ports: BoardPorts, word: SegmentWord | undefined): Assignment[] {
  const displays = ports.sevenSegment;
  const segmentOff = displays.activeLow ? 1 : 0;
  if (displays.kind === 'independent') return displayPorts(displays).map((port) => ({ target: port.name, ...allBits(segmentOff, port) }));
  return multiplexedOff(displays, word, segmentOff);
}

function multiplexedOff(displays: MultiplexedDisplays, word: SegmentWord | undefined, segmentOff: 0 | 1): Assignment[] {
  const enableOff = displays.digitEnablesActiveLow ? 1 : 0;
  const outputs = displayPorts(displays).filter((port) => !(word?.segments.includes(port.name) ?? false));
  const wordOff: Assignment[] = word === undefined ? [] : [{ target: word.name, ...allBits(segmentOff, vectorPort(word.name, 'out', SEGMENT_COUNT)) }];
  return [...wordOff, ...outputs.map((port) => ({ target: port.name, ...allBits(port.name === displays.digitEnables ? enableOff : segmentOff, port) }))];
}

/** `(CG, CF, …, CA)`: the segments, g first, so the word's bit 0 lands on segment a. */
const segmentsHighFirst = (word: SegmentWord): string => [...word.segments].reverse().join(', ');

const polarity = (activeLow: boolean): string => (activeLow ? 'active low' : 'active high');

/** The header: the board, its polarities and its resources, as comment lines. */
function headerLines(board: BoardDefinition): string[] {
  const { pushbuttons, resetButton, sevenSegment } = board.ports;
  const reset = resetButton === undefined ? '' : `, reset button ${polarity(resetButton.activeLow)}`;
  const enables = sevenSegment.kind === 'multiplexed' ? `, multiplexed (digit enables ${polarity(sevenSegment.digitEnablesActiveLow)})` : '';
  return [
    `Starter top file for the ${board.name} board, made by HDLBoard.`,
    `Buttons: ${polarity(pushbuttons.activeLow)}${reset}. Displays: ${polarity(sevenSegment.activeLow)}${enables}.`,
    ...(board.resources.length === 0 ? [] : ['Board resources:', ...board.resources.map((resource) => `  ${resource.label}: ${resource.url}`)]),
  ];
}

// --- VHDL --------------------------------------------------------------------------

function vhdlPortLines(ports: readonly TopPort[]): string[] {
  const nameWidth = Math.max(...ports.map((port) => port.name.length));
  return ports.map((port, index) => {
    const type = port.vector ? `std_logic_vector(${port.width - 1} downto 0)` : 'std_logic';
    const end = index === ports.length - 1 ? '' : ';';
    const note = port.note === undefined ? '' : ` -- ${port.note}`;
    return `        ${port.name.padEnd(nameWidth)} : ${port.direction.padEnd('out'.length)} ${type}${end}${note}`;
  });
}

/** The architecture: the segment word, the LEDs following the switches, the displays off. */
function vhdlArchitecture(ports: BoardPorts, name: string): string[] {
  const word = segmentWordOf(ports);
  const leds = ledsFollowSwitches(ports);
  return [
    `architecture rtl of ${name} is`,
    ...(word === undefined ? [] : [`    signal ${word.name} : std_logic_vector(${SEGMENT_COUNT - 1} downto 0);`]),
    'begin',
    '    -- The LEDs follow the switches.',
    `    ${leds.target} <= ${leds.vhdl};`,
    ...(word === undefined ? [] : ['', `    (${segmentsHighFirst(word)}) <= ${word.name}; -- single segments as one vector: ${word.name}(0) is segment a (${word.segments[0]})`]),
    '    -- The displays are off.',
    ...displaysOff(ports, word).map((assignment) => `    ${assignment.target} <= ${assignment.vhdl};`),
    'end architecture;',
  ];
}

function vhdlTop(board: BoardDefinition, name: string): string {
  return [
    ...headerLines(board).map((line) => `-- ${line}`),
    'library ieee;',
    'use ieee.std_logic_1164.all;',
    '',
    `entity ${name} is`,
    '    port (',
    ...vhdlPortLines(topPorts(board.ports)),
    '    );',
    'end entity;',
    '',
    ...vhdlArchitecture(board.ports, name),
    '',
  ].join('\n');
}

// --- Verilog -----------------------------------------------------------------------

function verilogPortLines(ports: readonly TopPort[]): string[] {
  const ranges = ports.map((port) => (port.vector ? `[${port.width - 1}:0]` : ''));
  const rangeWidth = Math.max(...ranges.map((range) => range.length));
  return ports.map((port, index) => {
    const direction = port.direction === 'in' ? 'input ' : 'output';
    const end = index === ports.length - 1 ? '' : ',';
    const note = port.note === undefined ? '' : ` // ${port.note}`;
    return `    ${direction} wire ${ranges[index].padEnd(rangeWidth)} ${port.name}${end}${note}`;
  });
}

/** The module body: the segment word, the LEDs following the switches, the displays off. */
function verilogBody(ports: BoardPorts): string[] {
  const word = segmentWordOf(ports);
  const leds = ledsFollowSwitches(ports);
  const wordLines =
    word === undefined
      ? []
      : [
          `    wire [${SEGMENT_COUNT - 1}:0] ${word.name};`,
          `    assign {${segmentsHighFirst(word)}} = ${word.name}; // single segments as one vector: ${word.name}[0] is segment a (${word.segments[0]})`,
        ];
  return [
    ...wordLines,
    '    // The LEDs follow the switches.',
    `    assign ${leds.target} = ${leds.verilog};`,
    '    // The displays are off.',
    ...displaysOff(ports, word).map((assignment) => `    assign ${assignment.target} = ${assignment.verilog};`),
  ];
}

function verilogTop(board: BoardDefinition, name: string): string {
  return [
    ...headerLines(board).map((line) => `// ${line}`),
    `module ${name} (`,
    ...verilogPortLines(topPorts(board.ports)),
    ');',
    ...verilogBody(board.ports),
    'endmodule',
    '',
  ].join('\n');
}

/** The starter top file of `board`, its entity or module called `name`. */
export function generateBoardTop(board: BoardDefinition, language: TopLanguage, name: string): string {
  return language === 'vhdl' ? vhdlTop(board, name) : verilogTop(board, name);
}

/** New designs declare the board's physical I/O and leave all behaviour to the author. */
export function generateEmptyBoardTop(board: BoardDefinition, language: TopLanguage, name: string): string {
  const ports = topPorts(board.ports).filter((port) => port.note === undefined);
  if (language === 'verilog') return [`module ${name} (`, ...verilogPortLines(ports), ');', '', 'endmodule', ''].join('\n');
  return ['library ieee;', 'use ieee.std_logic_1164.all;', '', `entity ${name} is`, '    port (',
    ...vhdlPortLines(ports), '    );', 'end entity;', '', `architecture rtl of ${name} is`, 'begin', '', 'end architecture;', ''].join('\n');
}

const FILE_EXTENSION: Readonly<Record<TopLanguage, string>> = { vhdl: '.vhdl', verilog: '.v' };

/** The Default board's top keeps the starter files' name: `Default` is a Verilog keyword. */
const DEFAULT_BOARD_TOP = 'DE1_SoC';
const FALLBACK_TOP = 'board_top';

/**
 * The entity or module name of a board's top file, from the board's name: `Nexys_A7`,
 * `Basys_3`, `DE10_Lite`. Valid in both languages: a name that is a keyword or starts
 * with a digit gets `_top` or `board_` added.
 */
export function boardTopName(board: BoardDefinition): string {
  if (board.id === DEFAULT_BOARD_ID) return DEFAULT_BOARD_TOP;
  const words = board.name.replace(/[^A-Za-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  const stem = /^[A-Za-z]/.test(words) ? words : `board_${words}`;
  if (portNameProblem(stem) === undefined) return stem;
  return portNameProblem(`${stem}_top`) === undefined ? `${stem}_top` : FALLBACK_TOP;
}

/**
 * A free file name for the top of `board`, named as the entity or module inside it:
 * `Nexys_A7.vhdl`, then `Nexys_A7_2.vhdl` when that is taken (ignoring case).
 */
export function starterTopFileName(board: BoardDefinition, language: TopLanguage, takenNames: readonly string[]): string {
  const stem = boardTopName(board);
  const taken = new Set(takenNames.map((name) => name.toLowerCase()));
  const candidate = (n: number): string => `${n === 1 ? stem : `${stem}_${n}`}${FILE_EXTENSION[language]}`;
  let n = 1;
  while (taken.has(candidate(n).toLowerCase())) n++;
  return candidate(n);
}
