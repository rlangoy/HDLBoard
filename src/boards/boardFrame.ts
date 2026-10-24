// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * The `BOARD` frame (docs/board_io_config_spec.md § 8.1): the board's port names, one
 * line per role, sent before every `RUN`. Keep in step with `decodeBoardBody` in
 * server/src/boardFrame.ts — the two packages share no code, so both test the same
 * literal Default frame text.
 */

import { BOARD_ROLES, type BoardPorts } from './types';

export const BOARD_VERB = 'BOARD';

function roleLine(role: (typeof BOARD_ROLES)[number], ports: BoardPorts): string {
  const names = role === 'sevenSegment' ? ports.sevenSegment : [ports[role]];
  return `${role} ${names.join(' ')}`;
}

export function encodeBoardFrame(ports: BoardPorts): string {
  return [BOARD_VERB, ...BOARD_ROLES.map((role) => roleLine(role, ports))].join('\n');
}
