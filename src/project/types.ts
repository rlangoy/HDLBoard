// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * Project file data model (docs/Impl_project_file_and_online_storage.md § 4).
 * Everything in `src/project/` is plain TypeScript: no React, no HDLBoard.
 */

export const PROJECT_FILE_EXTENSION = '.hdlboard.json';
/**
 * 1: `board` was a display name, and every version-1 file used the Default board's
 * names, whatever it said. 2: `board` is a board id (docs/board_io_config_spec.md § 10).
 */
export const SUPPORTED_PROJECT_VERSIONS: readonly number[] = [1, 2];
/** What a project file is written as. */
export const CURRENT_PROJECT_VERSION = 2;
/** The board a version-1 project file opens on (`src/boards`' DEFAULT_BOARD_ID; `src/project` imports no HDLBoard code). */
export const VERSION_1_BOARD_ID = 'default';
/** Where a project's HDL files are kept inside its project folder, unless it says otherwise (D3). */
export const DEFAULT_SOURCE_DIRECTORY = 'src';

export interface ProjectFileEntry {
  /** File name in the project directory, no path separators (§ 5.1). */
  name: string;
  /** Absolute http(s) URL, or "" when the file is not stored/synced to a URL. */
  url: string;
  description: string;
}

export interface HdlBoardProject {
  version: number;
  name: string;
  /** The board's id (`default`, `de1-soc`); one HDLBoard does not have here is kept as it is. */
  board: string;
  /** Raw version-2 board node saved with this project, including extension fields. */
  boardConfig?: Record<string, unknown>;
  description: string;
  /**
   * The folder next to the project file that holds the project's files on local disk
   * (docs/impl_project_structure.md). Undefined when the file leaves it out or names an
   * invalid folder: the project file name without `.hdlboard.json` is used then.
   */
  projectDirectory?: string;
  /** The folder inside `projectDirectory` for the HDL files; undefined → `src`. */
  sourceDirectory?: string;
  files: ProjectFileEntry[];
  /** How the waveform view of each testbench was set up, by testbench name (waveViews.ts); undefined → none saved. */
  waveViews?: SavedWaveViews;
  displaySettings?: DisplaySettings;
}

export interface IoDisplaySettings {
  groupSize: 4 | 8 | null;
  visible: number[];
  visibilityCount?: number;
  readouts: { binary: boolean; hexadecimal: boolean; decimal: boolean };
}

/** How the Board pane's pushbuttons behave: ideal contacts, or contacts that bounce as real ones do. */
export type ButtonBounce = 'none' | 'bouncy';

export const BUTTON_BOUNCES: readonly ButtonBounce[] = ['none', 'bouncy'];

/** The panels of the Board pane, by the name their settings have in `DisplaySettings`. */
export type BoardPanel = 'leds' | 'sevenSegment' | 'switches' | 'pushbuttons';

export const BOARD_PANELS: readonly BoardPanel[] = ['leds', 'sevenSegment', 'switches', 'pushbuttons'];

export interface DisplaySettings {
  leds?: IoDisplaySettings;
  switches?: IoDisplaySettings;
  sevenSegment?: { visible: number[]; visibilityCount?: number };
  /** Absent: `none`, the buttons as they always were. */
  pushbuttons?: { bounce: ButtonBounce };
  /** The panels in the order the student dragged them into, every panel once; absent: the layout's own order. */
  panelOrder?: BoardPanel[];
}

/** One signal of a saved waveform view. Among the shown, its order in the list is its place in the view. */
export interface SavedWaveSignal {
  /** Below the testbench: `clk`, `dut/count`, `pair/a`. */
  path: string;
  /** "Show as", when the student chose one: `hex`, `decimal`, `ascii`, `binary`. */
  showAs?: string;
  /** A vector shown with its bits unfolded. */
  expanded?: boolean;
}

/** The waveform view of one testbench: the signals shown, in their order (docs/imp_wave_rearange.md § 11). */
export interface SavedWaveView {
  signals: SavedWaveSignal[];
  /** Signals not shown that keep a "Show as" or an unfolded vector for when they are ticked again. */
  notShown?: SavedWaveSignal[];
}

/** Saved waveform views by testbench name, `counter_tb`. */
export type SavedWaveViews = Record<string, SavedWaveView>;

export type Severity = 'error' | 'warning' | 'info';

export interface Diagnostic {
  severity: Severity;
  message: string;
  /** The project file entry the diagnostic is about, if any. */
  fileName?: string;
}

/** A file entry that validation rejected, kept so the UI can list it as "skipped". */
export interface SkippedEntry {
  name: string;
  reason: string;
}
