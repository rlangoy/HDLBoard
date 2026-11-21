// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import { useState, type ReactNode } from 'react';
import { routeRun, type WorkingPane } from './editorView';
import type { Setting } from './settings/settingsSections';
import type { PaneChip } from './splitPaneModels';
import type { FileAnalysis } from './tbDetect/types';
import { TopFileChip } from './TopFileChip';
import { TopFileDialog } from './TopFileDialog';
import {
  NO_DECLINED_UNITS, topFileSuggestion, type BoardNames, type DeclinedUnits, type MarkedProject, type TopFileSuggestion, type TopUnit,
} from './topFileSuggestion';

export interface TopFileSuggestionOptions {
  /** Settings › General › *Suggest the Top-File*. */
  readonly hint: Setting<boolean>;
  readonly topFileId: string | null;
  /** The unit of the Top-File that Start runs, when one was chosen. */
  readonly topUnit: string | null;
  /** What Start runs now, resolved as Start resolves it; null when no file is the Top-File. */
  readonly running: RunningTop | null;
  /** The pane the offer is about: the testbench pane while one is on screen, else the design pane. */
  readonly working: WorkingPane | null;
  readonly board: BoardNames;
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

export interface RunningTop {
  /** `file`, or `file › unit` when Start names the unit: what the question's *Start …* button says. */
  readonly label: string;
  /** The file and unit: declines last while it stays the same. */
  readonly key: string;
}

/**
 * What Start runs for this Top-File and remembered unit, as `routeRun` resolves it when
 * Start is pressed: a remembered unit that was renamed away is not what runs, so it is
 * not what the label names either. Null without a Top-File.
 */
export function runningTopOf(
  topFile: { readonly id: string; readonly name: string } | undefined,
  topUnit: string | null,
  analysisOf: (fileId: string) => FileAnalysis | undefined,
): RunningTop | null {
  if (!topFile) return null;
  const { unitName, runTarget } = routeRun(analysisOf(topFile.id), topUnit);
  return { label: topRunLabel(topFile.name, runTarget), key: `${topFile.id} › ${unitName}` };
}

/** "Top: alu.v › alu_tb" when Start names the unit it runs (§ 4.10), else the file alone. */
export function topRunLabel(fileName: string, runTarget: string | null): string {
  return runTarget ? `${fileName} › ${runTarget}` : fileName;
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
 * (topFileSuggestion.ts). A unit the student keeps off the Top-File with *Start lab1.vhd*
 * is not offered again until the Top-File changes; that is never stored. The chip's × only
 * hides the chip, until another file is on screen.
 */
export function useTopFileSuggestion(options: TopFileSuggestionOptions): TopFileSuggestionApi {
  const { board, working, topFileId, topUnit } = options;
  const declined = useDeclinedUnits(options.running);
  const chipHidden = useHiddenChip(working?.fileId ?? null);
  const [asked, setAsked] = useState<TopFileSuggestion | null>(null);
  const suggestionIn = (marked: MarkedProject) =>
    topFileSuggestion({ ...marked, board, working, topFileId, topUnit, declined: declined.units });
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
  const chipSuggestion = isOffering && asked === null && !chipHidden.isHidden ? suggestionIn(options.shownProject) : null;
  return {
    start,
    chip: chipOn(working, chipSuggestion, { onMakeTop: makeTopIfStillSuggested, onDismiss: chipHidden.hide }),
    dialog: asked && (
      <Question
        suggestion={asked}
        running={options.running}
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
  readonly running: RunningTop | null;
  readonly onStartSuggested: (unit: TopUnit) => void;
  readonly onStartTop: () => void;
  /** Keeps the unit off the Top-File until the Top-File changes. */
  readonly onDecline: (unit: TopUnit) => void;
  readonly onStopAsking: () => void;
  readonly onClose: () => void;
}

/** The question at Start: each answer closes it first, then starts what was chosen. */
function Question({ suggestion, running, onStartSuggested, onStartTop, onDecline, onStopAsking, onClose }: QuestionProps) {
  return (
    <TopFileDialog
      suggestion={suggestion}
      topFileName={running?.label ?? null}
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
 * The units declined since what Start runs (`top`: its file and resolved unit) last
 * changed. Naming a unit Start already ran is no change. Every change starts the list
 * afresh, a change back to an earlier Top-File too: the list is dropped as the change is
 * rendered, not compared with the Top-File it was made under.
 */
function useDeclinedUnits(running: RunningTop | null): Declined {
  const top = running?.key ?? null;
  const [declined, setDeclined] = useState({ top, units: NO_DECLINED_UNITS });
  const isTopChanged = declined.top !== top;
  if (isTopChanged) setDeclined({ top, units: NO_DECLINED_UNITS });
  const units = isTopChanged ? NO_DECLINED_UNITS : declined.units;
  return { units, add: (unit) => setDeclined({ top, units: units.with(unit) }) };
}

interface HiddenChip {
  readonly isHidden: boolean;
  readonly hide: () => void;
}

/**
 * Whether the chip's × hid the chip for the file on screen. Showing another file shows it
 * again, coming back to this one too: the flag is dropped as the switch is rendered.
 */
function useHiddenChip(fileId: string | null): HiddenChip {
  const [hidden, setHidden] = useState({ fileId, isHidden: false });
  const isFileChanged = hidden.fileId !== fileId;
  if (isFileChanged) setHidden({ fileId, isHidden: false });
  return { isHidden: !isFileChanged && hidden.isHidden, hide: () => setHidden({ fileId, isHidden: true }) };
}

const isSameUnit = (a: TopUnit, b: TopUnit): boolean => a.fileId === b.fileId && a.unitName === b.unitName;

interface ChipActions {
  readonly onMakeTop: (shown: TopFileSuggestion) => void;
  readonly onDismiss: () => void;
}

/** The chip, on the pane its offer is about; null when there is nothing to offer. */
function chipOn(working: WorkingPane | null, suggestion: TopFileSuggestion | null, actions: ChipActions): PaneChip | null {
  if (!working || !suggestion) return null;
  const node = <TopFileChip suggestion={suggestion} onMakeTop={() => actions.onMakeTop(suggestion)} onDismiss={actions.onDismiss} />;
  return { pane: working.pane, node };
}
