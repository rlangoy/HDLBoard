// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy
import { useRef } from 'react';
import { valueAt, type BoardPath } from '../../../boards/boardEditorModel';
import { createRepresentation, representation, representationValue, type ConfigurableComponent, type Representation } from '../../../boards/boardEditorRepresentations';

export function useRepresentations(draft: Record<string, unknown>, change: (path: BoardPath, value: unknown) => void) {
  const cache = useRef<{ id: unknown; variants: Map<string, Record<string, unknown>> }>({ id: draft.id, variants: new Map() });
  if (cache.current.id !== draft.id) cache.current = { id: draft.id, variants: new Map() };
  return (component: ConfigurableComponent, kind: Representation) => {
    const current = valueAt(draft, ['ports', component]) as Record<string, unknown>;
    cache.current.variants.set(`${component}:${representation(component, current)}`, current);
    const shape = cache.current.variants.get(`${component}:${kind}`) ?? createRepresentation(draft, component, kind);
    change(['ports', component], representationValue(current, component, shape));
  };
}
