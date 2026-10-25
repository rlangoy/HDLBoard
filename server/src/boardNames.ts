// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * The identifier rule for board port names (docs/board_io_config_spec.md § 9.2): the
 * security boundary between a `BOARD` frame and a generated testbench.
 */

import { LEGACY_RESET_PORT } from './engines/boardPorts.js';

const PLAIN_IDENTIFIER = /^[A-Za-z](?:_?[A-Za-z0-9])*$/;
const MAX_NAME_LENGTH = 32;

/** Why `name` cannot be a board port name, or undefined when it can. */
export function nameProblem(name: string): string | undefined {
  if (!PLAIN_IDENTIFIER.test(name)) return `${JSON.stringify(name)} is not a plain identifier`;
  if (name.length > MAX_NAME_LENGTH) return `${JSON.stringify(name)} is longer than ${MAX_NAME_LENGTH} characters`;
  if (name.toLowerCase() === LEGACY_RESET_PORT) return `"${LEGACY_RESET_PORT}" is reserved`;
  return undefined;
}
