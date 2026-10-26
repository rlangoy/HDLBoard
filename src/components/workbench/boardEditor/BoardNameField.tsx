// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy
import { componentFields } from '../../../boards/boardEditorFields';
import { LOGO_DATA_URI } from '../logo';
import { EditorField } from './EditorField';
import type { BoardEditor } from './useBoardEditor';

export function BoardNameField({ editor }: { editor: BoardEditor }) {
  const field = componentFields('information', editor.draft).find((item) => item.kind === 'name');
  if (!field) return null;
  return <EditorField editor={editor} field={field} inputAction={<img className="bce-board-name-icon" src={LOGO_DATA_URI} alt="" />} onValueChange={editor.changeBoardName} />;
}
