// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy
import { useId, type ReactNode } from 'react';
import type { EditorField as Field } from '../../../boards/boardEditorFields';
import { fieldKey } from '../../../boards/boardEditorValidation';
import type { BoardPath } from '../../../boards/boardEditorModel';
import type { BoardEditor } from './useBoardEditor';

export interface FieldProps { editor: BoardEditor; field: Field; inputAction?: ReactNode; valueOverride?: unknown; onValueChange?: (value: string) => void }
export function EditorField({ editor, field, inputAction, valueOverride, onValueChange }: FieldProps) {
  const id = useId();
  const key = fieldKey(field);
  const error = editor.errors[key];
  const value = valueOverride ?? editor.get(field.path);
  const update = (text: string) => onValueChange ? onValueChange(text) : editor.change(field.path, fieldValue(field, text));
  const common = { id, value: String(value ?? ''), disabled: editor.saving || editor.readOnly, 'aria-invalid': !!error, 'aria-describedby': error ? `${id}-error` : undefined,
    onChange: (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => update(event.target.value) };
  return (
    <div className="bce-field" data-field={key}>
      <label htmlFor={id}>{field.label}{field.optional && <span className="bce-muted"> (optional)</span>}</label>
      <div className="bce-field-input">{inputAction}{field.kind === 'description' ? <textarea {...common} rows={3} /> :
        <input {...common} {...inputOptions(field)} spellCheck={false} />}</div>
      {error && <span id={`${id}-error`} className="bce-error">{error}</span>}
    </div>
  );
}

function fieldValue(field: Field, text: string): unknown {
  if (field.kind === 'number') return text === '' ? '' : Number(text);
  return field.optional && text === '' ? undefined : text;
}
function inputOptions(field: Field) {
  return { type: field.kind === 'number' ? 'number' : 'text', min: field.limit?.min, max: field.limit?.max,
    step: fieldKey(field) === 'ports.clockMHz' ? '0.001' : '1' };
}

interface PolarityProps { editor: BoardEditor; path: BoardPath; title: string; pressed?: boolean }
export function PolarityField({ editor, path, title, pressed = false }: PolarityProps) {
  const id = useId();
  const activeLow = editor.get(path) !== false;
  return (
    <fieldset className="bce-polarity" disabled={editor.saving || editor.readOnly}>
      <legend>{title}</legend>
      <div className="bce-radio-row">
        {[false, true].map((low) => <label key={String(low)} className={activeLow === low ? 'is-selected' : ''}>
          <input type="radio" name={id} checked={activeLow === low} onChange={() => editor.change(path, low)} />
          {low ? 'Low (0)' : 'High (1)'}
        </label>)}
      </div>
      <p className="bce-muted">{pressed ? `Pressing a button produces ${activeLow ? '0' : '1'}.` : `${activeLow ? '0' : '1'} turns ${title === 'Digit-enable polarity' ? 'a digit' : 'a segment'} on.`}</p>
    </fieldset>
  );
}
