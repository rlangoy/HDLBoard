// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * Boards for tests besides the Default one (docs/board_io_v2_spec.md § 12.2), decoded
 * from the `BOARD` frame texts the frontend's encoder writes
 * (tests/fixtures/boards/board-frames.json) — so a test here runs on exactly the board
 * the frontend sends.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { decodeBoardBody } from '../boardFrame.js';
import type { BoardIo } from '../engines/boardPorts.js';

const FRAMES_FILE = fileURLToPath(new URL('../../../tests/fixtures/boards/board-frames.json', import.meta.url));

/** The frame body of each board, by board id: `default`, `basys3`, `mux-no-point`, …. */
export const BOARD_FRAMES: Readonly<Record<string, string>> = JSON.parse(readFileSync(FRAMES_FILE, 'utf8')) as Record<string, string>;

/** The board a fixture frame describes; a frame that does not decode is a bug in the fixtures. */
export function boardFromFrame(id: string): BoardIo {
  const body = BOARD_FRAMES[id];
  if (body === undefined) throw new Error(`No fixture frame for board "${id}"`);
  const decoded = decodeBoardBody(body);
  if (!decoded.ok) throw new Error(`The fixture frame of "${id}" does not decode: ${decoded.reason}`);
  return decoded.board;
}

/** Terasic's names, as the frontend's built-in DE1-SoC board sends them. */
export const DE1_SOC_BOARD_IO: BoardIo = boardFromFrame('de1-soc');
export const DE10_LITE_BOARD_IO: BoardIo = boardFromFrame('de10-lite');
export const BASYS3_BOARD_IO: BoardIo = boardFromFrame('basys3');
export const NEXYS_A7_BOARD_IO: BoardIo = boardFromFrame('nexys-a7');
/** A multiplexed display with no decimal point: the 7-bit decoder path. */
export const MUX_NO_POINT_BOARD_IO: BoardIo = boardFromFrame('mux-no-point');
/** A 74.25 MHz clock: a half period in picoseconds. */
export const VIDEO_CLOCK_BOARD_IO: BoardIo = boardFromFrame('video-clock');

const STARTERS_DIR = new URL('../../../tests/fixtures/boards/starters/', import.meta.url);

/** The frontend's generated starter top of `id` (src/boards/boardTop.test.ts writes them), its unit called `starter_top`. */
export function starterTop(id: string, extension: 'vhdl' | 'v'): { readonly name: string; readonly content: string } {
  return { name: `starter_top.${extension}`, content: readFileSync(fileURLToPath(new URL(`${id}.${extension}`, STARTERS_DIR)), 'utf8') };
}
