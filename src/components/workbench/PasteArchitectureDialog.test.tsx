// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, test } from 'vitest';
import { PasteArchitectureDialog } from './PasteArchitectureDialog';
import type { ExistingArchitecture, PasteQuestions } from './pastedArchitecture';

const OLD_RTL: ExistingArchitecture = { fileId: 'top', fileName: 'DE1_SoC.vhdl', name: 'rtl', entity: 'DE1_SoC', line: 24, lastLine: 45 };

function markup(questions: PasteQuestions): string {
  return renderToStaticMarkup(<PasteArchitectureDialog questions={questions} targetFileId="top" onPaste={() => undefined} onClose={() => undefined} />);
}

/** The visible text, without tags. */
function textOf(html: string): string {
  return html.replace(/<[^>]+>/g, '');
}

describe('PasteArchitectureDialog', () => {
  const both: PasteQuestions = { rename: { from: 'de1_soc_top', to: 'DE1_SoC' }, duplicates: { asPasted: [], renamed: [OLD_RTL] } };

  test('asks to change the entity name', () => {
    expect(textOf(markup(both))).toContain('Change de1_soc_top to DE1_SoC — no file in the project declares an entity named de1_soc_top.');
  });

  test('asks to replace the architecture the renamed one duplicates, in this file without its name', () => {
    expect(textOf(markup(both))).toContain('Replace the existing architecture rtl of DE1_SoC (line 24)');
  });

  test('both choices start ticked', () => {
    expect(markup(both).match(/type="checkbox" checked=""/g)).toHaveLength(2);
  });

  test('a duplicate in another file is named with its file', () => {
    const elsewhere = { ...OLD_RTL, fileId: 'other', fileName: 'rtl.vhd' };
    const html = markup({ duplicates: { asPasted: [elsewhere], renamed: [elsewhere] } });
    expect(textOf(html)).toContain('rtl of DE1_SoC in rtl.vhd (line 24)');
  });

  test('only the replace question when the entity exists', () => {
    const html = markup({ duplicates: { asPasted: [OLD_RTL], renamed: [OLD_RTL] } });
    expect(html.match(/type="checkbox"/g)).toHaveLength(1);
  });
});
