// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy
import { EditorField } from './EditorField';
import { BUTTON_LIMIT } from '../../../boards/boardLimits';
import type { EditorField as Field } from '../../../boards/boardEditorFields';
import type { BoardEditor } from './useBoardEditor';

export function ScalarButtonCountField({ editor, field }: { editor: BoardEditor; field: Field }) {
  const ports = editor.get(['ports', 'pushbuttons', 'ports']);
  if (!Array.isArray(ports)) return null;
  const setCount = (text: string) => {
    const count = Number(text);
    if (editor.readOnly || !Number.isInteger(count) || count < BUTTON_LIMIT.min || count > BUTTON_LIMIT.max || ports.length === count) return;
    const path = ['ports', 'pushbuttons', 'ports'];
    editor.change(path, ports.length < count ? [...ports, ...Array.from({ length: count - ports.length }, () => '')] : ports.slice(0, count));
  };
  return <EditorField editor={editor} field={field} valueOverride={ports.length} onValueChange={setCount} />;
}
