// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * Every string of the Top-File suggestion: the question at Start, the pane header's
 * chip and the setting. Written for a student who has never heard the word "top-level":
 * it says what the Top-File does, why this file looks like one, and where to change it.
 * English; one file is all a later translation needs. Pure.
 */

import type { TopFileSuggestion } from './topFileSuggestion';

export const TOP_FILE_TEXT = {
  whatTheTopFileIs: "Start runs the Top-File: the design wired to the board's switches, buttons, LEDs and displays.",
  whereToChangeIt: 'You can change the Top-File any time with the dot beside a file name in Files.',
  cancel: 'Cancel',
  dontAskAgain: "Don't ask me again",
  turnBackOn: 'Turn it back on in Settings › General.',
  makeTop: 'Make Top-File',
  dismiss: 'Not now',
  settingTitle: 'Top-File',
  settingLabel: 'Suggest the Top-File',
  settingDescription:
    "When the file you are working on uses the board's I/O but is not the Top-File, Start asks whether to run it instead, and its pane offers to make it the Top-File.",
} as const;

export const makeTopTitle = (fileName: string): string => `Make ${fileName} the Top-File?`;

/** The evidence: "lab2.vhd (entity lab2) uses SW and LEDR, so it looks like one." */
export const looksLikeTheTop = ({ fileName, unitKind, unitName, boardPorts }: TopFileSuggestion): string =>
  `${fileName} (${unitKind} ${unitName}) uses ${wordList(boardPorts)}, so it looks like one.`;

/** What Start runs as things are; null when no file is the Top-File. */
export const whatStartRunsNow = (topFileName: string | null): string =>
  topFileName === null ? 'No file is the Top-File yet.' : `Now Start would run ${topFileName}.`;

export const makeTopAndStart = (fileName: string): string => `Make ${fileName} the Top-File and start`;

/** The button that leaves the Top-File as it is; null when there is none. */
export const startAsItIs = (topFileName: string | null): string =>
  topFileName === null ? 'Start without a Top-File' : `Start ${topFileName}`;

/** The chip's button for a screen reader, which does not see its tooltip. */
export const makeTopLabel = (fileName: string): string => `Make ${fileName} the Top-File`;

export const chipTitle = (suggestion: TopFileSuggestion): string =>
  `${looksLikeTheTop(suggestion)} ${TOP_FILE_TEXT.whatTheTopFileIs}`;

/** "SW", "SW and LEDR", "SW, KEY and LEDR". */
function wordList(words: readonly string[]): string {
  if (words.length < 2) return words.join('');
  return `${words.slice(0, -1).join(', ')} and ${words[words.length - 1]}`;
}
