// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import { useState, type ReactNode } from 'react';
import type { PaneRole, WorkingPane } from './editorView';
import type { Setting } from './settings/settingsSections';
import type { PaneChip } from './splitPaneModels';
import { TopFileChip } from './TopFileChip';
import { TopFileDialog } from './TopFileDialog';
import {
  NO_DECLINED_UNITS, topFileSuggestion, type DeclinedUnits, type MarkedProject, type TopFileSuggestion, type TopUnit,
} from './topFileSuggestion';

export interface TopFileSuggestionOptions {
  /** Settings › General › *Suggest the Top-File*. */
  readonly hint: Setting<boolean>;
  readonly topFileId: string | null;
  /** The unit of the Top-File that Start runs, when one was chosen. */
  readonly topUnit: string | null;
  /** What Start runs as things are (`file` or `file › unit`); null when no file is the Top-File. */
  readonly topFileName: string | null;
  /** The pane the offer is about: the testbench pane while one is on screen, else the design pane. */
  readonly working: WorkingPane | null;
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
  /** For the header of the pane it is about; null when there is nothing to offer. */
  readonly chip: PaneChip | null;
  readonly dialog: ReactNode;
}

/**
 * Offers the unit on screen as the Top-File, at Start and in its pane's header
 * (topFileSuggestion.ts). A unit the student keeps off the Top-File, with *Start lab1.vhd*
 * or the chip's ×, is not offered again until the Top-File changes; that is never stored.
 */
export function useTopFileSuggestion(options: TopFileSuggestionOptions): TopFileSuggestionApi {
  const { boardPorts, working, topFileId, topUnit } = options;
  const declined = useDeclinedUnits(`${topFileId} › ${topUnit}`);
  const [asked, setAsked] = useState<TopFileSuggestion | null>(null);
  const suggestionIn = (marked: MarkedProject) =>
    topFileSuggestion({ ...marked, boardPorts, working, topFileId, topUnit, declined: declined.units });
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
    chip: chipSuggestion && working && onPane(
      working.pane,
      <TopFileChip
        suggestion={chipSuggestion}
        onMakeTop={() => makeTopIfStillSuggested(chipSuggestion)}
        onDismiss={() => declined.add(chipSuggestion)}
      />,
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
  /** Keeps the unit off the Top-File until the Top-File changes. */
  readonly onDecline: (unit: TopUnit) => void;
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
        onDecline(suggestion);
        onStartTop();
      }}
      onStopAsking={onStopAsking}
      onClose={onClose}
    />
  );
}

interface Declined {
  readonly units: DeclinedUnits;
  readonly add: (unit: TopUnit) => void;
}

/**
 * The units declined since the Top-File (`top`: its file and unit) last changed. Every
 * change starts the list afresh, a change back to an earlier Top-File too: the list is
 * dropped as the change is rendered, not compared with the Top-File it was made under.
 */
function useDeclinedUnits(top: string): Declined {
  const [declined, setDeclined] = useState({ top, units: NO_DECLINED_UNITS });
  const isTopChanged = declined.top !== top;
  if (isTopChanged) setDeclined({ top, units: NO_DECLINED_UNITS });
  const units = isTopChanged ? NO_DECLINED_UNITS : declined.units;
  return { units, add: (unit) => setDeclined({ top, units: units.with(unit) }) };
}

const isSameUnit = (a: TopUnit, b: TopUnit): boolean => a.fileId === b.fileId && a.unitName === b.unitName;

const onPane = (pane: PaneRole, node: ReactNode): PaneChip => ({ pane, node });
