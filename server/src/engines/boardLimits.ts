// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * How big a board may be (docs/board_io_v2_spec.md D9): the backend's copy of
 * src/boards/boardLimits.ts. The backend checks every board it receives against these
 * itself; the two packages share no code.
 */

export interface CountLimit {
  readonly min: number;
  readonly max: number;
}

export const SWITCH_LIMIT: CountLimit = { min: 1, max: 18 };
export const LED_LIMIT: CountLimit = { min: 1, max: 18 };
export const BUTTON_LIMIT: CountLimit = { min: 1, max: 8 };
export const DISPLAY_LIMIT: CountLimit = { min: 1, max: 8 };

/** Segments a … g; the decimal point is an eighth bit on boards that have one. */
export const SEGMENT_COUNT = 7;
export const SEGMENT_COUNT_WITH_POINT = 8;

/** The longest `STIM` any board sends: every switch, every button and a reset button. */
export const MAX_STIM_BITS = SWITCH_LIMIT.max + BUTTON_LIMIT.max + 1;
/** The longest `STATE` any board publishes: every LED and every display with its point. */
export const MAX_STATE_BITS = LED_LIMIT.max + DISPLAY_LIMIT.max * SEGMENT_COUNT_WITH_POINT;

export const CLOCK_MHZ_LIMIT: CountLimit = { min: 1, max: 1000 };
export const CLOCK_MHZ_DECIMALS = 3;
