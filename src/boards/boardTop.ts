// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * A starter top file for any board (docs/board_io_v2_spec.md § 5.5): every port of the
 * board in its own names and widths, and a body that compiles and runs on every valid
 * shape — the LEDs follow the switches, the displays are off, the buttons are declared
 * and unused. The built-in examples are written for the Default shape; this is what a
 * board of another shape starts from. Pure.
 */

import { SEGMENT_COUNT } from './boardLimits';
import { groupNames } from './boardShape';
import type { BoardDefinition, BoardPorts, SevenSegment } from './types';

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
    vectorPort(ports.switches.port, 'in', ports.switches.count),
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

/** Every segment, decimal point and digit enable at its inactive level. */
function displaysOff(ports: BoardPorts): Assignment[] {
  const displays = ports.sevenSegment;
  const segmentOff = displays.activeLow ? 1 : 0;
  const outputs = displayPorts(displays);
  if (displays.kind === 'independent') return outputs.map((port) => ({ target: port.name, ...allBits(segmentOff, port) }));
  const enableOff = displays.digitEnablesActiveLow ? 1 : 0;
  return outputs.map((port) => ({ target: port.name, ...allBits(port.name === displays.digitEnables ? enableOff : segmentOff, port) }));
}

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

function vhdlTop(board: BoardDefinition, name: string): string {
  const assignments = [ledsFollowSwitches(board.ports), ...displaysOff(board.ports)];
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
    `architecture rtl of ${name} is`,
    'begin',
    '    -- The LEDs follow the switches.',
    `    ${assignments[0].target} <= ${assignments[0].vhdl};`,
    '    -- The displays are off.',
    ...assignments.slice(1).map((assignment) => `    ${assignment.target} <= ${assignment.vhdl};`),
    'end architecture;',
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

function verilogTop(board: BoardDefinition, name: string): string {
  const assignments = [ledsFollowSwitches(board.ports), ...displaysOff(board.ports)];
  return [
    ...headerLines(board).map((line) => `// ${line}`),
    `module ${name} (`,
    ...verilogPortLines(topPorts(board.ports)),
    ');',
    '    // The LEDs follow the switches.',
    `    assign ${assignments[0].target} = ${assignments[0].verilog};`,
    '    // The displays are off.',
    ...assignments.slice(1).map((assignment) => `    assign ${assignment.target} = ${assignment.verilog};`),
    'endmodule',
    '',
  ].join('\n');
}

/** The starter top file of `board`, its entity or module called `name`. */
export function generateBoardTop(board: BoardDefinition, language: TopLanguage, name: string): string {
  return language === 'vhdl' ? vhdlTop(board, name) : verilogTop(board, name);
}

const FILE_EXTENSION: Readonly<Record<TopLanguage, string>> = { vhdl: '.vhdl', verilog: '.v' };

/**
 * A free file name for the starter top of `board` and the entity or module inside it:
 * `basys3_top.vhdl`, then `basys3_top_2.vhdl` when that is taken (ignoring case). The
 * stem is a valid identifier in both languages, as a board id may start with a digit.
 */
export function starterTopFileName(board: BoardDefinition, language: TopLanguage, takenNames: readonly string[]): string {
  const stem = `${/^[0-9]/.test(board.id) ? 'board_' : ''}${board.id.replace(/-/g, '_')}_top`;
  const taken = new Set(takenNames.map((name) => name.toLowerCase()));
  const candidate = (n: number): string => `${n === 1 ? stem : `${stem}_${n}`}${FILE_EXTENSION[language]}`;
  let n = 1;
  while (taken.has(candidate(n).toLowerCase())) n++;
  return candidate(n);
}
