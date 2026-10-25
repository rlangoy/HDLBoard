// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { decodeBoardBody, encodeBoardBody } from './boardFrame.js';
import { DEFAULT_BOARD_IO } from './engines/boardPorts.js';
import { decodeClientFrame, encodeClientFrame } from './protocol.js';
import { BOARD_FRAMES, DE1_SOC_BOARD_IO } from './testSupport/boards.js';

/**
 * The literal Default `BOARD` frame of protocol 2, which a 1.6 client still sends. The
 * same text is in src/boards/boards.test.ts: the two packages share no code, so this
 * text is their contract.
 */
const DEFAULT_BOARD_FRAME = `BOARD
clock50 CLOCK_50
clock500Hz CLOCK_500Hz
switches SW
pushbuttons KEY_N
leds LEDR
sevenSegment HEX0_N HEX1_N HEX2_N HEX3_N HEX4_N HEX5_N`;

const DE1_BODY = [
  'clock50 CLOCK_50',
  'clock500Hz CLOCK_500Hz',
  'switches SW',
  'pushbuttons KEY',
  'leds LEDR',
  'sevenSegment HEX0 HEX1 HEX2 HEX3 HEX4 HEX5',
];

/** The DE1-SoC body with one line replaced, or `undefined` to drop it. */
function withLine(index: number, line: string | undefined): string {
  const lines = [...DE1_BODY];
  if (line === undefined) lines.splice(index, 1);
  else lines[index] = line;
  return lines.join('\n');
}

function reasonOf(body: string): string {
  const decoded = decodeBoardBody(body);
  assert.ok(!decoded.ok, 'expected the board to be rejected');
  return decoded.reason;
}

describe('the BOARD frame', () => {
  test('decodes the literal Default frame the frontend sends', () => {
    assert.deepEqual(decodeClientFrame(DEFAULT_BOARD_FRAME), { verb: 'BOARD', board: { ok: true, board: DEFAULT_BOARD_IO } });
  });

  test('encodes the Default board as the JSON frame the frontend sends', () => {
    assert.equal(encodeClientFrame({ verb: 'BOARD', board: { ok: true, board: DEFAULT_BOARD_IO } }), `BOARD
${BOARD_FRAMES.default}`);
  });

  test('decodes the DE1-SoC names', () => {
    assert.deepEqual(decodeBoardBody(DE1_BODY.join('\n')), { ok: true, board: DE1_SOC_BOARD_IO });
  });

  test('decodes an invalid board to the BOARD verb too, so the session learns of it', () => {
    const frame = decodeClientFrame('BOARD\nswitches SW');
    assert.ok(!('message' in frame) && frame.verb === 'BOARD' && !frame.board.ok);
  });

});

describe('decodeBoardBody rejects, sent as raw protocol text', () => {
  const cases: Array<[string, string, string]> = [
    ['a missing role', withLine(1, undefined), 'clock500Hz is missing'],
    ['a role given twice', `${DE1_BODY.join('\n')}\nswitches SW`, 'switches is given twice'],
    ['an unknown role', withLine(2, 'buttons SW'), 'unknown role "buttons"'],
    ['5 display names', withLine(5, 'sevenSegment HEX0 HEX1 HEX2 HEX3 HEX4'), 'sevenSegment needs 6 name(s), got 5'],
    ['two names for one port', withLine(2, 'switches SW SW2'), 'switches needs 1 name(s), got 2'],
    ['a semicolon', withLine(3, 'pushbuttons KEY;'), '"KEY;" is not a plain identifier'],
    ['a parenthesis', withLine(3, 'pushbuttons KEY)'), '"KEY)" is not a plain identifier'],
    ['a newline inside a name', withLine(3, 'pushbuttons KE\nY'), 'unknown role "Y"'],
    ['a comment marker', withLine(3, 'pushbuttons KEY--x'), 'is not a plain identifier'],
    ['the legacy rst', withLine(3, 'pushbuttons RST'), '"rst" is reserved'],
    ['Key and KEY in one board', withLine(2, 'switches Key'), '"KEY" is used twice (names ignore case)'],
    ['a name that is too long', withLine(2, `switches ${'S'.repeat(33)}`), 'is longer than 32 characters'],
  ];
  for (const [what, body, reason] of cases) {
    test(what, () => {
      assert.ok(reasonOf(body).includes(reason), reasonOf(body));
      assert.ok(reasonOf(body).startsWith('BOARD: '));
    });
  }

  test('inline arguments on the head line', () => {
    const frame = decodeClientFrame(`BOARD de1-soc\n${DE1_BODY.join('\n')}`);
    assert.ok(!('message' in frame) && frame.verb === 'BOARD' && !frame.board.ok);
  });

  test('but lets a reserved word through: the testbench then fails to compile, which is safe and visible', () => {
    assert.ok(decodeBoardBody(withLine(2, 'switches signal')).ok);
  });
});

describe('the JSON BOARD body (docs/board_io_v2_spec.md § 6.1)', () => {
  test('decodes every shared fixture, and encodes it back to the same text', () => {
    for (const [id, body] of Object.entries(BOARD_FRAMES)) {
      const decoded = decodeBoardBody(body);
      assert.ok(decoded.ok, `${id}: ${decoded.ok ? '' : decoded.reason}`);
      assert.equal(encodeBoardBody(decoded.board), body, id);
    }
  });

  test('decodes the Default fixture to DEFAULT_BOARD_IO (guard: the two copies agree)', () => {
    assert.deepEqual(decodeBoardBody(BOARD_FRAMES.default), { ok: true, board: DEFAULT_BOARD_IO });
  });

  /** The Basys 3 body with one change made to its JSON. */
  function basysWith(change: (board: Record<string, unknown>) => void): string {
    const board = JSON.parse(BOARD_FRAMES.basys3) as Record<string, unknown>;
    change(board);
    return JSON.stringify(board);
  }
  const at = (board: Record<string, unknown>, key: string): Record<string, unknown> => board[key] as Record<string, unknown>;

  const cases: Array<[string, string, string]> = [
    ['version missing', basysWith((b) => delete b.version), 'version must be 2'],
    ['version 3', basysWith((b) => (b.version = 3)), 'version must be 2, got 3'],
    ['a name with a semicolon', basysWith((b) => (at(b, 'switches').port = 'x;y')), '"x;y" is not a plain identifier'],
    ['a name with a newline', basysWith((b) => (at(b, 'leds').port = 'led\nx')), 'is not a plain identifier'],
    ['a name with a quote', basysWith((b) => (b.clock500Hz = 'a"b')), 'is not a plain identifier'],
    ['a scalar name with a parenthesis', basysWith((b) => ((at(at(b, 'pushbuttons'), 'group').ports as string[])[0] = 'btn)')), 'is not a plain identifier'],
    ['19 switches', basysWith((b) => (at(b, 'switches').count = 19)), 'switches.count must be a whole number from 1 to 18'],
    ['9 digits', basysWith((b) => (at(b, 'sevenSegment').digits = 9)), 'sevenSegment.digits must be a whole number from 1 to 8'],
    ['a 6-bit segment vector', basysWith((b) => (at(at(b, 'sevenSegment'), 'segments').count = 6)), 'segments.count must be a whole number from 7 to 7'],
    ['an unknown key', basysWith((b) => (b.layout = 'cross')), 'board.layout is not a field'],
    ['clock MHz 0.5', basysWith((b) => (at(b, 'clock').mhz = 0.5)), 'clock.mhz must be a number from 1 to 1000'],
    ['a polarity that is not a boolean', basysWith((b) => (at(b, 'pushbuttons').activeLow = 'no')), 'pushbuttons.activeLow must be true or false'],
    ['Btnc and btnC in one board', basysWith((b) => (at(b, 'leds').port = 'BTNC')), 'is used twice (names ignore case)'],
    ['the legacy rst', basysWith((b) => (at(b, 'leds').port = 'RST')), '"rst" is reserved'],
    ['a body that is not JSON', '{"version":2,', 'the body is not valid JSON'],
  ];
  for (const [what, body, reason] of cases) {
    test(`rejects ${what}`, () => {
      assert.ok(reasonOf(body).includes(reason), reasonOf(body));
    });
  }
});
