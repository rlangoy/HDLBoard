// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy
import { representation, type ConfigurableComponent, type Representation } from '../../../boards/boardEditorRepresentations';
import type { BoardEditor } from './useBoardEditor';

export function RepresentationSelect({ editor, component }: { editor: BoardEditor; component: ConfigurableComponent }) {
  const buttons = component === 'pushbuttons';
  const options = buttons ? [['cross', 'Cross (5 buttons)'], ['vector', 'Vector row'], ['scalars', 'Scalar row']] : [['independent', 'Independent displays'], ['multiplexed', 'Multiplexed display']];
  const current = editor.get(['ports', component]) as Record<string, unknown>;
  return <label className="bce-readonly">{buttons ? 'Layout' : 'Display kind'}
    <select value={representation(component, current)} disabled={editor.saving || editor.readOnly} onChange={(event) => editor.changeRepresentation(component, event.target.value as Representation)}>
      {options.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
    </select>
  </label>;
}
