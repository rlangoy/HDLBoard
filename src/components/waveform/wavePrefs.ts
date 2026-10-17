// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * The waveform settings kept in this browser (docs/waveform_viewer_spec.md FR-1, FR-25):
 * whether testbench runs record a waveform – on unless switched off – and whether the
 * student has opened one yet, which ends the console's "Open waveform" line. Reads and
 * writes never throw: private windows and blocked storage fall back to the defaults.
 */

const RECORD_KEY = 'hdlboard.waveform.record';
const OPENED_KEY = 'hdlboard.waveform.opened';

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
