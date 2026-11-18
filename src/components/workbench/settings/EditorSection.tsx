// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import { useId } from 'react';
import { cx } from '../../board';
import type { SplitPreference } from '../editorView';
import { DESIGN_CHECK_TEXT } from '../simOnly/designCheckText';
import type { DesignCheckMode } from '../simOnly/types';
import { TEXT } from '../testbenchText';
import { PageCard } from '../page/PageCard';
import type { Setting } from './settingsSections';

export interface EditorSectionProps {
  /** When a testbench opens beside its design (docs/impl_split_screen.md § 4.2). */
  split: Setting<SplitPreference>;
  /** Whether designs are checked for FPGA synthesis (docs/impl_sim_only_warnings.md § 6). */
  designCheck?: Setting<DesignCheckMode>;
}

interface Choice<T extends string> {
  readonly value: T;
  readonly label: string;
  readonly hint: string;
}

const SPLIT_CHOICES: readonly Choice<SplitPreference>[] = [
  { value: 'auto', label: TEXT.settingAuto, hint: TEXT.settingAutoHint },
  { value: 'always', label: TEXT.settingAlways, hint: TEXT.settingAlwaysHint },
  { value: 'never', label: TEXT.settingNever, hint: TEXT.settingNeverHint },
];

const DESIGN_CHECK_CHOICES: readonly Choice<DesignCheckMode>[] = [
  { value: 'synthesis', label: DESIGN_CHECK_TEXT.synthesis, hint: DESIGN_CHECK_TEXT.synthesisHint },
  { value: 'simulation', label: DESIGN_CHECK_TEXT.simulation, hint: DESIGN_CHECK_TEXT.simulationHint },
];

/** Settings › Editor: the testbench split view and the design check, stored in this browser. */
export function EditorSection({ split, designCheck }: EditorSectionProps) {
  return (
    <>
      <ChoiceCard title={TEXT.settingTitle} choices={SPLIT_CHOICES} setting={split} />
      {designCheck && <ChoiceCard title={DESIGN_CHECK_TEXT.title} choices={DESIGN_CHECK_CHOICES} setting={designCheck} />}
    </>
  );
}

/** A card of radio choices, one of which is the setting's value. */
function ChoiceCard<T extends string>({ title, choices, setting }: { title: string; choices: readonly Choice<T>[]; setting: Setting<T> }) {
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
