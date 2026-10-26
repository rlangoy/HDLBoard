// SPDX-License-Identifier: GPL-2.0-only
import { expect, it } from 'vitest';
import { initialBoardDocument } from './boardEditorStorage';
import { boardImportSettings } from './boardImportSettings';
import { BUILT_IN_BOARDS } from './boardCatalog';
import { changeAt } from './boardEditorModel';
import { validateBoardDraft } from './boardEditorValidation';
import { parseBoardFile } from './parseBoards';
import { CLOCK_MHZ_DECIMALS, CLOCK_MHZ_LIMIT } from './boardLimits';

const original = initialBoardDocument().boards[0];
const defaults = boardImportSettings(BUILT_IN_BOARDS[0]);
const validate = (draft: Record<string, unknown>) => validateBoardDraft(draft, defaults, []);

it('returns a structured path for a port array entry without the warning prefix', () => {
  const draft = changeAt(original, ['ports', 'sevenSegment', 'ports', 1], 'entity');
  const parsed = parseBoardFile(JSON.stringify({ version: 2, boards: [draft] }), { fileName: 'Any filename', origin: 'user' });
  expect(parsed.problems[0]).toMatchObject({ boardIndex: 0, path: 'ports.sevenSegment.ports.1', message: expect.stringContaining('reserved word') });
});

it('routes resource labels containing .url to the label field', () => {
  const draft = { ...original, resources: [{ label: 'bad.url\u0001', url: 'https://example.com' }] };
  expect(Object.keys(validate(draft))).toEqual(['resources.0.label']);
});

it('routes an unsafe resource URL to its actual array index', () => {
  const draft = { ...original, resources: [
    { label: 'Manual', url: 'https://example.com' },
    { label: 'Pins', url: 'javascript:alert(1)' },
  ] };
  expect(Object.keys(validate(draft))).toEqual(['resources.1.url']);
});

it('keeps the clock field message generated from the configured limits', () => {
  const draft = changeAt(original, ['ports', 'clockMHz'], CLOCK_MHZ_LIMIT.max + 1) as Record<string, unknown>;
  expect(validate(draft)['ports.clockMHz']).toBe(`Use ${CLOCK_MHZ_LIMIT.min}–${CLOCK_MHZ_LIMIT.max} MHz with at most ${CLOCK_MHZ_DECIMALS} decimal places.`);
});

it('reports malformed non-field data as a board problem', () => {
  const draft = changeAt(original, ['ports', 'pushbuttons', 'activeLow'], 'yes') as Record<string, unknown>;
  expect(validate(draft)._board).toContain('must be true or false');
});
