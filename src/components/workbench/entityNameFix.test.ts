// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import { describe, expect, test } from 'vitest';
import { replaceEntityName } from './entityNameFix';
import { applyTextEdit } from './textLines';

const SOURCE = 'entity DE1_SoC is end;\r\n  architecture rtl of de1_soc_top is\r\nbegin\r\nend;';

describe('replaceEntityName', () => {
  test('writes the suggested entity in place of the name after `of`', () => {
    const edit = replaceEntityName(SOURCE, 2, 'de1_soc_top', 'DE1_SoC');
    expect(edit && applyTextEdit(SOURCE, edit)).toBe(SOURCE.replace('de1_soc_top', 'DE1_SoC'));
  });

  test('leaves the caret after the new name', () => {
    const edit = replaceEntityName(SOURCE, 2, 'de1_soc_top', 'DE1_SoC');
    expect(edit?.caret).toBe(SOURCE.indexOf('de1_soc_top') + 'DE1_SoC'.length);
  });

  test('matches the written name whatever its case', () => {
    expect(replaceEntityName(SOURCE, 2, 'DE1_SOC_TOP', 'DE1_SoC')).toBeDefined();
  });

  test('does nothing once the line names another entity', () => {
    expect(replaceEntityName(SOURCE, 2, 'counter', 'DE1_SoC')).toBeUndefined();
  });

  test('does nothing on a line without an architecture header', () => {
    expect(replaceEntityName(SOURCE, 3, 'de1_soc_top', 'DE1_SoC')).toBeUndefined();
  });
});
