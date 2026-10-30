// SPDX-License-Identifier: GPL-2.0-only
import { expect, it } from 'vitest';
import { fitBoard, paneWidthForScale } from './BoardFit';

it('updates scale and scroll extent together for each arrangement and size', () => {
  const viewport = { clientWidth: 200, clientHeight: 150 } as HTMLDivElement;
  const scaler = { offsetWidth: 100, offsetHeight: 300, style: {} } as HTMLDivElement;
  const spacer = { style: {} } as HTMLDivElement;
  fitBoard(viewport, scaler, spacer);
  expect(scaler.style.transform).toBe('scale(2)');
  expect(spacer.style.height).toBe('600px');
  fitBoard(viewport, scaler, spacer);
  expect(scaler.style.transform).toBe('scale(2)');
  expect(spacer.style.height).toBe('600px');
  Object.assign(viewport, { clientWidth: 0 });
  fitBoard(viewport, scaler, spacer);
  expect(scaler.style.transform).toBe('scale(2)');
  Object.assign(viewport, { clientWidth: 100 });
  fitBoard(viewport, scaler, spacer);
  expect(scaler.style.transform).toBe('scale(1)');
  expect(spacer.style.height).toBe('300px');
});

it('resizes the pane for a layout change while preserving the rendered component scale', () => {
  const viewport = { clientWidth: 600, clientHeight: 600 } as HTMLDivElement;
  const scaler = { offsetWidth: 400, offsetHeight: 200, style: {} } as HTMLDivElement;
  const spacer = { style: {} } as HTMLDivElement;
  const scale = fitBoard(viewport, scaler, spacer)!;
  expect(scale).toBe(1.5);

  // The pane includes 32px of padding and a 15px scrollbar gutter.
  Object.assign(scaler, { offsetWidth: 200, offsetHeight: 450 });
  Object.assign(viewport, { clientWidth: 585 });
  const narrow = paneWidthForScale(scaler.offsetWidth, scale, 632, viewport.clientWidth);
  expect(narrow).toBe(347);
  Object.assign(viewport, { clientWidth: narrow - 47 });
  expect(fitBoard(viewport, scaler, spacer)).toBe(scale);
  expect(spacer.style.height).toBe('675px');

  Object.assign(scaler, { offsetWidth: 400, offsetHeight: 200 });
  Object.assign(viewport, { clientWidth: narrow - 32 });
  const wide = paneWidthForScale(scaler.offsetWidth, scale, narrow, viewport.clientWidth);
  expect(wide).toBe(632);
  Object.assign(viewport, { clientWidth: wide - 32 });
  expect(fitBoard(viewport, scaler, spacer)).toBe(scale);
});

it('uses all available width after the board content becomes narrower', () => {
  const viewport = { clientWidth: 168, clientHeight: 600 } as HTMLDivElement;
  const scaler = { offsetWidth: 100, offsetHeight: 200, style: {} } as HTMLDivElement;
  expect(fitBoard(viewport, scaler, null)).toBe(1.68);
  Object.assign(viewport, { clientWidth: 40 });
  expect(fitBoard(viewport, scaler, null)).toBe(0.4);
});

it('continues growing when a wide two-column board exceeds the pane height', () => {
  const viewport = { clientWidth: 760, clientHeight: 469 } as HTMLDivElement;
  const scaler = { offsetWidth: 1413, offsetHeight: 779, style: {} } as HTMLDivElement;
  const spacer = { style: {} } as HTMLDivElement;
  expect(fitBoard(viewport, scaler, spacer)).toBeCloseTo(760 / 1413);
  Object.assign(viewport, { clientWidth: 1188 });
  expect(fitBoard(viewport, scaler, spacer)).toBeCloseTo(1188 / 1413);
  expect(Number.parseFloat(spacer.style.height)).toBeCloseTo(779 * 1188 / 1413);
  expect(Number.parseFloat(spacer.style.height)).toBeGreaterThan(viewport.clientHeight);
});
