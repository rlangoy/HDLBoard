// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import { useCallback, useRef } from 'react';
import type { OpenProjectInfo } from './openProject';
import type { UnsavedAnswer, UnsavedQuestion } from './UnsavedChangesDialog';

/** The open project as the question before leaving it needs it. */
export interface OpenNow {
  readonly info: OpenProjectInfo;
  readonly name: string;
  /** It has no name of its own yet (projectNeedsName): it is named before it is saved. */
  readonly needsName: boolean;
  /** Saves where it saves to; whether it saved. */
  readonly save: () => Promise<boolean>;
}

export interface LeaveOpenProjectInput {
  /** The open project as of this render. */
  readonly openNow: OpenNow;
  /** Asks Save, Discard changes or Cancel (useUnsavedChangesQuestion). */
  readonly ask: (question: UnsavedQuestion) => Promise<UnsavedAnswer>;
  /** Shows the name field, marked as missing (useProjectsPage's nameAsk). */
  readonly askForName: () => void;
  readonly logError: (text: string) => void;
}

/** Resolves once React has rendered what was set before it (a frame later). */
const nextRender = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

/**
 * Opening a project replaces Files: when the open project has changes where it saves to,
 * ask first (Save, Discard changes or Cancel). The function says whether to go on: after a
 * save, only if it saved, and only once nothing edited while it saved is left unsaved — it
 * asks again then. A save takes time, so the project is read as it is at each step (a ref
 * to the latest render), never as it was when the question was first asked.
 */
export function useLeaveOpenProject(input: LeaveOpenProjectInput): (opening: string) => Promise<boolean> {
  const latest = useRef(input);
  latest.current = input;
  return useCallback(async function leave(opening: string): Promise<boolean> {
    const { openNow, ask, askForName, logError } = latest.current;
    if (!openNow.info.unsaved) return true;
    const answer = await ask({ projectName: openNow.name, destination: openNow.info.destination, opening });
    if (answer !== 'save') return answer === 'discard';
    if (openNow.needsName) {
      logError(`${opening} not opened: give this project a name and save it first.`);
      askForName();
      return false;
    }
    if (!(await openNow.save())) return false;
    await nextRender();
    return leave(opening);
  }, []);
}
