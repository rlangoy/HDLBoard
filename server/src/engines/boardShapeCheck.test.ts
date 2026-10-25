// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { BASYS3_BOARD_IO, NEXYS_A7_BOARD_IO } from '../testSupport/boards.js';
import { checkBoardPortShapes, shapeErrors, shapeNotes } from './boardShapeCheck.js';
import { DEFAULT_BOARD_IO } from './boardPorts.js';
import { declaredWidth, portDeclarations } from './vhdlPorts.js';

const entity = (ports: string): string => `library ieee;\nuse ieee.std_logic_1164.all;\nentity top is\n  port (\n${ports}\n  );\nend entity;\n`;

describe('declaredWidth (docs/board_io_v2_spec.md § 8)', () => {
  const cases: Array<[string, string, number | undefined]> = [
    ['std_logic', 'std_logic', 1],
    ['std_ulogic', 'std_ulogic', 1],
    ['bit', 'bit', 1],
    ['std_logic_vector', 'std_logic_vector(9 downto 0)', 10],
    ['std_logic_vector', 'std_logic_vector(0 to 6)', 7],
    ['unsigned', 'unsigned(15 downto 0)', 16],
    ['signed', 'signed (3 downto 0)', 4],
    ['std_logic_vector', 'std_logic_vector(N-1 downto 0)', undefined],
    ['integer', 'integer range 0 to 9', undefined],
  ];
  for (const [type, declaration, width] of cases) {
    test(`${declaration} is ${width ?? 'unreadable'}`, () => assert.equal(declaredWidth(type, declaration), width));
  }

  test('portDeclarations reads the declaration as written, without mode or default', () => {
    const [sw, key] = portDeclarations(entity("    SW  : in std_logic_vector(9 downto 0) := (others => '0');\n    KEY : in  std_ulogic"), 'top');
    assert.deepEqual([sw?.declaration, sw?.width, key?.declaration, key?.width], ['std_logic_vector(9 downto 0)', 10, 'std_ulogic', 1]);
  });
});

describe('checkBoardPortShapes', () => {
  const vhdlTop = (ports: string) =>
    portDeclarations(entity(ports), 'top').map((port) => ({ name: port.name, declaration: port.declaration, width: port.width, location: 'top.vhdl:5:5:' }));

  test('says plainly that a 10-bit SW does not fit the Basys 3, and what to declare', () => {
    const checks = checkBoardPortShapes(vhdlTop('    SW : in std_logic_vector(9 downto 0)'), BASYS3_BOARD_IO, 'vhdl');
    assert.equal(
      shapeErrors(checks),
      'top.vhdl:5:5:error: SW is declared as std_logic_vector(9 downto 0) (10 bits), but the board has 16 switches.\n' +
        'top.vhdl:5:5:error: Expected: sw : in std_logic_vector(15 downto 0);',
    );
  });

  test('accepts a std_ulogic scalar button and a design of the right widths', () => {
    const checks = checkBoardPortShapes(vhdlTop('    btnC : in std_ulogic;\n    sw : in std_logic_vector(15 downto 0);\n    an : out std_logic_vector(3 downto 0)'), BASYS3_BOARD_IO, 'vhdl');
    assert.deepEqual(checks, []);
  });

  test('notes a width it cannot read, and lets the run go on', () => {
    const checks = checkBoardPortShapes(vhdlTop('    SW : in std_logic_vector(N-1 downto 0)'), BASYS3_BOARD_IO, 'vhdl');
    assert.equal(shapeErrors(checks), undefined);
    assert.deepEqual(shapeNotes(checks), ['Note: SW has a width HDLBoard cannot read (std_logic_vector(N-1 downto 0)); the board has 16 switches.']);
  });

  test('warns in Verilog, where Icarus runs the design anyway: a scalar for a scalar port, the digit count for the enables', () => {
    const checks = checkBoardPortShapes(
      [
        { name: 'BTNC', declaration: 'input [1:0]', width: 2 },
        { name: 'AN', declaration: 'output [3:0]', width: 4 },
      ],
      NEXYS_A7_BOARD_IO,
      'verilog',
    );
    assert.equal(shapeErrors(checks), undefined);
    assert.deepEqual(shapeNotes(checks), [
      'Warning: BTNC is declared as input [1:0] (2 bits), but the board has BTNC as one bit. Icarus connects the low bits only.\n  Expected: input wire BTNC',
      'Warning: AN is declared as output [3:0] (4 bits), but the board has 8 digits. Icarus connects the low bits only.\n  Expected: output wire [7:0] AN',
    ]);
  });

  test('leaves the Default board\'s own widths alone', () => {
    const ports = vhdlTop('    SW : in std_logic_vector(9 downto 0);\n    KEY_N : in std_logic_vector(3 downto 0);\n    HEX0_N : out std_logic_vector(6 downto 0)');
    assert.deepEqual(checkBoardPortShapes(ports, DEFAULT_BOARD_IO, 'vhdl'), []);
  });

  test('a 1-bit vector on the board is not a std_logic in VHDL, which GHDL would refuse', () => {
    const oneSwitch = { ...DEFAULT_BOARD_IO, switches: { port: 'SW', count: 1 } };
    const ports = portDeclarations(entity('    SW : in std_logic;\n    CLOCK_50 : in std_logic'), 'top').map((port) => ({
      name: port.name,
      declaration: port.declaration,
      width: port.width,
      vector: port.constrained,
    }));
    const errors = shapeErrors(checkBoardPortShapes(ports, oneSwitch, 'vhdl')) ?? '';
    assert.match(errors, /SW is declared as std_logic, but on the board it is a vector of 1 bit/);
    assert.match(errors, /Expected: SW : in std_logic_vector\(0 downto 0\);/);
    assert.doesNotMatch(errors, /CLOCK_50/);
  });
});
