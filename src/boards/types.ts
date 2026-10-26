// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * The board vocabulary (docs/board_io_v2_spec.md § 4). A board maps each role (the
 * switches, the pushbuttons, …) to the port name(s) a design declares for it, and says
 * how many parts it has and their polarity. Only the parser knows the file's
 * alternatives; everything else reads this one normalized model. Plain TypeScript, no React.
 */

import type { SEGMENT_COUNT, SEGMENT_COUNT_WITH_POINT } from './boardLimits';

/** A vector port, or scalar ports read as one vector (index 0 = first scalar = bit 0). */
export type PortGroup =
  | { readonly kind: 'vector'; readonly port: string; readonly count: number }
  | { readonly kind: 'scalars'; readonly ports: readonly string[] };

export interface VectorPort {
  readonly port: string;
  readonly count: number;
}

export type ButtonLayout = 'row' | 'cross';

export interface ButtonGroup {
  /** A cross is scalars in the order centre, up, left, right, down. */
  readonly group: PortGroup;
  readonly activeLow: boolean;
  /** How the Board pane draws them; never sent to the backend. */
  readonly layout: ButtonLayout;
}

export interface ResetButton {
  readonly port: string;
  readonly activeLow: boolean;
}

export interface IndependentDisplays {
  readonly kind: 'independent';
  /** Display 0 (rightmost) first. */
  readonly ports: readonly string[];
  /** 8 when bit 7 is the decimal point. */
  readonly width: typeof SEGMENT_COUNT | typeof SEGMENT_COUNT_WITH_POINT;
  readonly activeLow: boolean;
}

export interface MultiplexedDisplays {
  readonly kind: 'multiplexed';
  /** 7 bits, a … g. */
  readonly segments: PortGroup;
  readonly decimalPoint?: string;
  /** A vector of `digits` bits, bit 0 = display 0. */
  readonly digitEnables: string;
  readonly digits: number;
  readonly activeLow: boolean;
  readonly digitEnablesActiveLow: boolean;
}

export type SevenSegment = IndependentDisplays | MultiplexedDisplays;

export interface BoardClock {
  readonly port: string;
  readonly mhz: number;
}

export interface BoardPorts {
  readonly clock: BoardClock;
  /** Simulator-only, on every board; always set after parsing. */
  readonly clock500Hz: string;
  /** Absent JSON role: count 0 and no port name. */
  readonly switches: VectorPort;
  /** Absent JSON role: an empty scalar group. */
  readonly pushbuttons: ButtonGroup;
  readonly resetButton?: ResetButton;
  readonly leds: VectorPort;
  /** Absent JSON role: an independent display group with no ports. */
  readonly sevenSegment: SevenSegment;
}

/** The roles with a part on the board, and so a silkscreen label. */
export const LABELLED_ROLES = ['switches', 'pushbuttons', 'leds', 'sevenSegment'] as const;
export type LabelledRole = (typeof LABELLED_ROLES)[number];
export type BoardLabels = Readonly<Record<LabelledRole, string>>;

/** A link to a board's design resources, shown in Settings › Board (D8). */
export interface BoardResource {
  readonly label: string;
  /** Always `https://`. */
  readonly url: string;
}

export interface BoardDefinition {
  /** A lower-case slug (`de1-soc`); what a project file stores. */
  readonly id: string;
  /** What the student reads: `DE1-SoC`. */
  readonly name: string;
  readonly description: string;
  readonly ports: BoardPorts;
  /** Always complete: parseBoardFile fills in DEFAULT_LABELS. */
  readonly labels: BoardLabels;
  /** Empty when the board has none. */
  readonly resources: readonly BoardResource[];
  readonly origin: 'built-in' | 'user';
}

export interface BoardCatalog {
  readonly boards: readonly BoardDefinition[];
  /** Problems found in the user's board file, for the Settings dialog. */
  readonly warnings: readonly string[];
}

/** A board file, parsed: its valid boards, and one warning per problem. */
export interface ParsedBoards {
  readonly boards: readonly BoardDefinition[];
  readonly warnings: readonly string[];
}
