// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import { describe, expect, test } from 'vitest';
import {
  existsReason,
  fileNameRefusal,
  incomingFileRefusals,
  NOT_SOURCE_REASON,
  RESERVED_PREFIX_REASON,
} from './fileNameRules';

const PROJECT = ['DE1_SoC.vhdl', 'blinkTest.v'];

describe('fileNameRefusal', () => {
  test('allows a name no file has', () => {
    expect(fileNameRefusal('counter.vhd', PROJECT)).toBeUndefined();
  });

  test('refuses a name another file has', () => {
    expect(fileNameRefusal('blinkTest.v', PROJECT)).toBe(existsReason('blinkTest.v'));
  });

  test('compares names ignoring case', () => {
    expect(fileNameRefusal('de1_soc.VHDL', PROJECT)).toBe(existsReason('de1_soc.VHDL'));
  });

  test('refuses a name that starts with tb_, whatever its case', () => {
    expect(fileNameRefusal('TB_counter.vhd', PROJECT)).toBe(RESERVED_PREFIX_REASON);
  });

  test('says tb_ is reserved for internal use', () => {
    expect(RESERVED_PREFIX_REASON).toBe('File names that start with tb_ are reserved for internal use.');
  });

  test('allows tb_ elsewhere in the name', () => {
    expect(fileNameRefusal('counter_tb.vhd', PROJECT)).toBeUndefined();
  });
});

describe('incomingFileRefusals', () => {
  test('gives a reason for each refused file, in order, and none for the others', () => {
    expect(incomingFileRefusals(['a.vhd', 'notes.txt', 'tb_a.vhd', 'DE1_SoC.vhdl'], PROJECT)).toEqual([
      undefined,
      NOT_SOURCE_REASON,
      RESERVED_PREFIX_REASON,
      existsReason('DE1_SoC.vhdl'),
    ]);
  });

  test('adds only the first of two files with the same name in one drop', () => {
    expect(incomingFileRefusals(['a.vhd', 'A.vhd'], PROJECT)).toEqual([undefined, existsReason('A.vhd')]);
  });
});
