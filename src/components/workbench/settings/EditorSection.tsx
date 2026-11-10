// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import { useId } from 'react';
import { cx } from '../../board';
import type { SplitPreference } from '../editorView';
import { TEXT } from '../testbenchText';
import { PageCard } from '../page/PageCard';
import type { Setting } from './settingsSections';

export interface EditorSectionProps {
  /** When a testbench opens beside its design (docs/impl_split_screen.md § 4.2). */
  split: Setting<SplitPreference>;
}

interface SplitChoice {
  readonly value: SplitPreference;
  readonly label: string;
  readonly hint: string;
}

const SPLIT_CHOICES: readonly SplitChoice[] = [
  { value: 'auto', label: TEXT.settingAuto, hint: TEXT.settingAutoHint },
  { value: 'always', label: TEXT.settingAlways, hint: TEXT.settingAlwaysHint },
  { value: 'never', label: TEXT.settingNever, hint: TEXT.settingNeverHint },
];

/** Settings › Editor: the testbench split view, stored in this browser. */
export function EditorSection({ split }: EditorSectionProps) {
  const groupName = useId();
  return (
    <PageCard title={TEXT.settingTitle} wide>
      <div className="wb-settings-options">
        {SPLIT_CHOICES.map((choice) => {
          const selected = split.value === choice.value;
          return (
            <label key={choice.value} className={cx('wb-settings-choice wb-settings-option', selected && 'is-selected')}>
              <input type="radio" name={groupName} value={choice.value} checked={selected} onChange={() => split.onChange(choice.value)} />
              <span>
                <strong>{choice.label}</strong>
                <span className="wb-settings__note">{choice.hint}</span>
              </span>
            </label>
          );
        })}
      </div>
    </PageCard>
  );
}
