// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import type { ReactNode } from 'react';
import { cx } from '../../board';
import { CheckIcon, GearIcon } from '../icons';
import { Page } from '../page/Page';
import { PageHeader } from '../page/PageHeader';
import { APP_NAME } from '../project';
import { ScrollArea } from '../ScrollArea';
import { BoardIoSection, type BoardIoSectionProps } from './BoardIoSection';
import { EditorSection, type EditorSectionProps } from './EditorSection';
import { GeneralSection, type GeneralSectionProps } from './GeneralSection';
import { HelpFeedbackSection } from './HelpFeedbackSection';
import { sectionLabel, type SettingsSectionId } from './settingsSections';
import { SettingsSidebar } from './SettingsSidebar';
import { SimulationSection, type SimulationSectionProps } from './SimulationSection';
import { UpdatesSection, type UpdatesSectionProps } from './UpdatesSection';
import { useSavedNotice } from './useSavedNotice';
import './SettingsPage.css';

export interface SettingsPageProps {
  section: SettingsSectionId;
  onSectionChange: (section: SettingsSectionId) => void;
  /** Back to workspace, the close button and Esc: every setting is already saved. */
  onClose: () => void;
  general: GeneralSectionProps;
  boardIo: BoardIoSectionProps;
  editor: EditorSectionProps;
  simulation: SimulationSectionProps;
  updates: UpdatesSectionProps;
}

const SECTION_VIEWS: Readonly<Record<SettingsSectionId, (props: SettingsPageProps) => ReactNode>> = {
  general: (props) => <GeneralSection {...props.general} />,
  board: (props) => <BoardIoSection {...props.boardIo} />,
  editor: (props) => <EditorSection {...props.editor} />,
  simulation: (props) => <SimulationSection {...props.simulation} />,
  updates: (props) => <UpdatesSection {...props.updates} />,
  help: () => <HelpFeedbackSection />,
};

const TITLE_ID = 'wb-settings-title';

/**
 * Settings as a page in the editor's place (issue #42), beside Board I/O: a sidebar of
 * sections and the chosen section's cards. Each setting is saved the moment it changes,
 * so leaving needs no Save.
 */
export function SettingsPage(props: SettingsPageProps) {
  const { section, onSectionChange, onClose } = props;
  const saved = useSavedNotice();
  return (
    <Page className="wb-settings" titleId={TITLE_ID} onClose={onClose} sidebar={<SettingsSidebar current={section} onSelect={onSectionChange} onBack={onClose} />}>
      <PageHeader titleId={TITLE_ID} icon={<GearIcon />} title="Settings" subtitle={`Customize your ${APP_NAME} experience`} closeLabel="Close settings" onClose={onClose}>
        <SavedNotice justSaved={saved.justSaved} />
      </PageHeader>
      {/* Keyed by section, so another section starts at its top. */}
      <ScrollArea key={section} className="wb-page__scroll">
        {/* A change to any setting control bubbles up here, and each is saved as it is made. */}
        <div className="wb-settings__grid" role="region" aria-label={sectionLabel(section)} onChange={saved.notify}>
          {SECTION_VIEWS[section](props)}
        </div>
      </ScrollArea>
    </Page>
  );
}

/** Whether the last change was saved: every change is, at once. */
function SavedNotice({ justSaved }: { justSaved: boolean }) {
  return (
    <p className={cx('wb-settings__saved', justSaved && 'is-fresh')}>
      <CheckIcon aria-hidden="true" />
      {/* Only "Saved" is announced; the standing note returning is not news. */}
      <span role="status">{justSaved ? 'Saved' : ''}</span>
      {!justSaved && 'Changes are saved automatically'}
    </p>
  );
}
