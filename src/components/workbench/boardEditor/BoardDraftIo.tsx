// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy
import { BoardIoPanel } from '../BoardIoPanel';
import { useBoardIo } from '../useBoardIo';
import type { BoardDraftPreview } from './useBoardDraftPreview';

/** Preview controls use their own state so draft edits never send simulation stimuli. */
export function BoardDraftIo({ preview }: { preview: BoardDraftPreview }) {
  const io = useBoardIo(preview.board);
  return <>
    {preview.invalid && <p role="status" className="bce-preview-note">Showing the last valid layout. Complete the board settings to update the preview.</p>}
    <BoardIoPanel board={preview.board} inputs={io.inputs} outputs={io.outputs} onInputsChange={io.setInputs} />
  </>;
}
