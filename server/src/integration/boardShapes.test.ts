// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * Boards of other shapes run (docs/board_io_v2_spec.md § 12.2): a design in each new
 * board's master names, in VHDL on GHDL and in Verilog on Icarus, reads its switches,
 * buttons (active high on Digilent boards) and reset button, and drives its displays —
 * including a decimal point and a multiplexed display, decoded in the testbench into
 * stable digits.
 */

import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import type { BoardIo } from '../engines/boardPorts.js';
import { stateFields, stimFields } from '../engines/boardShape.js';
import { BASYS3_BOARD_IO, boardFromFrame, DE10_LITE_BOARD_IO, MUX_NO_POINT_BOARD_IO, NEXYS_A7_BOARD_IO, starterTop } from '../testSupport/boards.js';
import type { FixtureLanguage } from '../testSupport/fixture.js';
import { backendOptionsFor, icarusForTests } from '../testSupport/icarus.js';
import { requireTool } from '../testSupport/requireTool.js';
import { BASYS3_DESIGN, BASYS3_REFRESH_DESIGN, DE10_LITE_DESIGN, NEXYS_A7_DESIGN, type ShapeDesign } from '../testSupport/shapeDesigns.js';
import { startTestBackend, type TestBackend } from '../testSupport/testBackend.js';
import { startRun, withSession as withSessionOn } from '../testSupport/withSession.js';
import type { WsTestClient } from '../testSupport/WsTestClient.js';

const ghdl = requireTool('ghdl');
const icarus = icarusForTests();
const skip = ghdl.skip || icarus.skip;

const LANGUAGES: readonly FixtureLanguage[] = ['vhdl', 'verilog'];
/** Long enough for a design with a 100 MHz clock to get through its first polls. */
const STATE_WAIT_MS = 20_000;

const OFF_8 = '11111111';
const ONE_WITH_POINT_OFF = '11111001';

/** A step of a run: the `STIM` sent, and the `STATE` it must lead to. */
interface Step {
  readonly stim: string;
  readonly state: string;
}

interface BoardCase {
  readonly board: BoardIo;
  readonly designs: Readonly<Record<FixtureLanguage, ShapeDesign>>;
  readonly steps: readonly Step[];
}

const CASES: Readonly<Record<string, BoardCase>> = {
  'DE10-Lite (2 keys, decimal point)': {
    board: DE10_LITE_BOARD_IO,
    designs: DE10_LITE_DESIGN,
    steps: [
      { stim: '1000000001' + '11', state: '1000000001' + '01111001' + OFF_8.repeat(5) },
      { stim: '1000000001' + '10', state: '1000000000' + '01111001' + OFF_8.repeat(5) },
    ],
  },
  'Basys 3 (active-high cross, 4-digit multiplexed display, 100 MHz)': {
    board: BASYS3_BOARD_IO,
    designs: BASYS3_DESIGN,
    steps: [
      { stim: '1000000000000000' + '00001', state: '1000000000000001' + ONE_WITH_POINT_OFF + OFF_8.repeat(3) },
      { stim: '1000000000000000' + '00010', state: '1000000000000010' + ONE_WITH_POINT_OFF + OFF_8.repeat(3) },
    ],
  },
  'Nexys A7 (reset button, scalar segments, 8 digits)': {
    board: NEXYS_A7_BOARD_IO,
    designs: NEXYS_A7_DESIGN,
    steps: [
      { stim: '1000000000000000' + '00001' + '1', state: '1000000000000011' + ONE_WITH_POINT_OFF + OFF_8.repeat(7) },
      { stim: '1000000000000000' + '00001' + '0', state: '1000000000000001' + ONE_WITH_POINT_OFF + OFF_8.repeat(7) },
    ],
  },
};

/** Basys 3 with other counts, as the frontend's starter tests make it. */
const withCounts = (switches: number, leds: number): BoardIo => ({
  ...BASYS3_BOARD_IO,
  switches: { port: 'sw', count: switches },
  leds: { port: 'led', count: leds },
});

/** The boards the frontend writes a starter top for, by fixture name. */
const STARTER_BOARDS: ReadonlyArray<[string, BoardIo]> = [
  ...['default', 'de1-soc', 'de10-lite', 'basys3', 'nexys-a7'].map((id): [string, BoardIo] => [id, boardFromFrame(id)]),
  ['sw16-led8', withCounts(16, 8)],
  ['sw8-led16', withCounts(8, 16)],
];

/** Every switch up, every button and the reset button released. */
function allSwitchesUp(board: BoardIo): string {
  const released = (activeLow: boolean): string => (activeLow ? '1' : '0');
  return stimFields(board)
    .map((field) => {
      if (field.role === 'switches') return '1'.repeat(field.width);
      if (field.role === 'buttons') return released(board.pushbuttons.activeLow).repeat(field.width);
      return released(board.resetButton?.activeLow ?? true);
    })
    .join('');
}

/** What a starter shows with every switch up: as many LEDs lit as there are switches, the displays off. */
function starterState(board: BoardIo): string {
  const lit = Math.min(board.switches.count, board.leds.count);
  const segmentOff = board.sevenSegment.activeLow ? '1' : '0';
  return stateFields(board)
    .map((field) => (field.role === 'leds' ? '0'.repeat(field.width - lit) + '1'.repeat(lit) : segmentOff.repeat(field.width)))
    .join('');
}

async function untilState(client: WsTestClient, bits: string): Promise<void> {
  await client.until((frame) => frame.verb === 'STATE' && frame.bits === bits, STATE_WAIT_MS);
}

describe('Boards of other shapes', { skip }, () => {
  let backend: TestBackend;

  before(async () => {
    backend = await startTestBackend({ ghdlExe: ghdl.exe ?? undefined, ...backendOptionsFor(icarus.tools) });
  });

  after(() => backend.stop());

  const withSession = (body: (client: WsTestClient) => Promise<void>) => withSessionOn(backend.port, body);

  /** Runs `design` on `board`, then plays `steps`. */
  const playOn = (board: BoardIo, design: ShapeDesign, steps: readonly Step[]) =>
    withSession(async (client) => {
      client.board(board);
      await startRun(client, [design], design.name);
      for (const step of steps) {
        client.stim(step.stim);
        await untilState(client, step.state);
      }
    });

  for (const language of LANGUAGES) {
    for (const [name, { board, designs, steps }] of Object.entries(CASES)) {
      test(`${name} (${language}): switches, buttons and display 0`, () => playOn(board, designs[language], steps));
    }

    test(`a 4-digit refresh from CLOCK_500Hz shows four stable digits, dark 75 ms after it stops (${language})`, () =>
      withSession(async (client) => {
        const design = BASYS3_REFRESH_DESIGN[language];
        const leds = '0'.repeat(16);
        client.board(BASYS3_BOARD_IO);
        await startRun(client, [design], design.name);
        client.stim(`${'0'.repeat(15)}1${'00000'}`);
        await untilState(client, leds + '11000000' + '11111001' + '10100100' + '10110000');
        client.stim('0'.repeat(21));
        await untilState(client, leds + OFF_8.repeat(4));
      }));

    test(`an undriven digit enable shows that display as X (${language})`, () =>
      withSession(async (client) => {
        const design =
          language === 'vhdl'
            ? { name: 'undriven.vhdl', content: 'library ieee;\nuse ieee.std_logic_1164.all;\nentity undriven is\n  port (seg : out std_logic_vector(6 downto 0); an : out std_logic_vector(3 downto 0));\nend entity;\narchitecture rtl of undriven is\nbegin\n  seg <= "0000000";\nend architecture;\n' }
            : { name: 'undriven.v', content: 'module undriven(output wire [6:0] seg, output wire [3:0] an);\n  assign seg = 7\'b0;\nendmodule\n' };
        client.board(BASYS3_BOARD_IO);
        await startRun(client, [design], design.name);
        await untilState(client, '0'.repeat(16) + 'X'.repeat(32));
      }));

    test(`a multiplexed display without a decimal point has 7-bit words (${language})`, () =>
      withSession(async (client) => {
        const design =
          language === 'vhdl'
            ? { name: 'nopoint.vhdl', content: 'library ieee;\nuse ieee.std_logic_1164.all;\nentity nopoint is\n  port (SEG : out std_logic_vector(6 downto 0); AN : out std_logic_vector(3 downto 0));\nend entity;\narchitecture rtl of nopoint is\nbegin\n  SEG <= "1111001";\n  AN <= "1110";\nend architecture;\n' }
            : { name: 'nopoint.v', content: 'module nopoint(output wire [6:0] SEG, output wire [3:0] AN);\n  assign SEG = 7\'b1111001;\n  assign AN = 4\'b1110;\nendmodule\n' };
        client.board(MUX_NO_POINT_BOARD_IO);
        await startRun(client, [design], design.name);
        await untilState(client, '0'.repeat(8) + '1111001' + '1111111'.repeat(3));
      }));
  }

  for (const [id, board] of STARTER_BOARDS) {
    for (const [language, extension] of [['vhdl', 'vhdl'], ['verilog', 'v']] as const) {
      test(`the generated starter top of ${id} runs (${language}): the LEDs follow the switches, the displays are off`, () =>
        playOn(board, starterTop(id, extension), [{ stim: allSwitchesUp(board), state: starterState(board) }]));
    }
  }

  test('a VHDL switch port of the old width is refused before elaboration, with the declaration to write', () =>
    withSession(async (client) => {
      const source = 'library ieee;\nuse ieee.std_logic_1164.all;\nentity old is\n  port (SW : in std_logic_vector(9 downto 0); led : out std_logic_vector(15 downto 0));\nend entity;\narchitecture rtl of old is\nbegin\n  led <= (others => \'0\');\nend architecture;\n';
      client.board(BASYS3_BOARD_IO);
      client.run([{ name: 'old.vhdl', content: source }], 'old.vhdl');
      const error = await client.until((frame) => frame.verb === 'ERROR', STATE_WAIT_MS);
      assert.ok(error.verb === 'ERROR' && error.stage === 'elaborate');
      assert.match(error.text, /old\.vhdl:4:9:error: SW is declared as std_logic_vector\(9 downto 0\) \(10 bits\), but the board has 16 switches\./);
      assert.match(error.text, /Expected: sw : in std_logic_vector\(15 downto 0\);/);
    }));

  test('a STIM of the wrong length for the board is refused, naming its fields', () =>
    withSession(async (client) => {
      const design = BASYS3_DESIGN.vhdl;
      client.board(BASYS3_BOARD_IO);
      await startRun(client, [design], design.name);
      client.stim('0'.repeat(14));
      const error = await client.until((frame) => frame.verb === 'ERROR');
      assert.deepEqual(error, { verb: 'ERROR', stage: 'protocol', text: 'STIM needs 21 bits for this board (switches 16 + buttons 5), got 14.' });
    }));
});
