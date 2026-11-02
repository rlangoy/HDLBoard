// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, test } from 'vitest';
import { PasteArchitectureDialog } from './PasteArchitectureDialog';
import type { ExistingArchitecture, PasteQuestions } from './pastedArchitecture';
import { renameSkipped, notNeededWithoutRename, replaceSkipped } from './pasteText';

const OLD_RTL: ExistingArchitecture = { fileId: 'top', fileName: 'DE1_SoC.vhdl', name: 'rtl', entity: 'DE1_SoC', line: 24, lastLine: 37 };
const NONE = { asPasted: [], renamed: [] };
const RENAME = { from: 'de1_soc_top', to: 'DE1_SoC' };

function markup(questions: PasteQuestions): string {
  return renderToStaticMarkup(<PasteArchitectureDialog questions={questions} targetFileId="top" onPaste={() => undefined} onClose={() => undefined} />);
}

/** The visible text, without tags. */
function textOf(html: string): string {
  return html.replace(/<[^>]+>/g, '');
}

describe('PasteArchitectureDialog', () => {
  const both: PasteQuestions = { rename: RENAME, duplicates: { asPasted: [], renamed: [OLD_RTL] }, others: NONE };
  const replaceOnly: PasteQuestions = { duplicates: { asPasted: [OLD_RTL], renamed: [OLD_RTL] }, others: NONE };

  test('says how many changes it suggests', () => {
    expect(textOf(markup(both))).toContain('Check these before the code goes in.');
  });

  test('the rename card: its title and what it changes', () => {
    expect(textOf(markup(both))).toContain('Match the entity nameChange de1_soc_top to DE1_SoC. No entity named de1_soc_top exists in this project.');
  });

  test('the replace card names the lines that will be deleted', () => {
    expect(textOf(markup(both))).toContain(
      'Replace the existing architectureDE1_SoC already has an architecture named rtl (lines 24–37). Those lines are deleted, and the pasted one takes its place.',
    );
  });

  test('the replace card is tinted while it deletes code', () => {
    expect(markup(both)).toContain('wb-paste__card is-deleting');
  });

  test('both changes start ticked, and the button applies them', () => {
    const html = markup(both);
    expect([html.match(/type="checkbox" checked=""/g)?.length, textOf(html).includes('Apply changes and paste')]).toEqual([2, true]);
  });

  test('what happens without a change is not said while it is ticked', () => {
    const text = textOf(markup(both));
    expect([text.includes('the next Start'), text.includes('Both are kept')]).toEqual([false, false]);
  });

  test('a duplicate in another file is named with its file', () => {
    const elsewhere = { ...OLD_RTL, fileId: 'other', fileName: 'rtl.vhd' };
    expect(textOf(markup({ duplicates: { asPasted: [elsewhere], renamed: [elsewhere] }, others: NONE }))).toContain('(rtl.vhd, lines 24–37)');
  });

  test('only the replace card when the entity exists', () => {
    const html = markup(replaceOnly);
    expect([html.match(/type="checkbox"/g)?.length, textOf(html).includes('Check this before')]).toEqual([1, true]);
  });
});

describe('the words for a change left out', () => {
  test('rename: the next Start reports an unknown entity', () => {
    expect(renameSkipped(RENAME)).toBe('Left as `de1_soc_top`, the next Start reports an unknown entity.');
  });

  test('replace: the next Start warns about the duplicate', () => {
    expect(replaceSkipped([OLD_RTL])).toBe('Both are kept, and the next Start warns that `rtl` is defined twice.');
  });
});

describe('the replace card while the rename is unticked', () => {
  test('says why it is greyed out', () => {
    expect(notNeededWithoutRename(RENAME)).toBe('Not needed while the pasted code keeps the name `de1_soc_top`.');
  });
});

describe('the Delete the other architecture card', () => {
  const synthPasted: PasteQuestions = { duplicates: NONE, others: { asPasted: [OLD_RTL], renamed: [OLD_RTL] } };

  test('says both may stay, and names the other one', () => {
    expect(textOf(markup(synthPasted))).toContain(
      'Delete the other architectureDE1_SoC also has the architecture rtl (lines 24–37). Both may stay: an entity can have several architectures, and the simulation runs the one GHDL reads last.',
    );
  });

  test('a small warning in the card says what ticking it deletes', () => {
    expect(markup(synthPasted)).toMatch(/class="wb-paste__warning"><svg[^]*Ticking this deletes lines 24–37\./);
  });

  test('starts unticked, so the button pastes as copied', () => {
    const html = markup(synthPasted);
    expect([html.includes('checked=""'), textOf(html).includes('Paste as copied')]).toEqual([false, true]);
  });
});
