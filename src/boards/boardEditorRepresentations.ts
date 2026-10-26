// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy
import { valueAt } from './boardEditorModel';
import { BUTTON_LIMIT, DISPLAY_LIMIT, SEGMENT_COUNT, SEGMENT_COUNT_WITH_POINT } from './boardLimits';
import { componentFields, presentComponents } from './boardEditorFields';

export type ConfigurableComponent = 'pushbuttons' | 'sevenSegment';
export type Representation = 'cross' | 'vector' | 'scalars' | 'independent' | 'multiplexed';
const POSITIONS = ['centre', 'up', 'left', 'right', 'down'];
const SEGMENT_NAMES = ['A', 'B', 'C', 'D', 'E', 'F', 'G'];
const SHAPE_KEYS = {
  pushbuttons: ['port', 'count', 'ports', 'cross'],
  sevenSegment: ['kind', 'ports', 'width', 'segments', 'decimalPoint', 'digitEnables', 'digits', 'digitEnablesActiveLow'],
};

export function representation(component: ConfigurableComponent, value: Record<string, unknown>): Representation {
  if (component === 'sevenSegment') return value.kind === 'independent' ? 'independent' : 'multiplexed';
  if (value.cross) return 'cross';
  return Array.isArray(value.ports) ? 'scalars' : 'vector';
}

/** Only representation-specific keys are replaced. Extensions and shared polarity survive. */
export function representationValue(current: Record<string, unknown>, component: ConfigurableComponent, shape: Record<string, unknown>) {
  const common = Object.fromEntries(Object.entries(current).filter(([key]) => !SHAPE_KEYS[component].includes(key)));
  return { ...shape, ...common };
}

function portAllocator(board: Record<string, unknown>) {
  const used = new Set(presentComponents(board)
    .flatMap((key) => componentFields(key, board)).filter((field) => field.kind === 'port')
    .map((field) => String(valueAt(board, field.path) ?? '').toLowerCase()));
  used.add('clock_500hz');
  return (prefix: string) => {
    let name = prefix;
    let suffix = 0;
    while (used.has(name.toLowerCase())) name = `${prefix}${++suffix}`;
    used.add(name.toLowerCase());
    return name;
  };
}

export function createRepresentation(board: Record<string, unknown>, component: ConfigurableComponent, kind: Representation) {
  const current = valueAt(board, ['ports', component]) as Record<string, unknown>;
  const allocate = portAllocator(board);
  return component === 'pushbuttons' ? buttonShape(current, kind, allocate) : displayShape(current, kind, allocate);
}

function buttonShape(current: Record<string, unknown>, kind: Representation, allocate: (prefix: string) => string) {
  const names = current.cross ? POSITIONS.map((position) => valueAt(current, ['cross', position])) : current.ports;
  const count = Math.min(BUTTON_LIMIT.max, Math.max(BUTTON_LIMIT.min, Number(current.count) || (Array.isArray(names) ? names.length : POSITIONS.length)));
  if (kind === 'vector') return { port: allocate('BTN'), count };
  if (kind === 'scalars') return { ports: Array.isArray(names) ? names : Array.from({ length: count }, (_, i) => allocate(`BTN${i}`)) };
  return { cross: Object.fromEntries(POSITIONS.map((position, i) => [position, Array.isArray(names) && names[i] ? names[i] : allocate(`BTN_${position}`)])) };
}

function displayShape(current: Record<string, unknown>, kind: Representation, allocate: (prefix: string) => string) {
  const digits = Math.min(DISPLAY_LIMIT.max, Math.max(DISPLAY_LIMIT.min, Number(current.digits) || (Array.isArray(current.ports) ? current.ports.length : 1)));
  if (kind === 'independent') return { kind, ports: Array.from({ length: digits }, (_, i) => allocate(`HEX${i}`)), width: current.decimalPoint ? SEGMENT_COUNT_WITH_POINT : SEGMENT_COUNT };
  return { kind, segments: SEGMENT_NAMES.map((name) => allocate(`SEG_${name}`)),
    ...(current.width === SEGMENT_COUNT_WITH_POINT ? { decimalPoint: allocate('DP') } : {}),
    digitEnables: allocate('AN'), digits, digitEnablesActiveLow: true };
}
