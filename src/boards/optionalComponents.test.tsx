// SPDX-License-Identifier: GPL-2.0-only
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import { BoardIoPanel } from '../components/workbench/BoardIoPanel';
import { initialBoardDocument } from './boardEditorStorage';
import { changeAt, parsedDocument, valueAt } from './boardEditorModel';
import { boardImportSettings } from './boardImportSettings';
import { validateBoardDraft } from './boardEditorValidation';
import { OPTIONAL_COMPONENTS } from './optionalComponents';
import { outputsOff, portList, restInputs } from './boardShape';
import { generateBoardTop } from './boardTop';

it.each([...OPTIONAL_COMPONENTS.map((role) => [role]), [...OPTIONAL_COMPONENTS]])('supports omitted components: %j', (...roles) => {
  const original = initialBoardDocument().boards.find((board) => board.id === 'nexys-a7')!;
  const draft = roles.reduce((board, role) => changeAt(board, ['ports', role], undefined) as Record<string, unknown>, original);
  const parsed = parsedDocument({ version: 2, boards: [draft] });
  expect(parsed.boards).toHaveLength(1);
  const board = parsed.boards[0];
  expect(validateBoardDraft(draft, boardImportSettings(board), [])).toEqual({});
  const exported = boardImportSettings(board);
  for (const role of roles) expect(valueAt(exported, ['ports', role])).toBeUndefined();
  expect(parsedDocument({ version: 2, boards: [exported] }).boards).toHaveLength(1);
  expect(portList(board.ports)).not.toContain('');
  const html = renderToStaticMarkup(<BoardIoPanel board={board} inputs={restInputs(board.ports)} outputs={outputsOff(board.ports)} onInputsChange={() => {}} />);
  if (roles.includes('switches')) expect(html).not.toContain('role="switch"');
  if (roles.includes('pushbuttons')) expect(html).not.toContain('BTNC');
  if (roles.includes('sevenSegment')) expect(html).not.toContain('pb-hex');
  expect(html).toContain('CPU_RESETN');
  for (const language of ['vhdl', 'verilog'] as const) {
    const top = generateBoardTop(board, language, 'custom_top');
    expect(top).not.toContain('undefined');
    expect(top).not.toContain('[-1:0]');
    if (roles.includes('switches')) expect(top).not.toContain('SW');
  }
});
