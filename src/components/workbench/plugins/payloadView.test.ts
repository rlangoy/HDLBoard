// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import { describe, expect, test } from 'vitest';
import { asciiOf, payloadView } from './payloadView';

describe('payloadView', () => {
  test('a uart byte shows as hex and its character', () => {
    expect(payloadView('uart', '48')).toEqual({ decoded: true, hex: '48', ascii: 'H', framingError: false });
  });

  test('lower-case hex is shown in upper case', () => {
    expect(payloadView('uart', '6f')).toMatchObject({ hex: '6F', ascii: 'o' });
  });

  test('a framing error is flagged', () => {
    expect(payloadView('uart', '00 FE')).toMatchObject({ hex: '00', framingError: true });
  });

  test('an undefined byte shows as XX and ?', () => {
    expect(payloadView('uart', 'XX FE')).toMatchObject({ hex: 'XX', ascii: '?', framingError: true });
  });

  test('an invalid uart payload is shown raw', () => {
    expect(payloadView('uart', 'hello')).toEqual({ decoded: false, raw: 'hello' });
  });

  test('a kind without a decoder is shown raw', () => {
    expect(payloadView('spi', 'A5 3C')).toEqual({ decoded: false, raw: 'A5 3C' });
  });
});

describe('asciiOf', () => {
  test.each([
    [0x0a, '␊', 'LF'],
    [0x0d, '␍', 'CR'],
    [0x00, '␀', 'NUL'],
    [0x20, '␠', 'space'],
    [0x7f, '␡', 'DEL'],
    [0xe5, '·', 'not ASCII'],
  ])('0x%s shows as %s (%s)', (value, ascii, asciiName) => {
    expect(asciiOf(value)).toEqual({ ascii, asciiName });
  });

  test('a printable character is itself, with no name', () => {
    expect(asciiOf(0x21)).toEqual({ ascii: '!' });
  });
});
