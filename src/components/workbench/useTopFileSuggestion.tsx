// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import { useState, type ReactNode } from 'react';
import type { Setting } from './settings/settingsSections';
import type { ProjectAnalysis, TestbenchOverrides } from './tbDetect/types';
import { TopFileChip } from './TopFileChip';
import { TopFileDialog } from './TopFileDialog';
import { NO_DECLINED_FILES, topFileSuggestion, type DeclinedFiles, type TopFileSuggestion } from './topFileSuggestion';

/** The project as the run decisions read it: the corrected analysis and the student's marks. */
export interface AnalyzedProject {
  readonly project: ProjectAnalysis;
  readonly overrides: TestbenchOverrides;
}

export interface TopFileSuggestionOptions {
  /** Settings › General › *Suggest the Top-File*. */
  readonly hint: Setting<boolean>;
  readonly topFileId: string | null;
  /** What Start runs as things are; null when no file is the Top-File. */
  readonly topFileName: string | null;
  /** The file in the editor's focused pane. */
  readonly shownFileId: string | null;
  readonly boardPorts: ReadonlySet<string>;
  /** As the code reads at this render: for the chip. */
  readonly shownProject: AnalyzedProject;
  /** As the code reads this moment, the analysis flushed: for the decision at Start. */
  readonly projectNow: () => AnalyzedProject;
  /** A run compiles or runs: the Top-File cannot change, so nothing is offered. */
  readonly simulating: boolean;
  readonly onMakeTop: (fileId: string) => void;
  /** Start as it always did: the Top-File, or the backend's choice without one. */
  readonly onStartTop: () => void;
  /** Make the file top and run it, as a pane's Play does. */
  readonly onStartFile: (fileId: string) => void;
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
  const { boardPorts, shownFileId, topFileId } = options;
  const suggestionIn = ({ project, overrides }: AnalyzedProject) =>
    topFileSuggestion({ project, overrides, boardPorts, shownFileId, topFileId, declined: declined.files });
  const isOffering = options.hint.value && !options.simulating;

  const start = () => {
    const suggestion = isOffering ? suggestionIn(options.projectNow()) : null;
    if (suggestion) setAsked(suggestion);
    else options.onStartTop();
  };
  const chipSuggestion = isOffering && asked === null ? suggestionIn(options.shownProject) : null;
  return {
    start,
    chip: chipSuggestion && (
      <TopFileChip suggestion={chipSuggestion} onMakeTop={() => options.onMakeTop(chipSuggestion.fileId)} onDismiss={() => declined.add(chipSuggestion.fileId)} />
    ),
    dialog: asked && <AskedDialog suggestion={asked} options={options} declined={declined} onDone={() => setAsked(null)} />,
  };
}

interface AskedDialogProps {
  readonly suggestion: TopFileSuggestion;
  readonly options: TopFileSuggestionOptions;
  readonly declined: Declined;
  readonly onDone: () => void;
}

function AskedDialog({ suggestion, options, declined, onDone }: AskedDialogProps) {
  return (
    <TopFileDialog
      suggestion={suggestion}
      topFileName={options.topFileName}
      onMakeTopAndStart={() => {
        onDone();
        options.onStartFile(suggestion.fileId);
      }}
      onStartAsItIs={() => {
        onDone();
        declined.add(suggestion.fileId);
        options.onStartTop();
      }}
      onStopAsking={() => options.hint.onChange(false)}
      onClose={onDone}
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
