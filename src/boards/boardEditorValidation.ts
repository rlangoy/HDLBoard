// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy
import { checkBoard } from './boardFileReader';
import { componentFields, fieldKey, presentComponents, resourceFields, type EditorField } from './boardEditorFields';
import { knownBoard, valueAt } from './boardEditorModel';
import { fieldProblem } from './boardEditorValueValidation';
import { parseBoardFile } from './parseBoards';
import { readResource } from './parseResources';

export type EditorErrors = Record<string, string>;

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

export function validateBoardDraft(draft: Record<string, unknown>, defaults: unknown, existing: readonly Record<string, unknown>[]): EditorErrors {
  const fields = [...presentComponents(draft).flatMap((key) => componentFields(key, draft)), ...resourceFields(draft)];
  const errors = fieldErrors(fields, (field) => field.derive?.(draft) ?? valueAt(draft, field.path)
    ?? (field.optional ? undefined : valueAt(defaults, field.path)));
  const parsed = parseBoardFile(JSON.stringify({ version: 2, boards: [knownBoard(draft)] }), { fileName: 'Draft', origin: 'user' });
  for (const problem of parsed.problems) {
    const key = fields.some((field) => fieldKey(field) === problem.path) ? problem.path : '_board';
    errors[key] ??= problem.message;
  }
  return { ...errors, ...resourceErrors(draft), ...identityErrors(draft, existing) };
}

function identityErrors(draft: Record<string, unknown>, existing: readonly Record<string, unknown>[]): EditorErrors {
  const errors: EditorErrors = {};
  if (existing.some((other) => other.id !== draft.id && String(other.name).toLowerCase() === String(draft.name).toLowerCase())) {
    errors.name = 'Another board already uses this name.';
  }
  return errors;
}

function resourceErrors(draft: Record<string, unknown>): EditorErrors {
  const errors: EditorErrors = {};
  if (!Array.isArray(draft.resources)) return errors;
  const labels = new Map<unknown, number>();
  draft.resources.forEach((resource, index) => {
    const checked = checkBoard(() => readResource(`resources.${index}`, knownBoard(resource, 'resources')));
    if (!checked.ok) errors[checked.path || '_board'] = checked.problem;
    const label = valueAt(resource, ['label']);
    const earlier = labels.get(label);
    if (earlier !== undefined) {
      errors[`resources.${index}.label`] = 'Link labels must be unique.';
      errors[`resources.${earlier}.label`] = 'Link labels must be unique.';
    }
    labels.set(label, index);
  });
  return errors;
}
