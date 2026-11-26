// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import { describe, expect, test } from 'vitest';
import { showInFolderLabel } from './rowMenu';

describe('showInFolderLabel', () => {
  test('names Finder in the Mac app', () => {
    expect(showInFolderLabel('MacIntel')).toBe('Show in Finder');
  });

  test('names Explorer in the Windows app', () => {
    expect(showInFolderLabel('Win32')).toBe('Show in Explorer');
  });
});
