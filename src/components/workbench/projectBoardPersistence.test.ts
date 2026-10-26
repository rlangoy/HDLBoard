// SPDX-License-Identifier: GPL-2.0-only
import { expect, it } from 'vitest';
import { initialBoardDocument } from '../../boards/boardEditorStorage';
import { changeAt, valueAt } from '../../boards/boardEditorModel';
import { projectBoard, withProjectBoard } from '../../boards/projectBoard';
import { parseProject } from '../../project/parseProject';
import { hasUnsavedChanges, newProject, openProject, parseStoredProject, projectFileText, withSaved } from './projectFile';
import { projectSnapshot } from './projectGitHub';
import { newFileContent } from './newFile';

const custom = () => ({ ...initialBoardDocument().boards.find((board) => board.id === 'de1-soc')!,
  id: 'my-lab', name: 'My Lab', extension: { retain: ['a', 'b'] } });

it('keeps board changes in memory, marks the project dirty and includes the exact raw node in disk and GitHub saves', async () => {
  const original = withSaved(newProject('Lab', [], 'default'), []);
  const boardConfig = changeAt(custom(), ['ports', 'switches', 'port'], 'INPUT_SWITCHES') as Record<string, unknown>;
  const pending = { ...original, board: 'my-lab', boardConfig };
  expect(hasUnsavedChanges(pending, [])).toBe(true);
  expect(original).not.toHaveProperty('boardConfig');
  const text = projectFileText(pending, []);
  expect(JSON.parse(text).boardConfig).toEqual(boardConfig);
  const snapshot = projectSnapshot(pending, []);
  expect(JSON.parse(snapshot.files.find((file) => file.name.endsWith('.hdlboard.json'))!.content).boardConfig).toEqual(boardConfig);
  const opened = await openProject({ location: 'lab.hdlboard.json', text });
  expect(opened.project.boardConfig).toEqual(boardConfig);
  expect(hasUnsavedChanges(opened.project, [])).toBe(false);
  expect(parseStoredProject(JSON.parse(JSON.stringify(pending)))?.boardConfig).toEqual(boardConfig);
  expect(projectBoard(opened.project.boardConfig).board?.ports.switches.port).toBe('INPUT_SWITCHES');
});

it('gives the project definition priority without changing built-in definitions or dropping extensions', () => {
  const file = initialBoardDocument();
  const boardConfig = custom();
  const installed = { ...file, boards: [...file.boards, { ...boardConfig, description: 'Installed copy' }] };
  const merged = withProjectBoard(installed, boardConfig);
  expect(merged.boards.slice(0, file.boards.length)).toEqual(file.boards);
  expect(merged.boards.filter((board) => board.id === boardConfig.id)).toEqual([boardConfig]);
  expect(valueAt(merged.boards[merged.boards.length - 1], ['extension', 'retain'])).toEqual(['a', 'b']);
  expect(withProjectBoard(file, file.boards[0])).toBe(file);
  expect(projectBoard({ id: 'broken' }).warnings.length).toBeGreaterThan(0);
});

it.each(['vhdl', 'verilog'] as const)('creates empty %s designs with every custom physical I/O and no omitted components', (language) => {
  let raw = changeAt(custom(), ['ports', 'clock'], 'LAB_CLOCK') as Record<string, unknown>;
  raw = changeAt(raw, ['ports', 'leds', 'port'], 'LAB_LEDS') as Record<string, unknown>;
  for (const role of ['switches', 'pushbuttons', 'sevenSegment']) raw = changeAt(raw, ['ports', role], undefined) as Record<string, unknown>;
  const board = projectBoard(raw).board!;
  const text = newFileContent('untitled1', language, board).text;
  expect(text).toContain('LAB_CLOCK');
  expect(text).toContain('LAB_LEDS');
  expect(text).not.toContain('CLOCK_500Hz');
  expect(text).not.toContain('assign');
  expect(text).not.toContain('<=');
  expect(text).not.toContain('KEY');
  expect(text).not.toContain('HEX');
  if (language === 'vhdl') expect(text).toContain('architecture rtl of untitled1 is\nbegin\n\nend architecture;');
  else expect(text).toMatch(/\);\n\nendmodule\n$/);
});

it('rejects a boardConfig that is not a JSON object', () => {
  const text = projectFileText(newProject('Lab', [], 'default'), []);
  expect(() => parseProject(JSON.stringify({ ...JSON.parse(text), boardConfig: [] }))).toThrow('boardConfig');
});
