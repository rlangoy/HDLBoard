// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy
import { useEffect, useRef, useState, type MutableRefObject } from 'react';
import { COMPONENT_TITLES, presentComponents, type ComponentKey } from '../../boards/boardEditorFields';
import { ScrollArea } from './ScrollArea';
import { CloseButton } from './CloseButton';
import { useBoardEditor, type BoardEditor, type BoardEditorSource } from './boardEditor/useBoardEditor';
import { ComponentIcon, ComponentOverview, JsonIcon } from './boardEditor/ComponentOverview';
import { ComponentDetails } from './boardEditor/ComponentDetails';
import { BoardJsonDialog, UnsavedBoardDialog } from './boardEditor/EditorDialogs';
import './BoardSettingsPage.css';
import { useBoardDraftPreview, type BoardPreviewChange } from './boardEditor/useBoardDraftPreview';

export type BoardLeaveGuard = MutableRefObject<((action: () => void) => void) | null>;
interface BoardSettingsPageProps extends BoardEditorSource { leaveGuard?: BoardLeaveGuard; onPreview?: BoardPreviewChange }

export function BoardSettingsPage(props: BoardSettingsPageProps) {
  const editor = useBoardEditor(props);
  useBoardDraftPreview(editor.draft, props.onPreview);
  const [selected, setSelected] = useState<ComponentKey>('pushbuttons');
  const [json, setJson] = useState(false);
  const [focusBoardName, setFocusBoardName] = useState(false);
  const root = useRef<HTMLElement>(null);
  useEffect(() => { if (!presentComponents(editor.draft).includes(selected)) setSelected('information'); }, [editor.draft, selected]);
  useEffect(() => {
    if (!focusBoardName || selected !== 'information' || editor.readOnly) return;
    root.current?.querySelector<HTMLInputElement>('.bce-details [data-field="name"] input')?.focus();
    setFocusBoardName(false);
  }, [focusBoardName, selected, editor.readOnly, editor.boardId]);
  useBoardNavigation(editor, root, props.leaveGuard);
  return <section className="bce" ref={root} tabIndex={-1} aria-label="Board settings" onKeyDown={(event) => {
    if (event.key === 'Escape' && !event.defaultPrevented) { event.preventDefault(); editor.request(props.onClose); }
  }}>
    <EditorHeader source={props} editor={editor} onJson={() => setJson(true)} onCreateCopy={() => {
      editor.createCopy(); setSelected('information'); setFocusBoardName(true);
    }} />
    {!props.boards.some((board) => board.id === props.initialBoardId) && <p className="bce-note">The requested board is unavailable for version-2 editing. Showing {String(editor.get(['name']))}; the original board has not been migrated.</p>}
    <div className="bce-panels">
      <ScrollArea className="bce-panel bce-overview"><ComponentOverview editor={editor} selected={selected} onSelect={setSelected} /></ScrollArea>
      <ScrollArea className="bce-panel bce-details"><header className="bce-detail-heading"><ComponentIcon component={selected} /><div><h3>{COMPONENT_TITLES[selected]}</h3><p className="bce-muted">{EXPLANATIONS[selected]}</p></div></header>
        <ComponentDetails component={selected} editor={editor} onSelect={setSelected} />
      </ScrollArea>
    </div>
    <EditorFooter editor={editor} />
    <BoardJsonDialog editor={editor} open={json} onClose={() => setJson(false)} />
    <UnsavedBoardDialog editor={editor} />
  </section>;
}

const EXPLANATIONS: Record<ComponentKey, string> = {
  clock: 'Configure the board clock and simulator-provided 500 Hz clock.',
  switches: 'Match the input vector and display label to your board.', leds: 'Configure the output vector and display label.',
  pushbuttons: 'Edit port names and button behaviour.', resetButton: 'Configure reset independently of the other pushbuttons.',
  sevenSegment: 'Choose the display kind and edit ports in digit or segment order.',
  information: 'Name and describe this board, and manage its resource links.', resources: 'Add links to board manuals, pin references and examples.',
};

function EditorHeader({ source, editor, onJson, onCreateCopy }: { source: BoardEditorSource; editor: BoardEditor; onJson: () => void; onCreateCopy: () => void }) {
  return <header className="bce-header"><div><h2>Board settings</h2><p className="bce-muted">Configure board components and HDL ports.</p></div>
    <label className="bce-board-select">Board<select value={editor.boardId} disabled={editor.saving} onChange={(event) => editor.choose(event.target.value)}>
      {source.boards.map((board) => <option key={board.id} value={board.id}>{board.id === editor.boardId ? String(editor.get(['name'])) : board.name}</option>)}
      {!source.boards.some((board) => board.id === editor.boardId) && <option value={editor.boardId}>{String(editor.get(['name']))}</option>}
    </select></label>
    {editor.readOnly && <button type="button" disabled={editor.saving} onClick={onCreateCopy}>Create editable copy</button>}
    <button type="button" className="bce-json-button" onClick={onJson}><JsonIcon />View JSON</button>
    <CloseButton label="Close board settings" hint="Back to the code (Esc)" onClick={() => editor.request(source.onClose)} />
  </header>;
}

function EditorFooter({ editor }: { editor: BoardEditor }) {
  const invalid = Object.keys(editor.errors).length > 0;
  return <footer className="bce-footer"><div><EditorStatus editor={editor} />
    {invalid && <p className="bce-error">Fix the highlighted fields before saving.{editor.errors._board && ` ${editor.errors._board}`}</p>}
    {editor.error && <p role="alert" className="bce-error">{editor.error}</p>}
  </div><div className="bce-footer-actions"><button type="button" disabled={editor.saving} onClick={editor.cancel}>Cancel</button>
    <button type="button" className="bce-primary" disabled={editor.readOnly || editor.saving || invalid} onClick={() => void editor.save()}>Save changes</button></div></footer>;
}

function EditorStatus({ editor }: { editor: BoardEditor }) {
  const status = editor.saving ? 'Applying…' : editor.dirty ? '● Unsaved changes' : 'All changes applied';
  const message = editor.readOnly ? 'Built-in boards are read-only. Create an editable copy to make changes.' : 'Save the project to store these settings in its project file.';
  return <><span role="status">{status}</span><small className="bce-muted">{message}</small></>;
}

function useBoardNavigation(editor: BoardEditor, root: React.RefObject<HTMLElement>, leaveGuard?: BoardLeaveGuard) {
  useEffect(() => { root.current?.focus(); }, [root]);
  useEffect(() => {
    if (leaveGuard) leaveGuard.current = editor.request;
    return () => { if (leaveGuard) leaveGuard.current = null; };
  }, [editor.request, leaveGuard]);
}
