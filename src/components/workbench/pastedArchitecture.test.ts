// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import { describe, expect, test } from 'vitest';
import type { RunSnapshot } from './diagnosticLocation';
import { answeredPaste, pasteQuestions, removeAndInsert, renamePasted, type PasteTarget } from './pastedArchitecture';
import { applyTextEdit } from './textLines';

/** The student's file: the board entity and an architecture with an AND gate in a block. */
const DE1_SOC = `entity DE1_SoC is
    port (SW : in std_logic_vector(9 downto 0); LEDR : out std_logic_vector(9 downto 0));
end entity;

architecture rtl of DE1_SoC is
begin
    and_gate : block
    begin
        LEDR(0) <= SW(0) and SW(1);
    end block and_gate;
end architecture rtl;
`;

/** What was pasted below it: a second `rtl`. */
const PASS_THROUGH = `architecture rtl of DE1_SoC is
begin
    LEDR <= SW;
end architecture;
`;

const AT_END: PasteTarget = { fileId: 'top', selectionStart: DE1_SOC.length, selectionEnd: DE1_SOC.length };

function project(...files: [id: string, name: string, content: string][]): RunSnapshot['files'] {
  return files.map(([id, name, content]) => ({ id, name, content }));
}

const ONE_FILE = project(['top', 'DE1_SoC.vhdl', DE1_SOC]);

describe('pasteQuestions', () => {
  test('a second rtl of DE1_SoC: offers to replace the first', () => {
    const questions = pasteQuestions(PASS_THROUGH, AT_END, ONE_FILE);
    expect(questions?.duplicates.asPasted.map(({ name, line, lastLine }) => ({ name, line, lastLine }))).toEqual([
      { name: 'rtl', line: 5, lastLine: 11 },
    ]);
  });

  test('a second rtl of DE1_SoC: no rename, the entity exists', () => {
    expect(pasteQuestions(PASS_THROUGH, AT_END, ONE_FILE)?.rename).toBeUndefined();
  });

  test('an entity no file declares: offers the file’s own entity', () => {
    const pasted = PASS_THROUGH.replace('DE1_SoC', 'de1_soc_top');
    expect(pasteQuestions(pasted, AT_END, ONE_FILE)?.rename).toEqual({ from: 'de1_soc_top', to: 'DE1_SoC' });
  });

  test('after the rename, the pasted rtl is a duplicate too', () => {
    const pasted = PASS_THROUGH.replace('DE1_SoC', 'de1_soc_top');
    const questions = pasteQuestions(pasted, AT_END, ONE_FILE);
    expect([questions?.duplicates.asPasted.length, questions?.duplicates.renamed.length]).toEqual([0, 1]);
  });

  test('an architecture under another name: nothing to ask', () => {
    expect(pasteQuestions(PASS_THROUGH.replace('rtl', 'pass'), AT_END, ONE_FILE)).toBeUndefined();
  });

  test('no architecture in the paste: nothing to ask', () => {
    expect(pasteQuestions('LEDR <= SW;', AT_END, ONE_FILE)).toBeUndefined();
  });

  test('pasted over the old rtl itself: nothing to ask', () => {
    const over: PasteTarget = { fileId: 'top', selectionStart: DE1_SOC.indexOf('architecture'), selectionEnd: DE1_SOC.length };
    expect(pasteQuestions(PASS_THROUGH, over, ONE_FILE)).toBeUndefined();
  });

  test('a paste that brings its own entity needs no rename', () => {
    const pasted = `entity blinker is end;\n${PASS_THROUGH.replace('DE1_SoC', 'blinker')}`;
    expect(pasteQuestions(pasted, AT_END, ONE_FILE)).toBeUndefined();
  });

  test('a duplicate in another file is offered with its file', () => {
    const files = project(['top', 'DE1_SoC.vhdl', DE1_SOC.slice(0, DE1_SOC.indexOf('architecture'))], ['other', 'rtl.vhd', DE1_SOC]);
    const questions = pasteQuestions(PASS_THROUGH, { fileId: 'top', selectionStart: 0, selectionEnd: 0 }, files);
    expect(questions?.duplicates.asPasted.map((a) => a.fileName)).toEqual(['rtl.vhd']);
  });

  test('a Verilog file is left alone', () => {
    expect(pasteQuestions(PASS_THROUGH, AT_END, project(['top', 'top.v', DE1_SOC]))).toBeUndefined();
  });
});

describe('renamePasted', () => {
  test('changes only the entity after `of`', () => {
    const pasted = PASS_THROUGH.replace('DE1_SoC', 'de1_soc_top');
    expect(renamePasted(pasted, { from: 'de1_soc_top', to: 'DE1_SoC' })).toBe(PASS_THROUGH);
  });
});

describe('answeredPaste', () => {
  const pasted = PASS_THROUGH.replace('DE1_SoC', 'de1_soc_top');
  const questions = pasteQuestions(pasted, AT_END, ONE_FILE);

  test('both ticked: renamed, and replaces the old rtl', () => {
    const answer = questions && answeredPaste(pasted, questions, { rename: true, replace: true });
    expect([answer?.text, answer?.replaced.length]).toEqual([PASS_THROUGH, 1]);
  });

  test('neither ticked: the paste as copied', () => {
    const answer = questions && answeredPaste(pasted, questions, { rename: false, replace: false });
    expect([answer?.text, answer?.replaced.length]).toEqual([pasted, 0]);
  });
});

describe('removeAndInsert', () => {
  const oldRtl = { line: 5, lastLine: 11 };

  test('the pasted rtl takes the old one’s place in one edit', () => {
    const edit = removeAndInsert(DE1_SOC, [oldRtl], { start: DE1_SOC.length, end: DE1_SOC.length, text: PASS_THROUGH });
    expect(applyTextEdit(DE1_SOC, edit)).toBe(DE1_SOC.slice(0, DE1_SOC.indexOf('architecture')) + PASS_THROUGH);
  });

  test('the caret ends after the pasted text', () => {
    const edit = removeAndInsert(DE1_SOC, [oldRtl], { start: DE1_SOC.length, end: DE1_SOC.length, text: PASS_THROUGH });
    expect(applyTextEdit(DE1_SOC, edit).length).toBe(edit.caret);
  });

  test('a paste above the removed architecture', () => {
    const edit = removeAndInsert(DE1_SOC, [oldRtl], { start: 0, end: 0, text: '-- new\n' });
    expect(applyTextEdit(DE1_SOC, edit)).toBe(`-- new\n${DE1_SOC.slice(0, DE1_SOC.indexOf('architecture'))}`);
  });

  test('only removing, in another file', () => {
    expect(applyTextEdit(DE1_SOC, removeAndInsert(DE1_SOC, [oldRtl]))).toBe(DE1_SOC.slice(0, DE1_SOC.indexOf('architecture')));
  });
});

describe('review fixes', () => {
  const headerAt = DE1_SOC.indexOf('architecture');
  const withBlankAfter = `${DE1_SOC}\n-- more\n`;

  test('a caret on the blank line after the old rtl still finds it', () => {
    const target: PasteTarget = { fileId: 'top', selectionStart: DE1_SOC.length, selectionEnd: DE1_SOC.length };
    const files = project(['top', 'DE1_SoC.vhdl', withBlankAfter]);
    expect(pasteQuestions(PASS_THROUGH, target, files)?.duplicates.asPasted).toHaveLength(1);
  });

  test('a caret just before the old rtl’s header still finds it', () => {
    const target: PasteTarget = { fileId: 'top', selectionStart: headerAt, selectionEnd: headerAt };
    expect(pasteQuestions(PASS_THROUGH, target, ONE_FILE)?.duplicates.asPasted).toHaveLength(1);
  });

  test('a paste just before the removed architecture removes it all the same', () => {
    const edit = removeAndInsert(DE1_SOC, [{ line: 5, lastLine: 11 }], { start: headerAt, end: headerAt, text: PASS_THROUGH });
    expect(applyTextEdit(DE1_SOC, edit)).toBe(DE1_SOC.slice(0, headerAt) + PASS_THROUGH);
  });

  test('a paste on the blank line after the removed architecture keeps that line', () => {
    const at = DE1_SOC.length;
    const edit = removeAndInsert(withBlankAfter, [{ line: 5, lastLine: 11 }], { start: at, end: at, text: PASS_THROUGH });
    expect(applyTextEdit(withBlankAfter, edit)).toBe(`${DE1_SOC.slice(0, headerAt)}${PASS_THROUGH}\n-- more\n`);
  });

});
