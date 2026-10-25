// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * How big a board may be (docs/board_io_v2_spec.md D9). Implementation constants, not
 * part of the file format: raising one later is a one-line change here (and in
 * server/src/engines/boardLimits.ts, the backend's copy).
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
/** The longest `STATE` any board receives: every LED and every display with its point. */
export const MAX_STATE_BITS = LED_LIMIT.max + DISPLAY_LIMIT.max * SEGMENT_COUNT_WITH_POINT;

export const CLOCK_MHZ_LIMIT: CountLimit = { min: 1, max: 1000 };
/** `74.25` is a valid frequency; `74.2501` is not. */
export const CLOCK_MHZ_DECIMALS = 3;

/**
 * A multiplexed digit not refreshed for this long goes dark (§ 7.4). Decided by the
 * generated testbench (server/src/engines/boardTiming.ts); here for Help's text.
 */
export const DISPLAY_PERSIST_MS = 75;

/** At most one line of links in a Settings row (D8). */
export const MAX_RESOURCES = 4;
export const MAX_RESOURCE_LABEL_LENGTH = 32;
export const MAX_RESOURCE_URL_LENGTH = 512;
