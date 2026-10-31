// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy
import { BoardIoPanel } from '../BoardIoPanel';
import { useBoardIo } from '../useBoardIo';
import type { BoardDraftPreview } from './useBoardDraftPreview';
import type { BoardLayout } from '../boardLayoutPreference';
import type { BoardPanel, ButtonBounce } from '../../../project/types';

/** Preview controls use their own state so draft edits never send simulation stimuli. */
/** The project's panel order and button bounce are shown, not changed: the preview keeps no settings. */
export function BoardDraftIo({ preview, layout, panelOrder, buttonBounce }: { preview: BoardDraftPreview; layout: BoardLayout; panelOrder?: readonly BoardPanel[]; buttonBounce?: ButtonBounce }) {
  const io = useBoardIo(preview.board);
  return <>
    {preview.invalid && <p role="status" className="bce-preview-note">Showing the last valid layout. Complete the board settings to update the preview.</p>}
    <BoardIoPanel board={preview.board} layout={layout} panelOrder={panelOrder} buttonBounce={buttonBounce} inputs={io.inputs} outputs={io.outputs} onInputsChange={io.setInputs} />
  </>;
}
