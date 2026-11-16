// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * The rules behind the New project page: what the form holds, which top file it will
 * create, and what it says about it. Pure — no React, no state — so the page only shows
 * them, and they are tested on their own (newProjectForm.test.ts). The names come from
 * the same functions that create the project (boardTop.ts), so the page never promises
 * a file the project will not get.
 */

import { projectTopName, starterTopFileName, TOP_FILE_EXTENSION } from '../../../boards/boardTop';
import type { BoardDefinition } from '../../../boards/types';
import type { NewFileLanguage } from '../newFile';

/** A new project, as chosen: its name, its board, and its top file's name and language. */
export interface NewProjectChoice {
  readonly name: string;
  readonly board: string;
  readonly language: NewFileLanguage;
  /** What the top file, and the entity or module in it, is named after. */
  readonly topName: string;
}

/** The New project form as filled in so far. */
export interface NewProjectDraft {
  readonly name: string;
  /** What was typed as the file name; null while the file name follows the project name. */
  readonly typedFileName: string | null;
  readonly board: string;
  readonly language: NewFileLanguage;
}

export interface LanguageOption {
  readonly id: NewFileLanguage;
  readonly label: string;
  /** What the language's top file ends in. */
  readonly extension: string;
}

export const LANGUAGE_OPTIONS: readonly LanguageOption[] = [
  { id: 'vhdl', label: 'VHDL', extension: TOP_FILE_EXTENSION.vhdl },
  { id: 'verilog', label: 'Verilog', extension: TOP_FILE_EXTENSION.verilog },
];

/** What the design inside a file of each language is called. */
const DESIGN_UNIT: Readonly<Record<NewFileLanguage, string>> = { vhdl: 'an entity', verilog: 'a module' };

export function emptyDraft(board: string, language: NewFileLanguage): NewProjectDraft {
  return { name: '', typedFileName: null, board, language };
}

export function withTypedFileName(draft: NewProjectDraft, typed: string): NewProjectDraft {
  return { ...draft, typedFileName: typed };
}

/** The project name made a valid design name; empty while the project has no name. */
export function nameFromProject(draft: NewProjectDraft, board: BoardDefinition): string {
  return draft.name.trim() === '' ? '' : projectTopName(draft.name, board);
}

/** The file name field's text: what was typed, or, until something is, the name from the project. */
export function fileNameField(draft: NewProjectDraft, board: BoardDefinition): string {
  return draft.typedFileName ?? nameFromProject(draft, board);
}

/** What the top file is named after: the file name typed, or the project's name when the field is left empty. */
function topNameOf(draft: NewProjectDraft, board: BoardDefinition): string {
  const typed = draft.typedFileName?.trim() ?? '';
  return typed === '' ? nameFromProject(draft, board) : typed;
}

export interface PlannedTopFile {
  /** `traffic_light.vhdl` */
  readonly fileName: string;
  /** The entity or module in it: `traffic_light`. */
  readonly designName: string;
}

/** The top file Create project makes, named as the project's own generator names it. */
export function plannedTopFile(draft: NewProjectDraft, board: BoardDefinition): PlannedTopFile {
  const fileName = starterTopFileName(board, draft.language, { projectName: topNameOf(draft, board) });
  return { fileName, designName: fileName.slice(0, -TOP_FILE_EXTENSION[draft.language].length) };
}

/** Under the file name: what Create project will make of it, or what the field is waiting for. */
export function topFileSummary(draft: NewProjectDraft, board: BoardDefinition): string {
  if (topNameOf(draft, board) === '') return 'The file name follows the project name, or type one of your own.';
  const { fileName, designName } = plannedTopFile(draft, board);
  return `Creates ${fileName} with ${DESIGN_UNIT[draft.language]} named ${designName} and the ${board.name} board's ports.`;
}

/** The draft as Create project takes it. */
export function choiceOf(draft: NewProjectDraft, board: BoardDefinition): NewProjectChoice {
  return { name: draft.name.trim(), board: board.id, language: draft.language, topName: topNameOf(draft, board) };
}
