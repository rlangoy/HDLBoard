// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import { useId } from 'react';
import type { PaneRole } from './editorView';
import { usePopover } from './RoleIcon';
import { RULE_TEXT, TEXT, evidenceLine } from './testbenchText';
import type { AnalyzedUnit, UnitRole } from './tbDetect/types';

export interface EvidencePopoverProps {
  pane: PaneRole;
  unit: AnalyzedUnit | undefined;
  roleOverride: UnitRole | undefined;
  onRevealLine: (line: number) => void;
}

/**
 * "Why?" (docs/impl_split_screen.md § 4.4, AC-17): one row per piece of evidence
 * in the shown unit — its line, the construct, and a sentence on why it is
 * simulation-only. A row reveals its line. Detection as teaching material.
 */
export function EvidencePopover({ pane, unit, roleOverride, onRevealLine }: EvidencePopoverProps) {
  const popover = usePopover<HTMLSpanElement>();
  const titleId = useId();
  const evidence = unit?.evidence ?? [];
  return (
    <span className="wb-panehead__why" ref={popover.rootRef}>
      <button
        type="button"
        className="wb-panehead__btn wb-panehead__why-btn"
        aria-expanded={popover.open}
        aria-haspopup="dialog"
        title={TEXT.why}
        onClick={() => popover.setOpen(!popover.open)}
      >
        ?<span className="wb-sr-only">{TEXT.why}</span>
      </button>
      {popover.open && (
        <div className="wb-evidence" role="dialog" aria-labelledby={titleId}>
          <p className="wb-evidence__title" id={titleId}>
            {pane === 'tb' ? TEXT.whyTitle : TEXT.whyTitleDesign}
            {unit && ` — ${unit.name} (${unit.summary.score})`}
          </p>
          {roleOverride && <p className="wb-evidence__note">{TEXT.roleFromOverride}</p>}
          {evidence.length === 0 ? (
            <p className="wb-evidence__note">{TEXT.noEvidence}</p>
          ) : (
            <ul className="wb-evidence__list">
              {evidence.map((e, i) => (
                <li key={`${e.ruleId}-${e.line}-${i}`}>
                  <button
                    type="button"
                    className="wb-evidence__row"
                    onClick={() => {
                      popover.setOpen(false);
                      onRevealLine(e.line);
                    }}
                  >
                    <strong>
                      {evidenceLine(e.line)} — <code>{RULE_TEXT[e.ruleId].title}</code>
                    </strong>{' '}
                    <WithCode text={RULE_TEXT[e.ruleId].explanation} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </span>
  );
}

/** The explanations mark code with backticks, as the docs do: `wait for` -> <code>wait for</code>. */
function WithCode({ text }: { text: string }) {
  return <>{text.split('`').map((part, i) => (i % 2 === 1 ? <code key={i}>{part}</code> : part))}</>;
}
