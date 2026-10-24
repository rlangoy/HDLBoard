// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/** Boards for tests besides the Default one (docs/board_io_config_spec.md § 4.2). */

import type { BoardIo } from '../engines/boardPorts.js';

/** Terasic's names, as the frontend's built-in DE1-SoC board sends them. */
export const DE1_SOC_BOARD_IO: BoardIo = {
  clock50: 'CLOCK_50',
  clock500Hz: 'CLOCK_500Hz',
  switches: 'SW',
  pushbuttons: 'KEY',
  leds: 'LEDR',
  sevenSegment: ['HEX0', 'HEX1', 'HEX2', 'HEX3', 'HEX4', 'HEX5'],
};
