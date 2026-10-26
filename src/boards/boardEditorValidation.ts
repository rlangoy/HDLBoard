// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy
import { componentFields, fieldKey, presentComponents, resourceFields, type EditorField } from './boardEditorFields';
import { knownBoard, valueAt } from './boardEditorModel';
import { fieldProblem } from './boardEditorValueValidation';
import { parseBoardFile } from './parseBoards';

export type EditorErrors = Record<string, string>;
const DUPLICATE_LABEL = 'Link labels must be unique.';

function fieldErrors(fields: EditorField[], readValue: (field: EditorField) => unknown): EditorErrors {
  const errors: EditorErrors = {};
  const ports = new Map<string, EditorField>();
  for (const field of fields) {
    const value = readValue(field);
    const problem = fieldProblem(field, value);
    if (problem) errors[fieldKey(field)] = problem;
    if (field.kind !== 'port' || typeof value !== 'string' || !value) continue;
    const earlier = ports.get(value.toLowerCase());
    if (earlier) {
      errors[fieldKey(field)] = `Duplicate port name: also used by ${fieldKey(earlier)} (names ignore case).`;
      errors[fieldKey(earlier)] = `Duplicate port name: also used by ${fieldKey(field)} (names ignore case).`;
    }
    ports.set(value.toLowerCase(), field);
  }
  return errors;
}

/** Earlier findings win: a field problem is more specific than the parser's, which is more specific than a board-wide one. */
function addErrors(target: EditorErrors, more: EditorErrors): void {
  for (const [key, message] of Object.entries(more)) target[key] ??= message;
}

/** The boards already saved, and which of them (if any) the draft is an edit of. */
export interface SavedBoards {
  readonly boards: readonly Record<string, unknown>[];
  /** The saved board being edited; the only one that may share the draft's ID. Undefined for a new board. */
  readonly editingId?: string;
}

export function validateBoardDraft(draft: Record<string, unknown>, defaults: unknown, saved: SavedBoards): EditorErrors {
  const fields = [...presentComponents(draft).flatMap((key) => componentFields(key, draft)), ...resourceFields(draft)];
  const errors = fieldErrors(fields, (field) => field.derive?.(draft) ?? valueAt(draft, field.path)
    ?? (field.optional ? undefined : valueAt(defaults, field.path)));
  addErrors(errors, parserErrors(draft, fields));
  addErrors(errors, duplicateLabelErrors(draft));
  addErrors(errors, identityErrors(draft, saved));
  return errors;
}

function parserErrors(draft: Record<string, unknown>, fields: readonly EditorField[]): EditorErrors {
  const errors: EditorErrors = {};
  const parsed = parseBoardFile(JSON.stringify({ version: 2, boards: [knownBoard(draft)] }), { fileName: 'Draft', origin: 'user' });
  for (const problem of parsed.problems) {
    const key = fields.some((field) => fieldKey(field) === problem.path) ? problem.path : '_board';
    errors[key] ??= problem.message;
  }
  return errors;
}

function identityErrors(draft: Record<string, unknown>, { boards, editingId }: SavedBoards): EditorErrors {
  const errors: EditorErrors = {};
  const name = String(draft.name).toLowerCase();
  if (boards.some((other) => other.id !== editingId && String(other.name).toLowerCase() === name)) {
    errors.name = 'Another board already uses this name.';
  }
  if (draft.id !== editingId && boards.some((other) => other.id === draft.id)) {
    errors._board = 'The generated board ID already belongs to another board. Change the board name.';
  }
  return errors;
}

function duplicateLabelErrors(draft: Record<string, unknown>): EditorErrors {
  const errors: EditorErrors = {};
  if (!Array.isArray(draft.resources)) return errors;
  const firstIndexOf = new Map<unknown, number>();
  draft.resources.forEach((resource, index) => {
    const label = valueAt(resource, ['label']);
    const earlier = firstIndexOf.get(label);
    if (earlier === undefined) {
      firstIndexOf.set(label, index);
      return;
    }
    errors[`resources.${index}.label`] = DUPLICATE_LABEL;
    errors[`resources.${earlier}.label`] = DUPLICATE_LABEL;
  });
  return errors;
}
