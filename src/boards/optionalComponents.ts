// SPDX-License-Identifier: GPL-2.0-only
import type { ButtonGroup, IndependentDisplays, VectorPort } from './types';

export const OPTIONAL_COMPONENTS = ['switches', 'pushbuttons', 'sevenSegment'] as const;
export type OptionalComponent = typeof OPTIONAL_COMPONENTS[number];

// Missing JSON roles have zero-width runtime shapes, never invented HDL pins.
export const NO_SWITCHES: VectorPort = { port: '', count: 0 };
export const NO_BUTTONS: ButtonGroup = { group: { kind: 'scalars', ports: [] }, layout: 'row', activeLow: true };
export const NO_DISPLAYS: IndependentDisplays = { kind: 'independent', ports: [], width: 7, activeLow: true };

/** Only used after the user explicitly adds a component. Names must then be supplied. */
export function newComponent(component: OptionalComponent): unknown {
  switch (component) {
    case 'switches': return { port: '', count: 1 };
    case 'pushbuttons': return { port: '', count: 1, activeLow: true };
    case 'sevenSegment': return { kind: 'independent', ports: [''], width: 7, activeLow: true };
  }
}
