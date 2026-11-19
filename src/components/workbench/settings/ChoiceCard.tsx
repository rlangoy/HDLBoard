// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import { useId } from 'react';
import { cx } from '../../board';
import { PageCard } from '../page/PageCard';
import type { Setting } from './settingsSections';

export interface Choice<T extends string> {
  readonly value: T;
  readonly label: string;
  readonly hint: string;
}

/** A card of radio choices, one of which is the setting's value. */
export function ChoiceCard<T extends string>({ title, choices, setting }: { title: string; choices: readonly Choice<T>[]; setting: Setting<T> }) {
  const groupName = useId();
  return (
    <PageCard title={title} wide>
      <div className="wb-settings-options">
        {choices.map((choice) => {
          const selected = setting.value === choice.value;
          return (
            <label key={choice.value} className={cx('wb-settings-choice wb-settings-option', selected && 'is-selected')}>
              <input type="radio" name={groupName} value={choice.value} checked={selected} onChange={() => setting.onChange(choice.value)} />
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
