// SPDX-License-Identifier: GPL-2.0-only
import { COMPONENT_TITLES } from '../../../boards/boardEditorFields';
import { OPTIONAL_COMPONENTS } from '../../../boards/optionalComponents';
import { ComponentIcon } from './ComponentIcons';
import type { BoardEditor } from './useBoardEditor';

export function OptionalComponents({ editor }: { editor: BoardEditor }) {
  return <fieldset className="bce-optional-components" disabled={editor.readOnly || editor.saving}>
    <legend>Components on this board</legend>
    <p className="bce-muted">Include only the hardware your board has. Unchecked components are removed from its configuration.</p>
    {OPTIONAL_COMPONENTS.map((component) => <label key={component}>
      <input type="checkbox" checked={editor.get(['ports', component]) !== undefined}
        onChange={(event) => event.target.checked ? editor.addComponent(component) : editor.removeComponent(component)} />
      <ComponentIcon component={component} />{COMPONENT_TITLES[component]}
    </label>)}
  </fieldset>;
}
