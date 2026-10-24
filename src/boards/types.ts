// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * The board vocabulary (docs/board_io_config_spec.md § 4.3, § 6.2). A board maps each
 * fixed role (the switches, the pushbuttons, …) to the port name(s) a design declares
 * for it. Inside HDLBoard everything is keyed by role; names exist only at the edges:
 * the student's source and the board file. Plain TypeScript, no React.
 */

export const BOARD_ROLES = ['clock50', 'clock500Hz', 'switches', 'pushbuttons', 'leds', 'sevenSegment'] as const;
export type BoardRole = (typeof BOARD_ROLES)[number];

export interface BoardPorts {
  readonly clock50: string;
  readonly clock500Hz: string;
  readonly switches: string;
  readonly pushbuttons: string;
  readonly leds: string;
  /** Display 0 (rightmost) first; exactly SEVEN_SEGMENT_COUNT names. */
  readonly sevenSegment: readonly string[];
}

/** The roles with a part on the board, and so a silkscreen label. */
export const LABELLED_ROLES = ['switches', 'pushbuttons', 'leds', 'sevenSegment'] as const;
export type LabelledRole = (typeof LABELLED_ROLES)[number];
export type BoardLabels = Readonly<Record<LabelledRole, string>>;

export interface BoardDefinition {
  /** A lower-case slug (`de1-soc`); what a project file stores. */
  readonly id: string;
  /** What the student reads: `DE1-SoC`. */
  readonly name: string;
  readonly description: string;
  readonly ports: BoardPorts;
  /** Always complete: parseBoardFile fills in DEFAULT_LABELS. */
  readonly labels: BoardLabels;
  readonly origin: 'built-in' | 'user';
}

export interface BoardCatalog {
  readonly boards: readonly BoardDefinition[];
  /** Problems found in the user's board file, for the Settings dialog (§ 3.2). */
  readonly warnings: readonly string[];
}

/** A board file, parsed: its valid boards, and one warning per problem. */
export interface ParsedBoards {
  readonly boards: readonly BoardDefinition[];
  readonly warnings: readonly string[];
}
