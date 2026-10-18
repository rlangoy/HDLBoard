// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * The waveform settings kept in this browser (docs/waveform_viewer_spec.md FR-1, FR-25,
 * § 8.8): whether testbench runs record a waveform – on unless switched off – whether the
 * student has opened one yet, which ends the console's "Open waveform" line, and the
 * last choices for a report figure. Reads and writes never throw: private windows and
 * blocked storage fall back to the defaults.
 */

import { DEFAULT_REPORT_OPTIONS, type ReportOptions } from './figure/figureStyle';

const RECORD_KEY = 'hdlboard.waveform.record';
const OPENED_KEY = 'hdlboard.waveform.opened';
const REPORT_KEY = 'hdlboard.waveform.reportFigure';

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

/** The stored report choices, each one checked: anything unknown falls back to its default. */
export function loadReportOptions(): ReportOptions {
  let stored: Partial<Record<keyof ReportOptions, unknown>> = {};
  try {
    stored = JSON.parse(read(REPORT_KEY) ?? '{}') as typeof stored;
  } catch {
    // Not JSON: the defaults.
  }
  return {
    width: stored.width === 'page' ? 'page' : DEFAULT_REPORT_OPTIONS.width,
    colouring: stored.colouring === 'colour' ? 'colour' : DEFAULT_REPORT_OPTIONS.colouring,
    showCursor: typeof stored.showCursor === 'boolean' ? stored.showCursor : DEFAULT_REPORT_OPTIONS.showCursor,
  };
}

export const saveReportOptions = (options: ReportOptions): void => write(REPORT_KEY, JSON.stringify(options));
