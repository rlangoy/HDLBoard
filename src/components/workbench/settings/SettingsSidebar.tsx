// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import type { ReactNode } from 'react';
import { WaveformIcon } from '../../waveform/WaveformButton';
import { ArrowLeftIcon, CodeIcon, GearIcon, HelpCircleIcon, RefreshIcon } from '../icons';
import { LogoMark } from '../logo';
import { PREFERENCE_SECTIONS, SUPPORT_SECTIONS, type SettingsSection, type SettingsSectionId } from './settingsSections';

const SECTION_ICONS: Readonly<Record<SettingsSectionId, ReactNode>> = {
  general: <GearIcon />,
  board: <LogoMark />,
  editor: <CodeIcon />,
  simulation: <WaveformIcon />,
  updates: <RefreshIcon />,
  help: <HelpCircleIcon />,
};

export interface SettingsSidebarProps {
  current: SettingsSectionId;
  onSelect: (section: SettingsSectionId) => void;
  onBack: () => void;
}

/** The way back to the workspace, then one entry per section; the current one is marked. */
export function SettingsSidebar({ current, onSelect, onBack }: SettingsSidebarProps) {
  const renderEntry = (section: SettingsSection) => (
    <li key={section.id}>
      <button
        type="button"
        className="wb-settings-nav__item"
        aria-current={section.id === current ? 'page' : undefined}
        onClick={() => onSelect(section.id)}
      >
        <span className="wb-settings-nav__icon">{SECTION_ICONS[section.id]}</span>
        {section.label}
      </button>
    </li>
  );
  return (
    <aside className="wb-settings__sidebar">
      <button type="button" className="wb-settings__back" onClick={onBack}>
        <ArrowLeftIcon aria-hidden="true" />
        Back to workspace
      </button>
      <nav className="wb-settings-nav" aria-label="Settings sections">
        <ul>{PREFERENCE_SECTIONS.map(renderEntry)}</ul>
        <ul className="wb-settings-nav__support">{SUPPORT_SECTIONS.map(renderEntry)}</ul>
      </nav>
    </aside>
  );
}
