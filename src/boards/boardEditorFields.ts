// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy
import { BUTTON_LIMIT, CLOCK_MHZ_DECIMALS, CLOCK_MHZ_LIMIT, DISPLAY_LIMIT, LED_LIMIT, SEGMENT_COUNT, SEGMENT_COUNT_WITH_POINT, SWITCH_LIMIT, type CountLimit } from './boardLimits';
import { valueAt, type BoardPath } from './boardEditorModel';

export const SEGMENT_NAMES = ['A', 'B', 'C', 'D', 'E', 'F', 'G'] as const;
const DECIMAL_BASE = 10;
export const fieldKey = (field: Pick<EditorField, 'path'>) => field.path.join('.');

function clockProblem(value: unknown): string | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value)
    || value < CLOCK_MHZ_LIMIT.min || value > CLOCK_MHZ_LIMIT.max
    || Number(value.toFixed(CLOCK_MHZ_DECIMALS)) !== value) {
    return `Use ${CLOCK_MHZ_LIMIT.min}–${CLOCK_MHZ_LIMIT.max} MHz with at most ${CLOCK_MHZ_DECIMALS} decimal places.`;
  }
}

export const COMPONENTS = ['clock', 'switches', 'leds', 'pushbuttons', 'resetButton', 'sevenSegment', 'information', 'resources'] as const;
export type ComponentKey = typeof COMPONENTS[number];
export const COMPONENT_TITLES: Record<ComponentKey, string> = {
  clock: 'Clock', switches: 'Switches', leds: 'LEDs', pushbuttons: 'Pushbuttons', resetButton: 'Reset button',
  sevenSegment: '7-segment display', information: 'Board information', resources: 'Resource links',
};
export interface EditorField {
  path: BoardPath;
  label: string;
  kind: 'port' | 'label' | 'number' | 'name' | 'description' | 'url' | 'resourceLabel';
  limit?: CountLimit;
  optional?: boolean;
  step?: number;
  validate?: (value: unknown) => string | undefined;
  derive?: (board: unknown) => unknown;
}
const port = (path: BoardPath, label = 'Port name', optional = false): EditorField => ({ path, label, kind: 'port', optional });
const count = (path: BoardPath, limit: CountLimit, label = 'Count'): EditorField => ({ path, label, kind: 'number', limit });
export const labelField = (role: string): EditorField => ({ path: ['labels', role], label: 'Display label', kind: 'label' });

export function buttonFields(board: unknown): EditorField[] {
  const cross = valueAt(board, ['ports', 'pushbuttons', 'cross']);
  if (cross) return ['up', 'left', 'centre', 'right', 'down'].map((position) => port(['ports', 'pushbuttons', 'cross', position], `${position[0].toUpperCase()}${position.slice(1)} button`));
  const scalars = valueAt(board, ['ports', 'pushbuttons', 'ports']);
  if (Array.isArray(scalars)) return [
    { ...count(['ports', 'pushbuttons', 'count'], BUTTON_LIMIT), derive: (draft) => {
      const ports = valueAt(draft, ['ports', 'pushbuttons', 'ports']);
      return Array.isArray(ports) ? ports.length : undefined;
    } },
    ...scalars.map((_, index) => port(['ports', 'pushbuttons', 'ports', index], `Button ${index}`)),
  ];
  return [port(['ports', 'pushbuttons', 'port']), count(['ports', 'pushbuttons', 'count'], BUTTON_LIMIT)];
}

export function displayFields(board: unknown): EditorField[] {
  const root = ['ports', 'sevenSegment'];
  if (valueAt(board, [...root, 'kind']) === 'independent') {
    const ports = valueAt(board, [...root, 'ports']);
    const fields = Array.isArray(ports) ? ports.map((_, i) => port([...root, 'ports', i], `Digit ${i} port`)) : [];
    return [...fields, count([...root, 'width'], { min: SEGMENT_COUNT, max: SEGMENT_COUNT_WITH_POINT }, 'Number of segments')];
  }
  const segments = valueAt(board, [...root, 'segments']);
  const fields = Array.isArray(segments) ? segments.map((_, i) => port([...root, 'segments', i], `Segment ${SEGMENT_NAMES[i]}`)) : [port([...root, 'segments'], 'Segment vector port (A–G)')];
  return [...fields, port([...root, 'decimalPoint'], 'Decimal-point port', true), port([...root, 'digitEnables'], 'Digit-enable port'), count([...root, 'digits'], DISPLAY_LIMIT, 'Number of digits')];
}

export function resourceFields(board: unknown): EditorField[] {
  const resources = valueAt(board, ['resources']);
  if (!Array.isArray(resources)) return [];
  return resources.flatMap((_, i) => [
    { path: ['resources', i, 'label'], label: `Link ${i + 1} label`, kind: 'resourceLabel' as const },
    { path: ['resources', i, 'url'], label: `Link ${i + 1} URL`, kind: 'url' as const },
  ]);
}

export function componentFields(component: ComponentKey, board: unknown): EditorField[] {
  switch (component) {
    case 'clock': return [port(['ports', 'clock']),
      { ...count(['ports', 'clockMHz'], CLOCK_MHZ_LIMIT, 'Frequency (MHz)'), validate: clockProblem, step: DECIMAL_BASE ** -CLOCK_MHZ_DECIMALS },
      port(['ports', 'clock500Hz'], '500 Hz clock port')];
    case 'switches': return vectorFields('switches', SWITCH_LIMIT);
    case 'leds': return vectorFields('leds', LED_LIMIT);
    case 'pushbuttons': return [...buttonFields(board), labelField(component)];
    case 'resetButton': return [port(['ports', component, 'port'])];
    case 'sevenSegment': return [...displayFields(board), labelField(component)];
    case 'information': return [{ path: ['name'], label: 'Board name', kind: 'name' }, { path: ['description'], label: 'Description', kind: 'description' }];
  }
  return resourceFields(board);
}

function vectorFields(role: string, limit: CountLimit): EditorField[] {
  return [port(['ports', role, 'port']), count(['ports', role, 'count'], limit), labelField(role)];
}

export function presentComponents(board: unknown): ComponentKey[] {
  const hardware = COMPONENTS.filter((key) => key !== 'information' && key !== 'resources'
    && valueAt(board, ['ports', key]) !== undefined);
  return ['information', ...hardware];
}
