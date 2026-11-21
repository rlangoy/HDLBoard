// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * Every string of the Top-File suggestion: the question at Start, the pane header's
 * chip and the setting. Written for a student who has never heard the word "top-level":
 * it says what the Top-File does, why this unit looks like one, and where to change it.
 * English; one file is all a later translation needs. Pure.
 */

import type { BoardDesignSuggestion, TestbenchSuggestion, TopFileSuggestion } from './topFileSuggestion';

export const TOP_FILE_TEXT = {
  whereToChangeIt: 'You can change the Top-File any time with the dot beside a file name in Files.',
  cancel: 'Cancel',
  dontAskAgain: "Don't ask me again",
  turnBackOn: 'Turn it back on in Settings › General.',
  makeTop: 'Make Top-File',
  dismiss: 'Not now',
  settingTitle: 'Top-File',
  settingLabel: 'Suggest the Top-File',
  settingDescription:
    'When the file you are working on looks like the Top-File (a design that uses the board’s I/O, or a testbench) ' +
    'but is not it, Start asks whether to run it instead, and its pane offers to make it the Top-File.',
} as const;

/** What each kind of offer says: what a Top-File of that kind does, and why this unit is one. */
interface KindText<S extends TopFileSuggestion> {
  readonly whatTheTopFileIs: string;
  readonly evidence: (suggestion: S) => string;
}

const BOARD_DESIGN_TEXT: KindText<BoardDesignSuggestion> = {
  whatTheTopFileIs: "Start runs the Top-File: the design wired to the board's switches, buttons, LEDs and displays.",
  evidence: ({ fileName, unitKind, unitName, boardPorts }) =>
    `${fileName} (${unitKind} ${unitName}) uses ${wordList(boardPorts)}, so it looks like one.`,
};

const TESTBENCH_TEXT: KindText<TestbenchSuggestion> = {
  whatTheTopFileIs:
    'Start runs the Top-File. A testbench as the Top-File runs without the board: it drives its design itself, ' +
    'and you see the result in Simulator Output and the waveform.',
  evidence: ({ fileName, unitKind, unitName, dutName }) =>
    `${fileName} (${unitKind} ${unitName}) is a testbench${dutName === null ? '' : ` for ${dutName}`}.`,
};

/** The text of the suggestion's own kind. */
function textOf(suggestion: TopFileSuggestion): { readonly whatTheTopFileIs: string; readonly evidence: string } {
  return suggestion.kind === 'testbench'
    ? { whatTheTopFileIs: TESTBENCH_TEXT.whatTheTopFileIs, evidence: TESTBENCH_TEXT.evidence(suggestion) }
    : { whatTheTopFileIs: BOARD_DESIGN_TEXT.whatTheTopFileIs, evidence: BOARD_DESIGN_TEXT.evidence(suggestion) };
}

/** "Start runs the Top-File: …", as the kind of Top-File offered works. */
export const whatTheTopFileIs = (suggestion: TopFileSuggestion): string => textOf(suggestion).whatTheTopFileIs;

/** Why it looks like the Top-File: "lab2.vhd (entity lab2) uses SW and LEDR, so it looks like one." */
export const looksLikeTheTop = (suggestion: TopFileSuggestion): string => textOf(suggestion).evidence;

/** `label` is the file, or `file › unit` when the file holds more than one unit. */
export const makeTopTitle = (label: string): string => `Make ${label} the Top-File?`;

/** What Start runs as things are; null when no file is the Top-File. */
export const whatStartRunsNow = (topFileName: string | null): string =>
  topFileName === null ? 'No file is the Top-File yet.' : `Now Start would run ${topFileName}.`;

export const makeTopAndStart = (label: string): string => `Make ${label} the Top-File and start`;

/** The button that leaves the Top-File as it is; null when there is none. */
export const startAsItIs = (topFileName: string | null): string =>
  topFileName === null ? 'Start without a Top-File' : `Start ${topFileName}`;

/** The chip's button for a screen reader, which does not see its tooltip. */
export const makeTopLabel = (label: string): string => `Make ${label} the Top-File`;

export const chipTitle = (suggestion: TopFileSuggestion): string => `${looksLikeTheTop(suggestion)} ${whatTheTopFileIs(suggestion)}`;

/** "SW", "SW and LEDR", "SW, KEY and LEDR". */
function wordList(words: readonly string[]): string {
  if (words.length < 2) return words.join('');
  return `${words.slice(0, -1).join(', ')} and ${words[words.length - 1]}`;
}
