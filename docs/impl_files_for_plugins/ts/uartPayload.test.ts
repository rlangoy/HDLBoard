// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

// Frontend test: vitest, like the rest of src/ (vitest.config.ts).

import { describe, expect, test } from 'vitest';
import { formatSimTime, parseUartPayload, uartDisplay, type UartByte } from './uartPayload';

const byte = (value: number | null, timeNs = 0): UartByte => ({ timeNs, value, framingError: false });

describe('parseUartPayload', () => {
  test('parses a byte', () => {
    expect(parseUartPayload(83495, '48')).toEqual({ timeNs: 83495, value: 0x48, framingError: false });
  });

  test('parses a framing error', () => {
    expect(parseUartPayload(92465, '00 FE')).toEqual({ timeNs: 92465, value: 0, framingError: true });
  });

  test('parses undefined data bits', () => {
    expect(parseUartPayload(417815, 'XX')).toEqual({ timeNs: 417815, value: null, framingError: false });
    expect(parseUartPayload(1, 'XX FE')).toEqual({ timeNs: 1, value: null, framingError: true });
  });

  test.each(['', '4', '481', 'GG', '48 XX', '48  FE', 'xx'])('rejects %j', (payload) => {
    expect(parseUartPayload(0, payload)).toBeUndefined();
  });
});

describe('uartDisplay', () => {
  test('shows "Hei!" from the example testbench', () => {
    expect(uartDisplay([0x48, 0x65, 0x69, 0x21].map((v) => byte(v))).join('')).toBe('Hei!');
  });

  test('treats CR, LF and CR LF as one line break each', () => {
    expect(uartDisplay([0x61, 0x0d, 0x0a, 0x62, 0x0a, 0x63, 0x0d, 0x64].map((v) => byte(v))).join('')).toBe('a\nb\nc\nd');
  });

  test('shows an undefined byte as ⟨??⟩', () => {
    expect(uartDisplay([byte(null)])).toEqual(['⟨??⟩']);
  });

  test('shows non-printable bytes as hex', () => {
    expect(uartDisplay([byte(0x00), byte(0xff), byte(0x7f)])).toEqual(['⟨00⟩', '⟨FF⟩', '⟨7F⟩']);
  });
});

describe('formatSimTime', () => {
  test.each([
    [850, '850 ns'],
    [83495, '83.495 µs'],
    [1204000, '1.204 ms'],
    [3000179270, '3.000 s'],
  ])('%d ns -> %s', (ns, text) => {
    expect(formatSimTime(ns)).toBe(text);
  });
});
