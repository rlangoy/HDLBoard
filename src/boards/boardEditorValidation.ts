// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy
import { countAt, checkBoard } from './boardFileReader';
import { labelProblem, portNameProblem } from './boardNames';
import { CLOCK_MHZ_DECIMALS, CLOCK_MHZ_LIMIT, MAX_RESOURCE_LABEL_LENGTH, MAX_RESOURCE_URL_LENGTH } from './boardLimits';
import { componentFields, presentComponents, type EditorField } from './boardEditorFields';
import { knownBoard, valueAt } from './boardEditorModel';
import { MAX_DESCRIPTION_LENGTH, MAX_NAME_LENGTH, parseBoardFile } from './parseBoards';
import { isHttpsUrl, readResources } from './parseResources';

export type EditorErrors = Record<string, string>;
export const fieldKey = (field: EditorField) => field.path.join('.');

function numericProblem(field: EditorField, value: unknown): string | undefined {
  if (field.path.join('.') === 'ports.clockMHz') {
    return clockProblem(value);
  }
  if (!field.limit) return;
  const checked = checkBoard(() => countAt(fieldKey(field), value, field.limit ?? { min: 1, max: 1 }));
  return checked.ok ? undefined : checked.problem;
}

function clockProblem(value: unknown): string | undefined {
  const number = typeof value === 'number' ? value : NaN;
  if (!Number.isFinite(number) || number < CLOCK_MHZ_LIMIT.min || number > CLOCK_MHZ_LIMIT.max || Number(number.toFixed(CLOCK_MHZ_DECIMALS)) !== number) return 'Use 1–1000 MHz with at most 3 decimal places.';
}

const textValidators = {
  port: portNameProblem,
  label: labelProblem,
  name: (text: string) => text.trim() && text.length <= MAX_NAME_LENGTH ? undefined : 'Enter a board name of 1–40 characters.',
  description: (text: string) => text.length <= MAX_DESCRIPTION_LENGTH ? undefined : 'Use at most 140 characters.',
  url: (text: string) => text.length <= MAX_RESOURCE_URL_LENGTH && isHttpsUrl(text) ? undefined : 'Enter an https:// URL of at most 512 characters.',
  resourceLabel: (text: string) => text.trim() && text.length <= MAX_RESOURCE_LABEL_LENGTH ? undefined : 'Enter a link label of 1–32 characters.',
};

function textProblem(field: EditorField, value: unknown): string | undefined {
  const text = typeof value === 'string' ? value : '';
  if (field.optional && text === '') return;
  return field.kind === 'number' ? undefined : textValidators[field.kind](text);
}

function fieldErrors(fields: EditorField[], get: (field: EditorField) => unknown): EditorErrors {
  const errors: EditorErrors = {};
  const ports = new Map<string, EditorField>();
  for (const field of fields) {
    const value = get(field);
    const problem = field.kind === 'number' ? numericProblem(field, value) : textProblem(field, value);
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

export function validateBoardDraft(draft: Record<string, unknown>, defaults: unknown, others: readonly Record<string, unknown>[]): EditorErrors {
  const fields = presentComponents(draft).flatMap((key) => componentFields(key, draft));
  const errors = fieldErrors(fields, (field) => scalarButtonCount(draft, field) ?? valueAt(draft, field.path) ?? (field.optional ? undefined : valueAt(defaults, field.path)));
  Object.assign(errors, resourceErrors(draft));
  const parsed = parseBoardFile(JSON.stringify({ version: 2, boards: [knownBoard(draft)] }), { fileName: 'Draft', origin: 'user' });
  if (parsed.warnings.length) {
    const message = parsed.warnings[0].split('was skipped: ')[1] ?? parsed.warnings[0];
    const field = fields.find((candidate) => message.startsWith(fieldKey(candidate).replace(/\.(\d+)/g, '[$1]')));
    errors[field ? fieldKey(field) : '_board'] = message;
  }
  if (others.some((other) => other.id !== draft.id && String(other.name).toLowerCase() === String(draft.name).toLowerCase())) errors.name = 'Another board already uses this name.';
  if (others.some((other) => other.id !== draft.id && String(other.id) === String(draft.id))) errors._board = 'The generated board ID already belongs to another board. Change the board name.';
  return errors;
}

function scalarButtonCount(draft: Record<string, unknown>, field: EditorField) {
  if (field.path.join('.') !== 'ports.pushbuttons.count') return undefined;
  const ports = valueAt(draft, ['ports', 'pushbuttons', 'ports']);
  return Array.isArray(ports) ? ports.length : undefined;
}

function resourceErrors(draft: Record<string, unknown>): EditorErrors {
  const errors: EditorErrors = {};
  const resources = draft.resources;
  if (!Array.isArray(resources)) return errors;
  const labels = new Map<unknown, number>();
  resources.forEach((resource, i) => {
    const checked = checkBoard(() => readResources([knownBoard(resource, 'resources')]));
    if (!checked.ok) {
      const part = checked.problem.includes('.url') ? 'url' : 'label';
      errors[`resources.${i}.${part}`] = checked.problem;
    }
    const label = valueAt(resource, ['label']);
    const earlier = labels.get(label);
    if (earlier !== undefined) {
      errors[`resources.${i}.label`] = 'Link labels must be unique.';
      errors[`resources.${earlier}.label`] = 'Link labels must be unique.';
    }
    labels.set(label, i);
  });
  return errors;
}
