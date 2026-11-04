// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import { describe, expect, test } from 'vitest';
import { isNewerVersion, versionNumber } from './releaseVersion';

describe('versionNumber', () => {
  test("drops the tag's v", () => {
    expect(versionNumber('v1.6.2')).toBe('1.6.2');
  });

  test('drops text around the number', () => {
    expect(versionNumber('HDLBoard 1.7 (final)')).toBe('1.7');
  });

  test("keeps only the first number, not a suffix's", () => {
    expect(versionNumber('v1.7.0-rc1')).toBe('1.7.0');
  });

  test('is null for a tag without a number', () => {
    expect(versionNumber('latest')).toBeNull();
  });
});

describe('isNewerVersion', () => {
  test('a later patch is newer', () => {
    expect(isNewerVersion('v1.6.2', '1.6.1')).toBe(true);
  });

  test('an earlier release is not newer', () => {
    expect(isNewerVersion('v1.6.1', '1.6.2')).toBe(false);
  });

  test('the same version is not newer', () => {
    expect(isNewerVersion('v1.6.2', '1.6.2')).toBe(false);
  });

  test('compares numbers, not text: 1.10 is after 1.9', () => {
    expect(isNewerVersion('1.10.0', '1.9.9')).toBe(true);
  });

  test('a missing last number counts as 0', () => {
    expect(isNewerVersion('1.6', '1.6.0')).toBe(false);
  });

  test('one more number after an equal start is newer', () => {
    expect(isNewerVersion('1.6.0.1', '1.6')).toBe(true);
  });

  test('a tag without a number is never newer', () => {
    expect(isNewerVersion('nightly', '1.6.2')).toBe(false);
  });
});
