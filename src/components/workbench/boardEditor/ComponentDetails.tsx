// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy
import { buttonFields, componentFields, displayFields, labelField, resourceFields, type ComponentKey } from '../../../boards/boardEditorFields';
import { DISPLAY_LIMIT, MAX_RESOURCES } from '../../../boards/boardLimits';
import { EditorField, PolarityField } from './EditorField';
import type { BoardEditor } from './useBoardEditor';
import { RepresentationSelect } from './RepresentationSelect';
import { ComponentIcon } from './ComponentIcons';
import { ScalarButtonCountField } from './ScalarButtonCountField';
import { BoardNameField } from './BoardNameField';
import { OptionalComponents } from './OptionalComponents';

export interface DetailProps { editor: BoardEditor; component: ComponentKey; onSelect: (key: ComponentKey) => void }
export function ComponentDetails(props: DetailProps) {
  switch (props.component) {
    case 'pushbuttons': return <ButtonDetails {...props} />;
    case 'resetButton': return <ResetDetails editor={props.editor} />;
    case 'sevenSegment': return <DisplayDetails editor={props.editor} />;
    case 'resources': return <ResourceDetails editor={props.editor} />;
    case 'information': return <><Fields {...props} /><p className="bce-muted">Board ID follows the name in lowercase, with spaces replaced by hyphens.</p><OptionalComponents editor={props.editor} /><ResourceDetails editor={props.editor} /></>;
    default: return <Fields {...props} />;
  }
}
function Fields({ editor, component }: Pick<DetailProps, 'editor' | 'component'>) {
  return <div className="bce-fields">{componentFields(component, editor.draft).map((field) => field.kind === 'name'
    ? <BoardNameField key={field.path.join('.')} editor={editor} />
    : <EditorField key={field.path.join('.')} editor={editor} field={field} />)}</div>;
}

function ButtonDetails({ editor, onSelect }: DetailProps) {
  const cross = !!editor.get(['ports', 'pushbuttons', 'cross']);
  return <>
    <div className="bce-fields"><RepresentationSelect editor={editor} component="pushbuttons" />
      <EditorField editor={editor} field={labelField('pushbuttons')} /></div>
    <h4>Button port names</h4><p className="bce-muted">Match these names to your HDL top-level ports.</p>
    <div className={cross ? 'bce-cross' : 'bce-fields'}>{buttonFields(editor.draft).map((field) =>
      <div key={field.path.join('.')} className={cross ? `bce-cross__${String(field.path[field.path.length - 1])}` : undefined}>
        {field.path[field.path.length - 1] === 'count' && Array.isArray(editor.get(['ports', 'pushbuttons', 'ports']))
          ? <ScalarButtonCountField editor={editor} field={field} />
          : <EditorField editor={editor} field={field} />}
      </div>)}</div>
    <PolarityField editor={editor} path={['ports', 'pushbuttons', 'activeLow']} title="Pressed logic level" pressed />
    {!!editor.get(['ports', 'resetButton']) && <div className="bce-note">Reset button is configured separately. <button type="button" onClick={() => onSelect('resetButton')}>Edit reset →</button></div>}
    {!Object.keys(editor.errors).some((key) => key.startsWith('ports.pushbuttons')) && cross && <p className="bce-success">✓ 5 unique button port names</p>}
  </>;
}
function ResetDetails({ editor }: { editor: BoardEditor }) {
  return <><Fields editor={editor} component="resetButton" /><PolarityField editor={editor} path={['ports', 'resetButton', 'activeLow']} title="Pressed logic level" pressed /></>;
}

function DisplayDetails({ editor }: { editor: BoardEditor }) {
  const kind = editor.get(['ports', 'sevenSegment', 'kind']);
  return <>
    <RepresentationSelect editor={editor} component="sevenSegment" />
    <p className="bce-muted">Choose the wiring layout, then review its port names before saving.</p>
    <div className="bce-fields">{displayFields(editor.draft).map((field) => <EditorField editor={editor} field={field} key={field.path.join('.')} inputAction={kind === 'independent' && typeof field.path[3] === 'number' ? <RemoveDisplayButton editor={editor} index={field.path[3]} /> : undefined} />)}</div>
    {kind === 'independent' && <DisplayPortActions editor={editor} />}
    <EditorField editor={editor} field={labelField('sevenSegment')} />
    <PolarityField editor={editor} path={['ports', 'sevenSegment', 'activeLow']} title="Segment polarity" />
    {kind === 'multiplexed' && <PolarityField editor={editor} path={['ports', 'sevenSegment', 'digitEnablesActiveLow']} title="Digit-enable polarity" />}
  </>;
}
function DisplayPortActions({ editor }: { editor: BoardEditor }) {
  const path = ['ports', 'sevenSegment', 'ports'];
  const ports = editor.get(path);
  if (!Array.isArray(ports)) return null;
  return <div className="bce-array-actions"><button type="button" className="bce-display-action" title="Add 7-segment display" aria-label="Add 7-segment display" disabled={editor.saving || editor.readOnly || ports.length >= DISPLAY_LIMIT.max} onClick={() => editor.change(path, [...ports, ''])}><DisplayActionIcon add />Add</button></div>;
}

function RemoveDisplayButton({ editor, index }: { editor: BoardEditor; index: number }) {
  const path = ['ports', 'sevenSegment', 'ports'];
  const ports = editor.get(path);
  if (!Array.isArray(ports)) return null;
  const label = `Remove 7-segment display at index ${index}`;
  return <button type="button" className="bce-display-remove" title={label} aria-label={label} disabled={editor.saving || editor.readOnly || ports.length <= DISPLAY_LIMIT.min} onClick={() => editor.change(path, ports.filter((_, i) => i !== index))}><DisplayActionIcon /></button>;
}

function DisplayActionIcon({ add = false }: { add?: boolean }) {
  return <span className={`bce-display-action-icon ${add ? 'is-add' : 'is-remove'}`} aria-hidden="true">
    <ComponentIcon component="sevenSegment" /><span className="bce-display-action-badge">{add ? '+' : '−'}</span>
  </span>;
}

function ResourceDetails({ editor }: { editor: BoardEditor }) {
  const raw = editor.get(['resources']);
  const resources = Array.isArray(raw) ? raw : [];
  const fields = resourceFields(editor.draft);
  return <>
    <h4>Resource links</h4>
    {resources.length === 0 && <p className="bce-note">No resource links yet. Add a board manual, pin reference or example project.</p>}
    {resources.map((_, i) => <div className="bce-resource" key={i}>
      <EditorField editor={editor} field={fields[i * 2]} /><EditorField editor={editor} field={fields[i * 2 + 1]} />
      <button type="button" disabled={editor.saving || editor.readOnly} onClick={() => editor.change(['resources'], resources.filter((__, index) => index !== i))}>Remove link {i + 1}</button>
    </div>)}
    <button type="button" disabled={editor.saving || editor.readOnly || resources.length >= MAX_RESOURCES} onClick={() => editor.change(['resources'], [...resources, { label: '', url: '' }])}>Add resource link</button>
  </>;
}
