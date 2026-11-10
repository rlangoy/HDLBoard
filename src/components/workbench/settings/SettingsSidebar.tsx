// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import type { ReactNode } from 'react';
import { WaveformIcon } from '../../waveform/WaveformButton';
import { CodeIcon, GearIcon, HelpCircleIcon, RefreshIcon } from '../icons';
import { LogoMark } from '../logo';
import { PageSidebar, type PageNavEntry } from '../page/PageSidebar';
import { PREFERENCE_SECTIONS, SUPPORT_SECTIONS, type SettingsSection, type SettingsSectionId } from './settingsSections';

const SECTION_ICONS: Readonly<Record<SettingsSectionId, ReactNode>> = {
  general: <GearIcon />,
  board: <LogoMark />,
  editor: <CodeIcon />,
  simulation: <WaveformIcon />,
  updates: <RefreshIcon />,
  help: <HelpCircleIcon />,
};

const navEntry = (section: SettingsSection): PageNavEntry<SettingsSectionId> => ({ ...section, icon: SECTION_ICONS[section.id] });

/** The settings, then, ruled off, Help & feedback. */
const NAV_GROUPS = [PREFERENCE_SECTIONS.map(navEntry), SUPPORT_SECTIONS.map(navEntry)];

export interface SettingsSidebarProps {
  current: SettingsSectionId;
  onSelect: (section: SettingsSectionId) => void;
  onBack: () => void;
}

export function SettingsSidebar({ current, onSelect, onBack }: SettingsSidebarProps) {
  return <PageSidebar label="Settings sections" groups={NAV_GROUPS} current={current} onSelect={onSelect} onBack={onBack} />;
}
