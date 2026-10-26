// SPDX-License-Identifier: GPL-2.0-only
import { countAt, checkBoard } from './boardFileReader';
import { labelProblem, portNameProblem } from './boardNames';
import { MAX_RESOURCE_LABEL_LENGTH, MAX_RESOURCE_URL_LENGTH } from './boardLimits';
import { MAX_DESCRIPTION_LENGTH, MAX_NAME_LENGTH } from './parseBoards';
import { isHttpsUrl } from './parseResources';
import { fieldKey, type EditorField } from './boardEditorFields';

const textValidators = {
  port: portNameProblem,
  label: labelProblem,
  name: (text: string) => text.trim() && text.length <= MAX_NAME_LENGTH
    ? undefined : `Enter a board name of 1–${MAX_NAME_LENGTH} characters.`,
  description: (text: string) => text.length <= MAX_DESCRIPTION_LENGTH
    ? undefined : `Use at most ${MAX_DESCRIPTION_LENGTH} characters.`,
  url: (text: string) => text.length <= MAX_RESOURCE_URL_LENGTH && isHttpsUrl(text)
    ? undefined : `Enter an https:// URL of at most ${MAX_RESOURCE_URL_LENGTH} characters.`,
  resourceLabel: (text: string) => text.trim() && text.length <= MAX_RESOURCE_LABEL_LENGTH
    ? undefined : `Enter a link label of 1–${MAX_RESOURCE_LABEL_LENGTH} characters.`,
};

export function fieldProblem(field: EditorField, value: unknown): string | undefined {
  if (field.validate) return field.validate(value);
  if (field.kind === 'number') {
    const limit = field.limit;
    if (!limit) return;
    const checked = checkBoard(() => countAt(fieldKey(field), value, limit));
    return checked.ok ? undefined : checked.problem;
  }
  const text = typeof value === 'string' ? value : '';
  if (field.optional && text === '') return;
  return textValidators[field.kind](text);
}
