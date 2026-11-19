// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import type { SplitPreference } from '../editorView';
import { TEXT } from '../testbenchText';
import { ChoiceCard, type Choice } from './ChoiceCard';
import type { Setting } from './settingsSections';

export interface EditorSectionProps {
  /** When a testbench opens beside its design (docs/impl_split_screen.md § 4.2). */
  split: Setting<SplitPreference>;
}

const SPLIT_CHOICES: readonly Choice<SplitPreference>[] = [
  { value: 'auto', label: TEXT.settingAuto, hint: TEXT.settingAutoHint },
  { value: 'always', label: TEXT.settingAlways, hint: TEXT.settingAlwaysHint },
  { value: 'never', label: TEXT.settingNever, hint: TEXT.settingNeverHint },
];

/** Settings › Editor: the testbench split view, stored in this browser. */
export function EditorSection({ split }: EditorSectionProps) {
  return <ChoiceCard title={TEXT.settingTitle} choices={SPLIT_CHOICES} setting={split} />;
}
