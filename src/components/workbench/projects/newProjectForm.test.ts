// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import { describe, expect, test } from 'vitest';
import { BUILT_IN_CATALOG, findBoard } from '../../../boards/boardCatalog';
import { starterTopFileName } from '../../../boards/boardTop';
import {
  choiceOf,
  emptyDraft,
  fileNameField,
  isBlank,
  keepFilesNote,
  plannedTopFile,
  topFileSummary,
  withTypedFileName,
  type NewProjectDraft,
} from './newProjectForm';

const DE1_SOC = findBoard(BUILT_IN_CATALOG, 'de1-soc').board;
const DEFAULT = findBoard(BUILT_IN_CATALOG, 'default').board;
const draft = (over: Partial<NewProjectDraft> = {}): NewProjectDraft => ({ ...emptyDraft('vhdl'), ...over });

describe('the note on keeping the files in Files', () => {
  const traffic = draft({ name: 'Traffic light' });

  test('says the name Keep files gives when the file is there already', () => {
    const note = keepFilesNote(traffic, DE1_SOC, { names: ['Traffic_light.vhdl'], board: DE1_SOC });
    expect(note).toBe('If you keep the files now in Files, it is named Traffic_light_2.vhdl instead.');
  });

  test('is the name Keep files creates (Workbench: on the open project board, with Files taken)', () => {
    const filesNow = { names: ['Traffic_light.vhdl'], board: DEFAULT };
    const created = starterTopFileName(DEFAULT, 'vhdl', { takenNames: filesNow.names, projectName: choiceOf(traffic, DE1_SOC).topName });
    expect(keepFilesNote(traffic, DE1_SOC, filesNow)).toContain(created);
  });

  test('says nothing when Keep files names it the same', () => {
    expect(keepFilesNote(traffic, DE1_SOC, { names: ['adder.vhdl'], board: DE1_SOC })).toBeUndefined();
  });

  test('says nothing with no files in Files', () => {
    expect(keepFilesNote(traffic, DE1_SOC, { names: [], board: DE1_SOC })).toBeUndefined();
  });

  test('says nothing before a name is typed', () => {
    expect(keepFilesNote(draft(), DE1_SOC, { names: ['DE1_SoC.vhdl'], board: DE1_SOC })).toBeUndefined();
  });
});

describe('a blank form', () => {
  test('has nothing typed or chosen', () => {
    expect(isBlank(draft({ language: 'verilog' }))).toBe(true);
  });

  test('is not blank once a board is chosen', () => {
    expect(isBlank(draft({ chosenBoard: 'basys3' }))).toBe(false);
  });
});

describe('the file name field', () => {
  test('is empty while the project has no name', () => {
    expect(fileNameField(draft(), DE1_SOC)).toBe('');
  });

  test('follows the project name, made a valid design name', () => {
    expect(fileNameField(draft({ name: 'Traffic light' }), DE1_SOC)).toBe('Traffic_light');
  });

  test('keeps what was typed, whatever the project is called', () => {
    expect(fileNameField(withTypedFileName(draft({ name: 'Traffic light' }), 'lights'), DE1_SOC)).toBe('lights');
  });

  test('stays empty once it is cleared, so a name of one\'s own can be typed', () => {
    expect(fileNameField(withTypedFileName(draft({ name: 'Adder' }), ''), DE1_SOC)).toBe('');
  });
});

test('a cleared file name names the file after the project', () => {
  expect(plannedTopFile(withTypedFileName(draft({ name: 'Adder' }), ' '), DE1_SOC).fileName).toBe('Adder.vhdl');
});

describe('the planned top file', () => {
  test('is a .vhdl file for VHDL, its entity named as the file', () => {
    expect(plannedTopFile(withTypedFileName(draft(), 'myDesign'), DE1_SOC)).toEqual({ fileName: 'myDesign.vhdl', designName: 'myDesign' });
  });

  test('is a .v file for Verilog', () => {
    expect(plannedTopFile(withTypedFileName(draft({ language: 'verilog' }), 'myDesign'), DE1_SOC).fileName).toBe('myDesign.v');
  });

  test('gets _top when its name is one of the board\'s ports', () => {
    expect(plannedTopFile(withTypedFileName(draft(), 'LEDR'), DE1_SOC).designName).toBe('LEDR_top');
  });

  test('is the file the project is created with', () => {
    const typed = withTypedFileName(draft({ name: 'Lab 1', language: 'verilog' }), 'my design');
    const created = starterTopFileName(DE1_SOC, 'verilog', { projectName: choiceOf(typed, DE1_SOC).topName });
    expect(plannedTopFile(typed, DE1_SOC).fileName).toBe(created);
  });
});

describe('the line under the file name', () => {
  test('names the VHDL file, its entity and the board', () => {
    expect(topFileSummary(withTypedFileName(draft(), 'myDesign'), DE1_SOC)).toBe("Creates myDesign.vhdl with an entity named myDesign and the DE1-SoC board's ports.");
  });

  test('names a Verilog module', () => {
    expect(topFileSummary(withTypedFileName(draft({ language: 'verilog' }), 'myDesign'), DE1_SOC)).toBe("Creates myDesign.v with a module named myDesign and the DE1-SoC board's ports.");
  });

  test('says the file name follows the project name while both are empty', () => {
    expect(topFileSummary(draft(), DE1_SOC)).toBe('The file name follows the project name, or type one of your own.');
  });
});

test('the choice has the project name without surrounding space', () => {
  expect(choiceOf(draft({ name: '  Adder ' }), DE1_SOC).name).toBe('Adder');
});
