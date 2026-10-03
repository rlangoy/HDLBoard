// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import { useRef, type KeyboardEvent, type ReactNode } from 'react';
import { cx } from '../board';
import type { EditorView } from './editorView';
import { ChipIcon, FlaskIcon, SplitViewIcon } from './icons';
import { TEXT } from './testbenchText';

export interface ViewSwitchProps {
  view: EditorView;
  onChange: (view: EditorView) => void;
  /** Below the split's minimum width: Both is disabled, TB / RTL toggle (§ 4.9). */
  bothDisabled: boolean;
}

const OPTIONS: readonly { view: EditorView; label: string; title: string; icon: ReactNode }[] = [
  { view: 'tb', label: TEXT.tbLabel, title: TEXT.tbTooltip, icon: <FlaskIcon aria-hidden="true" /> },
  { view: 'both', label: TEXT.bothLabel, title: TEXT.bothTooltip, icon: <SplitViewIcon aria-hidden="true" /> },
  { view: 'rtl', label: TEXT.rtlLabel, title: TEXT.rtlTooltip, icon: <ChipIcon aria-hidden="true" /> },
];

/**
 * [TB | Both | RTL], a radio group in the tab strip (docs/impl_split_screen.md
 * § 4.2, § 4.11): order matches the panes, arrows move the checked radio, a choice
 * pins the view for the shown pair. Icon and text on every option.
 */
export function ViewSwitch({ view, onChange, bothDisabled }: ViewSwitchProps) {
  const groupRef = useRef<HTMLDivElement>(null);
  const enabled = OPTIONS.filter((o) => !(o.view === 'both' && bothDisabled));

  const handleKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const step = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0;
    if (step === 0) return;
    e.preventDefault();
    const at = Math.max(0, enabled.findIndex((o) => o.view === view));
    const next = enabled[(at + step + enabled.length) % enabled.length];
    onChange(next.view);
    groupRef.current?.querySelector<HTMLElement>(`[data-view="${next.view}"]`)?.focus();
  };

  return (
    <div className="wb-viewswitch" role="radiogroup" aria-label={TEXT.editorView} ref={groupRef} onKeyDown={handleKeyDown}>
      {OPTIONS.map((o) => {
        const disabled = o.view === 'both' && bothDisabled;
        const checked = o.view === view;
        return (
          <button
            key={o.view}
            type="button"
            role="radio"
            data-view={o.view}
            aria-checked={checked}
            aria-disabled={disabled || undefined}
            tabIndex={checked ? 0 : -1}
            title={disabled ? TEXT.tooNarrow : o.title}
            className={cx('wb-viewswitch__option', `is-${o.view}`, checked && 'is-checked')}
            onClick={() => !disabled && onChange(o.view)}
          >
            {o.icon}
            <span>{o.label}</span>
          </button>
        );
      })}
    </div>
  );
}
