// SPDX-License-Identifier: GPL-2.0-only
import { expect, it } from 'vitest';
import { fitBoard, paneWidthForScale } from './BoardFit';

it('updates scale and scroll extent together for each arrangement and size', () => {
  const viewport = { clientWidth: 200, clientHeight: 150 } as HTMLDivElement;
  const scaler = { offsetWidth: 100, offsetHeight: 300, style: {} } as HTMLDivElement;
  const spacer = { style: {} } as HTMLDivElement;
  fitBoard(viewport, scaler, spacer, true);
  expect(scaler.style.transform).toBe('scale(2)');
  expect(spacer.style.height).toBe('600px');
  fitBoard(viewport, scaler, spacer, false);
  expect(scaler.style.transform).toBe('scale(0.5)');
  expect(spacer.style.height).toBe('0px');
  Object.assign(viewport, { clientWidth: 0 });
  fitBoard(viewport, scaler, spacer, true);
  expect(scaler.style.transform).toBe('scale(0.5)');
  Object.assign(viewport, { clientWidth: 100 });
  fitBoard(viewport, scaler, spacer, true);
  expect(scaler.style.transform).toBe('scale(1)');
  expect(spacer.style.height).toBe('300px');
});

it('resizes the pane for a layout change while preserving the rendered component scale', () => {
  const viewport = { clientWidth: 600, clientHeight: 600 } as HTMLDivElement;
  const scaler = { offsetWidth: 400, offsetHeight: 200, style: {} } as HTMLDivElement;
  const spacer = { style: {} } as HTMLDivElement;
  const scale = fitBoard(viewport, scaler, spacer, false)!;
  expect(scale).toBe(1.5);

  // The committed single-column layout adds a 15px scrollbar to 32px of padding.
  Object.assign(scaler, { offsetWidth: 200, offsetHeight: 450 });
  Object.assign(viewport, { clientWidth: 585 });
  const narrow = paneWidthForScale(scaler.offsetWidth, scale, 632, viewport.clientWidth);
  expect(narrow).toBe(347);
  Object.assign(viewport, { clientWidth: narrow - 47 });
  expect(fitBoard(viewport, scaler, spacer, true, scale)).toBe(scale);
  expect(spacer.style.height).toBe('675px');

  Object.assign(scaler, { offsetWidth: 400, offsetHeight: 200 });
  Object.assign(viewport, { clientWidth: narrow - 32 });
  const wide = paneWidthForScale(scaler.offsetWidth, scale, narrow, viewport.clientWidth);
  expect(wide).toBe(632);
  Object.assign(viewport, { clientWidth: wide - 32 });
  expect(fitBoard(viewport, scaler, spacer, false, scale)).toBe(scale);
});

it('does not enlarge controls at the minimum pane width, but shrinks to fit limited space', () => {
  const viewport = { clientWidth: 168, clientHeight: 600 } as HTMLDivElement;
  const scaler = { offsetWidth: 100, offsetHeight: 200, style: {} } as HTMLDivElement;
  expect(fitBoard(viewport, scaler, null, true, 0.5)).toBe(0.5);
  Object.assign(viewport, { clientWidth: 40 });
  expect(fitBoard(viewport, scaler, null, true, 0.5)).toBe(0.4);
});
