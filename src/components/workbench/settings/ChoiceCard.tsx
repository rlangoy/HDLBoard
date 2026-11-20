// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import { Fragment, useId, type ReactNode } from 'react';
import { cx } from '../../board';
import { PageCard } from '../page/PageCard';
import type { Setting } from './settingsSections';

export interface Choice<T extends string> {
  readonly value: T;
  readonly label: string;
  readonly hint: string;
  /** More choices that belong to this one, shown below it: Synthesis's quick or tool check. */
  readonly nested?: ReactNode;
}

interface ChoiceListProps<T extends string> {
  readonly choices: readonly Choice<T>[];
  readonly setting: Setting<T>;
  /** Shown but not choosable: the choices of an option that is not chosen. */
  readonly disabled?: boolean;
  /** The group's name for a screen reader, when no card title says it. */
  readonly label?: string;
}

/** Radio choices, one of which is the setting's value. */
export function ChoiceList<T extends string>({ choices, setting, disabled = false, label }: ChoiceListProps<T>) {
  const groupName = useId();
  return (
    <div className="wb-settings-options" role="radiogroup" aria-label={label} aria-disabled={disabled || undefined}>
      {choices.map((choice) => {
        const selected = setting.value === choice.value;
        return (
          <Fragment key={choice.value}>
            <label className={cx('wb-settings-choice wb-settings-option', selected && 'is-selected', disabled && 'is-disabled')}>
              <input
                type="radio"
                name={groupName}
                value={choice.value}
                checked={selected}
                disabled={disabled}
                onChange={() => setting.onChange(choice.value)}
              />
              <span>
                <strong>{choice.label}</strong>
                <span className="wb-settings__note">{choice.hint}</span>
              </span>
            </label>
            {choice.nested !== undefined && <div className="wb-settings-suboptions">{choice.nested}</div>}
          </Fragment>
        );
      })}
    </div>
  );
}

/** A card of radio choices, one of which is the setting's value. */
export function ChoiceCard<T extends string>({ title, choices, setting }: { title: string; choices: readonly Choice<T>[]; setting: Setting<T> }) {
  return (
    <PageCard title={title} wide>
      <ChoiceList choices={choices} setting={setting} />
    </PageCard>
  );
}
