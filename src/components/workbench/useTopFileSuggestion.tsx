// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import { useState, type ReactNode } from 'react';
import type { Setting } from './settings/settingsSections';
import { TopFileChip } from './TopFileChip';
import { TopFileDialog } from './TopFileDialog';
import {
  NO_DECLINED_FILES, topFileSuggestion, type DeclinedFiles, type MarkedProject, type TopFileSuggestion, type TopUnit,
} from './topFileSuggestion';

export interface TopFileSuggestionOptions {
  /** Settings › General › *Suggest the Top-File*. */
  readonly hint: Setting<boolean>;
  readonly topFileId: string | null;
  /** The unit of the Top-File that Start runs, when one was chosen. */
  readonly topUnit: string | null;
  /** What Start runs as things are; null when no file is the Top-File. */
  readonly topFileName: string | null;
  /** The file in the editor's focused pane. */
  readonly shownFileId: string | null;
  /** The active board's own port names, lower case (`portKeysOf`). */
  readonly boardPorts: ReadonlySet<string>;
  /** As the code reads at this render: for showing the chip. */
  readonly shownProject: MarkedProject;
  /** As the code reads this moment, the analysis flushed: for every decision, the chip's click too. */
  readonly projectNow: () => MarkedProject;
  /** A run compiles or runs: the Top-File cannot change, so nothing is offered. */
  readonly simulating: boolean;
  /** Make the unit top without running it: the chip. */
  readonly onMakeTop: (unit: TopUnit) => void;
  /** Start as it always did: the Top-File, or the backend's choice without one. */
  readonly onStartTop: () => void;
  /** Make the unit top and run exactly that unit, as a pane's Play does. */
  readonly onStartUnit: (unit: TopUnit) => void;
}

export interface TopFileSuggestionApi {
  /** Start: runs at once, or first asks whether the file on screen should be the Top-File. */
  readonly start: () => void;
  /** For the rightmost pane header; null when there is nothing to offer. */
  readonly chip: ReactNode;
  readonly dialog: ReactNode;
}

/**
 * Offers the file on screen as the Top-File, at Start and in the pane header
 * (topFileSuggestion.ts). A file the student keeps off the Top-File, with *Start lab1.vhd*
 * or the chip's ×, is not offered again until the Top-File changes; that is never stored.
 */
export function useTopFileSuggestion(options: TopFileSuggestionOptions): TopFileSuggestionApi {
  const declined = useDeclinedFiles(options.topFileId);
  const [asked, setAsked] = useState<TopFileSuggestion | null>(null);
  const { boardPorts, shownFileId, topFileId, topUnit } = options;
  const suggestionIn = (marked: MarkedProject) =>
    topFileSuggestion({ ...marked, boardPorts, shownFileId, topFileId, topUnit, declined: declined.files });
  const isOffering = options.hint.value && !options.simulating;

  const start = () => {
    const suggestion = isOffering ? suggestionIn(options.projectNow()) : null;
    if (suggestion) setAsked(suggestion);
    else options.onStartTop();
  };
  // The chip shows what the last analysis found; a click acts only if the code as it reads now still agrees.
  const makeTopIfStillSuggested = (shown: TopFileSuggestion) => {
    const now = suggestionIn(options.projectNow());
    if (now && isSameUnit(now, shown)) options.onMakeTop(now);
  };
  const chipSuggestion = isOffering && asked === null ? suggestionIn(options.shownProject) : null;
  return {
    start,
    chip: chipSuggestion && (
      <TopFileChip
        suggestion={chipSuggestion}
        onMakeTop={() => makeTopIfStillSuggested(chipSuggestion)}
        onDismiss={() => declined.add(chipSuggestion.fileId)}
      />
    ),
    dialog: asked && (
      <Question
        suggestion={asked}
        topFileName={options.topFileName}
        onStartSuggested={options.onStartUnit}
        onStartTop={options.onStartTop}
        onDecline={declined.add}
        onStopAsking={() => options.hint.onChange(false)}
        onClose={() => setAsked(null)}
      />
    ),
  };
}

interface QuestionProps {
  readonly suggestion: TopFileSuggestion;
  readonly topFileName: string | null;
  readonly onStartSuggested: (unit: TopUnit) => void;
  readonly onStartTop: () => void;
  /** Keeps the file off the Top-File until the Top-File changes. */
  readonly onDecline: (fileId: string) => void;
  readonly onStopAsking: () => void;
  readonly onClose: () => void;
}

/** The question at Start: each answer closes it first, then starts what was chosen. */
function Question({ suggestion, topFileName, onStartSuggested, onStartTop, onDecline, onStopAsking, onClose }: QuestionProps) {
  return (
    <TopFileDialog
      suggestion={suggestion}
      topFileName={topFileName}
      onMakeTopAndStart={() => {
        onClose();
        onStartSuggested(suggestion);
      }}
      onStartAsItIs={() => {
        onClose();
        onDecline(suggestion.fileId);
        onStartTop();
      }}
      onStopAsking={onStopAsking}
      onClose={onClose}
    />
  );
}

interface Declined {
  readonly files: DeclinedFiles;
  readonly add: (fileId: string) => void;
}

/**
 * The files declined since the Top-File last changed. Every change starts the list
 * afresh, a change back to an earlier Top-File too: the list is dropped as the change
 * is rendered, not compared with the Top-File it was made under.
 */
function useDeclinedFiles(topFileId: string | null): Declined {
  const [declined, setDeclined] = useState({ topFileId, files: NO_DECLINED_FILES });
  const isTopChanged = declined.topFileId !== topFileId;
  if (isTopChanged) setDeclined({ topFileId, files: NO_DECLINED_FILES });
  const files = isTopChanged ? NO_DECLINED_FILES : declined.files;
  return { files, add: (fileId) => setDeclined({ topFileId, files: files.with(fileId) }) };
}

const isSameUnit = (a: TopUnit, b: TopUnit): boolean => a.fileId === b.fileId && a.unitName === b.unitName;
