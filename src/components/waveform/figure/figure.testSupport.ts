// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import type { WaveColors } from '../waveDraw';

/** The light theme's waveform colours, as `Waveform.css` defines them. */
export const WHITE_BACKGROUND_COLORS: WaveColors = {
  background: '#ffffff',
  grid: '#e2e8f0',
  axisText: '#64748b',
  high: '#15803d',
  low: '#15803d',
  bus: '#1d4ed8',
  busText: '#0f172a',
  undefined: '#dc2626',
  highZ: '#b45309',
  dontCare: '#94a3b8',
  cursor: '#f59e0b',
  cursorText: '#1f2937',
  errorMarker: '#dc2626',
  selection: '#2563eb',
  selectedRow: '#e8f0fe',
  testbenchInk: '#1d4ed8',
  rtlInk: '#15803d',
  enumInk: '#7c3aed',
  testbenchHead: '#dbeafe',
  rtlHead: '#dcfce7',
};
