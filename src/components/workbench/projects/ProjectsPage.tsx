// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import { useState, type ReactNode } from 'react';
import { findBoard } from '../../../boards/boardCatalog';
import { CloseIcon, LinkIcon, PlusIcon } from '../icons';
import type { NewFileLanguage } from '../newFile';
import type { MenuAction } from '../ProjectMenu';
import { Page } from '../page/Page';
import { PageHeader } from '../page/PageHeader';
import type { OpenProject, ProjectDetails, ProjectEntryRow } from '../projectFile';
import { ScrollArea } from '../ScrollArea';
import { CurrentProjectCard } from './CurrentProjectCard';
import { MoreMenuButton } from './MoreMenuButton';
import { emptyDraft, type NewProjectChoice, type NewProjectDraft } from './newProjectForm';
import { NewProjectSection } from './NewProjectSection';
import type { OpenProjectInfo } from './openProject';
import { ProjectAdvancedCard } from './ProjectAdvancedCard';
import { ProjectDetailsCard, type BoardChoice, type NameRequest } from './ProjectDetailsCard';
import { ProjectFilesCard, type ProjectFileActions } from './ProjectFilesCard';
import { ProjectListSection, type ProjectListsProps } from './ProjectListSection';
import { ACTIVE_SECTION, FIRST_SECTION, isListSection, NEW_SECTION, projectsSection, type ListSectionId, type ProjectsSectionId } from './projectsSections';
import { ProjectsSidebar, SECTION_ICONS } from './ProjectsSidebar';
import type { NameAsk } from './useProjectsPage';
import { ProjectStorageCard, type GitHubStorage, type LocalStorage } from './ProjectStorageCard';
import './ProjectsPage.css';

/** The open project's own settings, for the Active project section. */
export interface ActiveProjectProps {
  project: OpenProject;
  /** The project's files as they are now (projectEntries). */
  rows: readonly ProjectEntryRow[];
  /** Work in progress, e.g. "Saving the project…"; the buttons wait while it runs. */
  busy: string | null;
  /** The project has no name of its own yet (projectNeedsName): saving waits for one. */
  needsName: boolean;
  onDetailsChange: (details: ProjectDetails) => void;
  board: BoardChoice;
  files: ProjectFileActions;
  local: LocalStorage;
  github: GitHubStorage;
  onCloseProject: () => void;
}

/** The two ways to save the open project; each waits for a name first. */
export interface ProjectSaves {
  toComputer: () => void;
  toGitHub: () => void;
}

export interface ProjectsPageProps {
  section: ProjectsSectionId;
  onSectionChange: (section: ProjectsSectionId) => void;
  /** Back to workspace, Open in workspace, the close button and Esc. */
  onClose: () => void;
  info: OpenProjectInfo;
  saves: ProjectSaves;
  lists: ProjectListsProps;
  active: ActiveProjectProps;
  /** The name field, asked for (useProjectsPage). */
  nameAsk: NameAsk;
  /** New project › Create project: asks about the open project's unsaved changes, then creates the new one. */
  onCreateProject: (choice: NewProjectChoice) => void;
  /** The language New project starts on: the first one ticked in Settings › Languages. */
  newProjectLanguage: NewFileLanguage;
}

const TITLE_ID = 'wb-projects-title';

/**
 * The Projects page (issue #44), in the editor's place like Settings: a sidebar of where
 * projects are stored, then the active project and New project at its foot. The lists
 * have the open project on top; Active project shows it in full, with where Save writes it.
 */
export function ProjectsPage(props: ProjectsPageProps) {
  const { section, onClose, info, saves, lists, active, nameAsk } = props;
  const { label, intro } = projectsSection(section);
  const name = nameGuard(active.needsName, nameAsk);
  const navigation = useSectionReturn(section, props.onSectionChange);
  const shown: ShownSection = {
    page: props,
    busy: active.busy !== null || active.github.projects.busy !== null,
    saves: { toComputer: name.withName(saves.toComputer), toGitHub: name.withName(saves.toGitHub) },
    name,
    navigation,
    draft: useNewProjectDraft(active, props.newProjectLanguage),
    openNewProject: () => navigation.select(NEW_SECTION.id),
  };

  return (
    <Page className="wb-projects" titleId={TITLE_ID} onClose={onClose} sidebar={<ProjectsSidebar current={section} unsaved={info.unsaved} onSelect={navigation.select} onBack={onClose} />}>
      <PageHeader titleId={TITLE_ID} icon={SECTION_ICONS[section]} title={label} subtitle={intro} closeLabel="Close projects" onClose={onClose}>
        {isListSection(section) && <MoreMenuButton label="More: new project, open another" actions={listsMenu(lists, shown.openNewProject)} />}
      </PageHeader>
      {/* Keyed by section, so another section starts at its top. */}
      <ScrollArea key={section} className="wb-page__scroll">
        <div className="wb-projects__body">{sectionBody(section, shown)}</div>
      </ScrollArea>
    </Page>
  );
}

/** What a section's body is drawn from: the page's props, and what the page worked out for them. */
interface ShownSection {
  page: ProjectsPageProps;
  busy: boolean;
  /** The saves, each waiting for a name first. */
  saves: ProjectSaves;
  name: ReturnType<typeof nameGuard>;
  navigation: ReturnType<typeof useSectionReturn>;
  draft: ReturnType<typeof useNewProjectDraft>;
  openNewProject: () => void;
}

/** The section's body: one of the lists, or a section of its own. */
function sectionBody(section: ProjectsSectionId, shown: ShownSection): ReactNode {
  return isListSection(section) ? listBody(section, shown) : OWN_SECTION_BODIES[section](shown);
}

function listBody(section: ListSectionId, { page, name, navigation, openNewProject }: ShownSection) {
  return (
    <ProjectListSection
      {...page.lists}
      section={section}
      openProject={page.info}
      onNewProject={openNewProject}
      onBackToWorkspace={page.onClose}
      onShowDetails={() => navigation.select(ACTIVE_SECTION.id)}
      onRename={name.askForName}
    />
  );
}

/** The sections that are not lists, each drawn. */
const OWN_SECTION_BODIES: Readonly<Record<Exclude<ProjectsSectionId, ListSectionId>, (shown: ShownSection) => ReactNode>> = {
  active: ({ page, busy, saves, name, openNewProject }) => (
    <>
      <CurrentProjectCard
        project={page.info}
        busy={busy}
        onSave={page.info.destination === 'github' ? saves.toGitHub : saves.toComputer}
        onOpenInWorkspace={page.onClose}
        menu={[...listsMenu(page.lists, openNewProject), closeProjectAction(page.active)]}
      />
      <ActiveProjectSection active={page.active} info={page.info} busy={busy} name={name.request} saves={saves} />
    </>
  ),
  new: ({ page, busy, navigation, draft }) => (
    <NewProjectSection
      draft={draft.draft}
      onDraftChange={draft.onDraftChange}
      boards={page.active.board.boards}
      openProject={page.info}
      busy={busy || page.lists.opening}
      onCreate={page.onCreateProject}
      onCancel={() => {
        draft.clear();
        navigation.back();
      }}
    />
  ),
};

/**
 * Section changes that remember where New project was opened from, so its Cancel goes
 * back there (to the first section when the page was opened at New project).
 */
function useSectionReturn(section: ProjectsSectionId, onSectionChange: (section: ProjectsSectionId) => void) {
  const [returnTo, setReturnTo] = useState<ProjectsSectionId>(FIRST_SECTION);
  const select = (next: ProjectsSectionId) => {
    if (next === NEW_SECTION.id && section !== NEW_SECTION.id) setReturnTo(section);
    onSectionChange(next);
  };
  return { select, back: () => onSectionChange(returnTo) };
}

/**
 * The New project form's input, kept while the page is open: leaving the section to save
 * the open project first, or cancelling the question about Files' files, keeps what was
 * typed; Cancel clears it. It starts on the open project's board, if that board is installed here.
 */
function useNewProjectDraft(active: ActiveProjectProps, language: NewFileLanguage) {
  const startingDraft = () => emptyDraft(findBoard(active.board.boards, active.project.board).board.id, language);
  const [draft, setDraft] = useState<NewProjectDraft>(startingDraft);
  return { draft, onDraftChange: setDraft, clear: () => setDraft(startingDraft()) };
}

/** The ⋮ menu of the lists' header: starting or opening another project. */
function listsMenu(lists: ProjectListsProps, onNewProject: () => void): MenuAction[] {
  return [
    { label: 'New project', icon: <PlusIcon aria-hidden="true" />, onSelect: onNewProject, detail: 'Name it, choose a board and a language' },
    { label: 'Open from a URL or path…', icon: <LinkIcon aria-hidden="true" />, onSelect: lists.onOpenFromUrl },
  ];
}

/** On the active project's own menu, after the lists' entries. */
function closeProjectAction(active: ActiveProjectProps): MenuAction {
  return { label: 'Close project', icon: <CloseIcon aria-hidden="true" />, onSelect: active.onCloseProject, detail: 'Files keeps its files' };
}

interface ActiveProjectSectionProps {
  active: ActiveProjectProps;
  info: OpenProjectInfo;
  busy: boolean;
  name: NameRequest;
  /** The saves, each waiting for a name first. */
  saves: ProjectSaves;
}

/** Active project: its details, where it is saved, its files, and the rest (issue #44), each card open. */
function ActiveProjectSection({ active, info, busy, name, saves }: ActiveProjectSectionProps) {
  return (
    <>
      <ProjectDetailsCard project={active.project} onChange={active.onDetailsChange} board={active.board} name={name} />
      <ProjectStorageCard
        project={active.project}
        info={info}
        busy={busy}
        local={active.local}
        github={active.github}
        onSaveToComputer={saves.toComputer}
        onSaveToGitHub={saves.toGitHub}
      />
      <ProjectFilesCard project={active.project} rows={active.rows} busy={active.busy} actions={active.files} />
      <ProjectAdvancedCard project={active.project} onCloseProject={active.onCloseProject} />
    </>
  );
}

/** A project without a name is named in its details before it is saved anywhere. */
function nameGuard(needed: boolean, nameAsk: NameAsk) {
  const withName = (save: () => void) => () => (needed ? nameAsk.ask(true) : save());
  const request: NameRequest = { needed, missing: nameAsk.missing, focusPending: nameAsk.focusPending, onFocused: nameAsk.onFocused };
  return { request, askForName: () => nameAsk.ask(false), withName };
}
