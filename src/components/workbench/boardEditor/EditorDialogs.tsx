// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy
import { Dialog } from '../Dialog';
import { CodeIcon, InfoIcon } from '../icons';
import type { BoardEditor } from './useBoardEditor';

export function UnsavedBoardDialog({ editor }: { editor: BoardEditor }) {
  return <Dialog open={editor.pending !== null} onClose={editor.keepEditing} title="Unsaved board changes" icon={<InfoIcon />}
    footer={<><button type="button" autoFocus onClick={editor.keepEditing}>Keep editing</button>
      <button type="button" disabled={editor.saving} onClick={editor.discard}>Discard</button>
      <button type="button" className="bce-primary" disabled={editor.saving || Object.keys(editor.errors).length > 0} onClick={() => void editor.saveAndContinue()}>Save</button></>}>
    <p>Save changes to this board before continuing?</p>
    {Object.keys(editor.errors).length > 0 && <p className="bce-error">Fix the invalid fields before saving, or discard your changes.</p>}
    {editor.error && <p role="alert" className="bce-error">{editor.error}</p>}
  </Dialog>;
}
export function BoardJsonDialog({ editor, open, onClose }: { editor: BoardEditor; open: boolean; onClose: () => void }) {
  return <Dialog open={open} onClose={onClose} title="Board JSON" subtitle={`Current draft for ${String(editor.get(['name']))}`} size="wide" icon={<CodeIcon />}>
    <pre className="bce-json"><code>{JSON.stringify(editor.draft, null, 2)}</code></pre>
  </Dialog>;
}
