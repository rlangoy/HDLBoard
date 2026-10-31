// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import { isObject } from './jsonValue';
import { parsePanelOrder } from './panelOrder';
import { BUTTON_BOUNCES, type BoardPanel, type ButtonBounce, type Diagnostic, type DisplaySettings, type IoDisplaySettings } from './types';

export function defaultIoDisplaySettings(count: number): IoDisplaySettings {
  return { groupSize: null, visible: Array.from({ length: count }, (_, i) => i), visibilityCount: count, readouts: { binary: true, hexadecimal: false, decimal: false } };
}

/** Indices introduced since the selection was made start visible. */
export function visibleIndices(settings: { visible: number[]; visibilityCount?: number } | undefined, count: number): number[] {
  if (!settings) return Array.from({ length: count }, (_, i) => i);
  const previousCount = settings.visibilityCount ?? count;
  return Array.from({ length: count }, (_, i) => i).filter((i) => i >= previousCount || settings.visible.includes(i));
}

/** Replace choices for the current board while retaining choices for larger boards. */
export function withVisibleIndices<T extends { visible: number[]; visibilityCount?: number }>(settings: T, count: number, visible: number[]): T {
  return { ...settings, visible: [...visible, ...settings.visible.filter((index) => index >= count)], visibilityCount: Math.max(settings.visibilityCount ?? count, count) };
}

/** Add the old board's sizes to legacy selections before changing board shapes. */
export function withVisibilityCounts(settings: DisplaySettings | undefined, counts: { leds: number; switches: number; sevenSegment: number }): DisplaySettings | undefined {
  if (!settings) return undefined;
  const addCount = <T extends { visibilityCount?: number }>(entry: T | undefined, count: number): T | undefined =>
    entry && entry.visibilityCount === undefined ? { ...entry, visibilityCount: count } : entry;
  return { ...settings, leds: addCount(settings.leds, counts.leds), switches: addCount(settings.switches, counts.switches), sevenSegment: addCount(settings.sevenSegment, counts.sevenSegment) };
}

/** Ignore malformed optional settings while leaving the rest of the project usable. */
export function parseDisplaySettings(raw: unknown, warnings: Diagnostic[]): DisplaySettings | undefined {
  if (raw === undefined) return undefined;
  if (!isObject(raw)) {
    warnings.push({ severity: 'warning', message: 'Invalid displaySettings; using default display settings.' });
    return undefined;
  }
  const result: DisplaySettings = {};
  for (const kind of ['leds', 'switches'] as const) {
    const value = raw[kind];
    if (value === undefined) continue;
    if (isObject(value) && (value.groupSize === null || value.groupSize === 4 || value.groupSize === 8)
      && Array.isArray(value.visible) && value.visible.every((index: unknown) => Number.isSafeInteger(index) && (index as number) >= 0)
      && isObject(value.readouts) && ['binary', 'hexadecimal', 'decimal'].every((key) => typeof (value.readouts as Record<string, unknown>)[key] === 'boolean')) {
      result[kind] = { groupSize: value.groupSize, visible: [...new Set(value.visible as number[])], ...(validCount(value.visibilityCount) ? { visibilityCount: value.visibilityCount as number } : {}), readouts: {
        binary: value.readouts.binary as boolean, hexadecimal: value.readouts.hexadecimal as boolean, decimal: value.readouts.decimal as boolean,
      } } as IoDisplaySettings;
    } else warnings.push({ severity: 'warning', message: `Invalid displaySettings.${kind}; using default display settings.` });
  }
  if (raw.sevenSegment !== undefined) {
    const value = raw.sevenSegment;
    if (isObject(value) && Array.isArray(value.visible) && value.visible.every((index: unknown) => Number.isSafeInteger(index) && (index as number) >= 0)) {
      result.sevenSegment = { visible: [...new Set(value.visible as number[])], ...(validCount(value.visibilityCount) ? { visibilityCount: value.visibilityCount as number } : {}) };
    } else warnings.push({ severity: 'warning', message: 'Invalid displaySettings.sevenSegment; using default display settings.' });
  }
  if (raw.pushbuttons !== undefined) {
    const value = raw.pushbuttons;
    if (isObject(value) && BUTTON_BOUNCES.includes(value.bounce as ButtonBounce)) result.pushbuttons = { bounce: value.bounce as ButtonBounce };
    else warnings.push({ severity: 'warning', message: 'Invalid displaySettings.pushbuttons; the pushbuttons do not bounce.' });
  }
  if (raw.panelOrder !== undefined) {
    const panelOrder = parsePanelOrder(raw.panelOrder, warnings);
    if (panelOrder) result.panelOrder = panelOrder;
  }
  return Object.keys(result).length ? result : undefined;
}

/** The settings with the Board panels in a new order, or in their own (undefined); no settings left → undefined. */
export function withPanelOrder(settings: DisplaySettings | undefined, panelOrder: BoardPanel[] | undefined): DisplaySettings | undefined {
  const { panelOrder: _previous, ...others } = settings ?? {};
  const next: DisplaySettings = panelOrder ? { ...others, panelOrder } : others;
  return Object.keys(next).length ? next : undefined;
}

/** How the pushbuttons behave in a project: `none` unless it says otherwise. */
export function buttonBounce(settings: DisplaySettings | undefined): ButtonBounce {
  return settings?.pushbuttons?.bounce ?? 'none';
}

function validCount(value: unknown): boolean { return Number.isSafeInteger(value) && (value as number) >= 0; }
