// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy
import { useId, useState } from 'react';
import { buttonFields, componentFields, COMPONENT_TITLES, fieldKey, labelField, presentComponents, type ComponentKey } from '../../../boards/boardEditorFields';
import { CodeIcon } from '../icons';
import { ComponentIcon } from './ComponentIcons';
export { ComponentIcon } from './ComponentIcons';
import { EditorField } from './EditorField';
import type { BoardEditor } from './useBoardEditor';
import { ScalarButtonCountField } from './ScalarButtonCountField';
import { BoardNameField } from './BoardNameField';

interface OverviewProps { editor: BoardEditor; selected: ComponentKey; onSelect: (key: ComponentKey) => void }
export function ComponentOverview(props: OverviewProps) {
  return <><h3>Board components</h3><p className="bce-muted">Quick edits</p>
    {presentComponents(props.editor.draft).map((component) => <ComponentCard key={component} {...props} component={component} />)}</>;
}
function ComponentCard({ editor, selected, onSelect, component }: OverviewProps & { component: ComponentKey }) {
  const [open, setOpen] = useState(true);
  const id = useId();
  const simple = component === 'resources';
  return <section className={`bce-card ${selected === component ? 'is-selected' : ''}`} onClick={() => onSelect(component)}>
    <div className="bce-card__heading">
      {!simple && <button type="button" className="bce-collapse" aria-label={`${open ? 'Collapse' : 'Expand'} ${COMPONENT_TITLES[component]} quick edits`} aria-expanded={open} aria-controls={id} onClick={() => setOpen(!open)}>{open ? '⌄' : '›'}</button>}
      <button type="button" className="bce-component-name" aria-pressed={selected === component} onClick={() => onSelect(component)}><ComponentIcon component={component} />{COMPONENT_TITLES[component]}</button>
      <button type="button" className="bce-edit-link" onClick={() => onSelect(component)} aria-label={`Edit ${COMPONENT_TITLES[component]} details`}>Edit details →</button>
    </div>
    {!simple && <div id={id} hidden={!open} className="bce-quick"><QuickFields editor={editor} component={component} /></div>}
  </section>;
}
function QuickFields({ editor, component }: { editor: BoardEditor; component: ComponentKey }) {
  if (component === 'information') return <BoardNameField editor={editor} />;
  if (component === 'sevenSegment') return <><EditorField editor={editor} field={labelField(component)} /><p className="bce-muted">{String(editor.get(['ports', component, 'kind']))} · {displayCount(editor)} digits</p></>;
  if (component === 'pushbuttons') return <><EditorField editor={editor} field={labelField(component)} />
    {editor.get(['ports', component, 'cross']) ? <CrossSummary editor={editor} /> : <div className="bce-fields">{buttonFields(editor.draft).map((field) =>
      <div key={fieldKey(field)}>
        {field.path[field.path.length - 1] === 'count' && Array.isArray(editor.get(['ports', component, 'ports']))
          ? <ScalarButtonCountField editor={editor} field={field} />
          : <EditorField editor={editor} field={field} />}
      </div>)}</div>}</>;
  const fields = componentFields(component, editor.draft).filter((field) => field.kind !== 'label' && field.path[field.path.length - 1] !== 'clock500Hz');
  return <div className="bce-fields">{fields.map((field) => <EditorField key={fieldKey(field)} editor={editor} field={field} />)}</div>;
}
function displayCount(editor: BoardEditor): string {
  const ports = editor.get(['ports', 'sevenSegment', 'ports']);
  return String(Array.isArray(ports) ? ports.length : editor.get(['ports', 'sevenSegment', 'digits']));
}
function CrossSummary({ editor }: { editor: BoardEditor }) {
  return <div className="bce-cross bce-cross--summary" aria-label="Five button port names">{['up', 'left', 'centre', 'right', 'down'].map((position) =>
    <span className={`bce-cross__${position}`} key={position}><span className="bce-muted">{position}</span><code>{String(editor.get(['ports', 'pushbuttons', 'cross', position]))}</code></span>)}</div>;
}

export function JsonIcon() { return <CodeIcon aria-hidden="true" />; }
