// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import { PairList, type PairOption } from './EditorPaneHeader';
import { ChipIcon, FlaskIcon } from './icons';
import { usePopover } from './RoleIcon';
import { TEXT } from './testbenchText';
import type { PaneRole } from './editorView';

export interface TestbenchEmptyStateProps {
  /** The pane that has nothing to show. */
  pane: PaneRole;
  message: string;
  /** TB side only: make `<stem>_tb` and pair it. */
  onCreate?: () => void;
  pairOptions: readonly PairOption[];
  onPairWith: (fileId: string) => void;
  /** Pin the other side alone. */
  onShowOther: () => void;
}

/**
 * A pane whose side of the pair is missing (docs/impl_split_screen.md § 4.6): what
 * is missing, and what to do about it.
 */
export function TestbenchEmptyState({ pane, message, onCreate, pairOptions, onPairWith, onShowOther }: TestbenchEmptyStateProps) {
  const open = usePopover<HTMLSpanElement>();
  const Icon = pane === 'tb' ? FlaskIcon : ChipIcon;
  return (
    <div className={`wb-split-empty is-${pane}`}>
      <p className="wb-split-empty__message">
        <Icon aria-hidden="true" />
        {message}
      </p>
      <div className="wb-split-empty__actions">
        {onCreate && (
          <button type="button" className="wb-split-empty__btn is-primary" onClick={onCreate}>
            {TEXT.createTestbench}
          </button>
        )}
        <span className="wb-split-empty__open" ref={open.rootRef}>
          <button type="button" className="wb-split-empty__btn" aria-expanded={open.open} onClick={() => open.setOpen(!open.open)}>
            {TEXT.openExisting}
          </button>
          {open.open && (
            <div className="wb-menu" role="menu">
              <PairList options={pairOptions} onPick={(id) => { open.setOpen(false); onPairWith(id); }} />
            </div>
          )}
        </span>
        <button type="button" className="wb-split-empty__btn" onClick={onShowOther}>
          {pane === 'tb' ? TEXT.showDesignOnly : TEXT.showTestbenchOnly}
        </button>
      </div>
    </div>
  );
}
