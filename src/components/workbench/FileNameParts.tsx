// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import type { KeyboardEvent } from 'react';
import { DESIGN_UNIT, newFileName, type NewFileLanguage } from './newFile';

/**
 * The parts of a new file's name field that New File (NewFileDialog) and Project files'
 * Create new file (NewFileForm) share, so the two say the same and behave the same.
 */

interface FileNameInputProps {
  id: string;
  className: string;
  value: string;
  onChange: (value: string) => void;
  /** The name cannot be used, and its hint says why. */
  invalid: boolean;
  /** The hint's id. */
  describedBy: string;
  onKeyDown?: (event: KeyboardEvent<HTMLInputElement>) => void;
}

/** The name field: focused as it opens, its text selected, so typing replaces the suggestion. */
export function FileNameInput({ id, className, value, onChange, invalid, describedBy, onKeyDown }: FileNameInputProps) {
  return (
    <input
      id={id}
      className={className}
      type="text"
      value={value}
      onChange={(event) => onChange(event.target.value)}
      onFocus={(event) => event.target.select()}
      onKeyDown={onKeyDown}
      autoFocus
      spellCheck={false}
      autoComplete="off"
      aria-invalid={invalid}
      aria-describedby={describedBy}
    />
  );
}

interface NewFileHintProps {
  name: string;
  language: NewFileLanguage;
  /** Why the name cannot be used, when that is to be shown. */
  error: string | undefined;
  /** A testbench gets no ports. */
  kind?: 'design' | 'testbench';
  /** The board whose ports a design gets; "the board's" when not named. */
  boardName?: string;
}

/** What creating the file will make, or why it cannot. */
export function NewFileHint({ name, language, error, kind = 'design', boardName }: NewFileHintProps) {
  if (error !== undefined) return <span className="wb-newfile__error">{error}</span>;
  if (name.trim() === '') return <>Enter a name for the new file.</>;
  const ports = kind === 'testbench' ? ': an empty testbench, no ports.' : ` and the ${boardName ?? 'board'}'s ports.`;
  return (
    <>
      Creates <strong>{newFileName(name, language)}</strong> with {DESIGN_UNIT[language]} of the same name{ports}
    </>
  );
}
