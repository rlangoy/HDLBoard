// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * The waveform settings kept in this browser (docs/waveform_viewer_spec.md FR-1, FR-25,
 * § 8.6, § 8.8): whether testbench runs record a waveform – on unless switched off –
 * whether the student has opened one yet, which ends the console's "Open waveform" line,
 * whether the cursor is shown – on unless switched off – and the colouring last picked
 * for a report figure. Reads and writes never throw: private windows and blocked storage
 * fall back to the defaults.
 */

import { DEFAULT_COLOURING, type FigureColouring } from './figure/figureStyle';

const RECORD_KEY = 'hdlboard.waveform.record';
const OPENED_KEY = 'hdlboard.waveform.opened';
const REPORT_KEY = 'hdlboard.waveform.reportFigure';
const CURSOR_KEY = 'hdlboard.waveform.cursor';

function read(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // The setting holds for this page only.
  }
}

export const loadRecordWaves = (): boolean => read(RECORD_KEY) !== 'off';
export const saveRecordWaves = (on: boolean): void => write(RECORD_KEY, on ? 'on' : 'off');

export const loadWaveOpenedOnce = (): boolean => read(OPENED_KEY) === 'yes';
export const saveWaveOpenedOnce = (): void => write(OPENED_KEY, 'yes');

export const loadCursorShown = (): boolean => read(CURSOR_KEY) !== 'off';
export const saveCursorShown = (shown: boolean): void => write(CURSOR_KEY, shown ? 'on' : 'off');

/** What is stored under `key` as an object, or an empty one: never throws, whatever is stored. */
function readObject(key: string): Readonly<Record<string, unknown>> {
  try {
    const parsed: unknown = JSON.parse(read(key) ?? '{}');
    return typeof parsed === 'object' && parsed !== null ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

/** The colouring last picked for a report figure; anything unknown is the default. */
export function loadReportColouring(): FigureColouring {
  return readObject(REPORT_KEY).colouring === 'colour' ? 'colour' : DEFAULT_COLOURING;
}

export const saveReportColouring = (colouring: FigureColouring): void => write(REPORT_KEY, JSON.stringify({ colouring }));
