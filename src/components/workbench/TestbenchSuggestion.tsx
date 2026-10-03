// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import { FlaskIcon } from './icons';
import { TEXT, testbenchFoundIn } from './testbenchText';

export interface TestbenchSuggestionProps {
  fileName: string;
  onOpen: () => void;
  onDismiss: () => void;
}

/**
 * The non-modal chip of docs/impl_split_screen.md § 4.7: testbench code the layout
 * did not open for (weak evidence only, or typed since the last pair change).
 * `role="status"`, and it never takes focus.
 */
export function TestbenchSuggestion({ fileName, onOpen, onDismiss }: TestbenchSuggestionProps) {
  return (
    <div className="wb-tbchip" role="status">
      <FlaskIcon aria-hidden="true" />
      <span className="wb-tbchip__text">{testbenchFoundIn(fileName)}</span>
      <button type="button" className="wb-tbchip__open" onClick={onOpen}>
        {TEXT.openSplitView}
      </button>
      <button type="button" className="wb-tbchip__dismiss" aria-label={TEXT.dismiss} title={TEXT.dismiss} onClick={onDismiss}>
        ×
      </button>
    </div>
  );
}
