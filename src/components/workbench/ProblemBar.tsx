// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import { cx } from '../board';
import type { QuickFix } from './diagnosticAdvice';
import { QUICK_FIX_SHORTCUT, quickFixTitle, type BarProblem } from './diagnosticText';
import { LightbulbIcon } from './icons';
import './ProblemBar.css';

const SEVERITY_GLYPH: Record<BarProblem['severity'], string> = { error: '✕', warning: '!' };

/** Text with `code` in backticks, as the advice headlines write it. */
function CodeText({ text }: { text: string }) {
  return (
    <>
      {text.split('`').map((part, i) => (i % 2 === 1 ? <code key={i}>{part}</code> : part))}
    </>
  );
}

export interface ProblemBarProps {
  /** The file's first problem; none while nothing is marked. */
  problem: BarProblem | undefined;
  /** What the last Quick Fix did, shown while there is no problem to show. */
  applied: string | undefined;
  onApplyFix: () => void;
}

/**
 * The strip under the code: the first problem in full — the inline text after a
 * long line can run past the editor's edge, and a textarea cannot scroll to it —
 * and its Quick Fix as a button, as VS Code's light bulb offers one.
 */
export function ProblemBar({ problem, applied, onApplyFix }: ProblemBarProps) {
  if (problem) return <ProblemRow problem={problem} onApplyFix={onApplyFix} />;
  if (applied) return <AppliedRow note={applied} />;
  return null;
}

function ProblemRow({ problem, onApplyFix }: { problem: BarProblem; onApplyFix: () => void }) {
  return (
    <div className={cx('wb-problembar', `is-${problem.severity}`)} role="group" aria-label="Problem">
      <span className="wb-problembar__glyph" aria-hidden="true">
        {SEVERITY_GLYPH[problem.severity]}
      </span>
      <span className="wb-problembar__text">
        <span className="wb-problembar__line">Line {problem.line}:</span> <CodeText text={problem.text} />
      </span>
      {problem.fix && <QuickFixButton fix={problem.fix} onClick={onApplyFix} />}
    </div>
  );
}

function QuickFixButton({ fix, onClick }: { fix: QuickFix; onClick: () => void }) {
  return (
    <button
      type="button"
      className="wb-problembar__fix"
      onClick={onClick}
      title={`Quick Fix (${QUICK_FIX_SHORTCUT})`}
      aria-keyshortcuts="Control+."
    >
      <LightbulbIcon className="wb-problembar__bulb" aria-hidden="true" />
      <CodeText text={quickFixTitle(fix)} />
      <kbd>{QUICK_FIX_SHORTCUT}</kbd>
    </button>
  );
}

/** Confirms the Quick Fix that went in. */
function AppliedRow({ note }: { note: string }) {
  return (
    <div className="wb-problembar is-done" role="status">
      <span className="wb-problembar__glyph" aria-hidden="true">
        ✓
      </span>
      <span className="wb-problembar__text">
        <CodeText text={note} />
      </span>
    </div>
  );
}
