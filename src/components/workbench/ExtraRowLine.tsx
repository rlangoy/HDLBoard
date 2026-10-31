// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import { cx } from '../board';
import type { QuickFix } from './diagnosticAdvice';
import { QUICK_FIX_SHORTCUT, quickFixTitle } from './diagnosticText';
import type { ExtraRow } from './extraRows';
import { LightbulbIcon } from './icons';

/** Text with `code` in backticks, as the advice headlines write it. */
function CodeText({ text }: { text: string }) {
  return (
    <>
      {text.split('`').map((part, i) => (i % 2 === 1 ? <code key={i}>{part}</code> : part))}
    </>
  );
}

function QuickFixButton({ fix, onApply }: { fix: QuickFix; onApply: () => void }) {
  return (
    <button
      type="button"
      className="wb-editor__quickfix"
      // Kept out of the keyboard order: the code is aria-hidden here, and Ctrl+. in the code does the same.
      tabIndex={-1}
      title={`Quick Fix (${QUICK_FIX_SHORTCUT})`}
      // Not a click in the code: the markers it belongs to must stay.
      onPointerDown={(e) => e.stopPropagation()}
      onClick={onApply}
    >
      <LightbulbIcon className="wb-editor__quickfix-bulb" aria-hidden="true" />
      <CodeText text={quickFixTitle(fix)} />
      <kbd>{QUICK_FIX_SHORTCUT}</kbd>
    </button>
  );
}

/**
 * One row the editor adds under a marked line (extraRows.ts): part of its message,
 * or its Quick Fix. It stays at the left edge of the view however far the code is
 * scrolled sideways, so it is never out of reach.
 */
export function ExtraRowLine({ row, onApplyFix }: { row: ExtraRow; onApplyFix: (line: number) => void }) {
  const indent = ' '.repeat(row.indent);
  if (row.kind === 'fix') {
    return (
      <div className="wb-editor__extra-row is-fix">
        {indent}
        <QuickFixButton fix={row.fix} onApply={() => onApplyFix(row.line)} />
      </div>
    );
  }
  return (
    <div className={cx('wb-editor__extra-row', `is-${row.severity}`)}>
      {indent}
      <span className={cx('wb-editor__diag-inline', 'is-below', `is-${row.severity}`)}>
        <CodeText text={row.text} />
      </span>
    </div>
  );
}
