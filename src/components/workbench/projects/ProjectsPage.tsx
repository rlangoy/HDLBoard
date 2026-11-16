// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import { useState, type ReactNode } from 'react';
import { CloseIcon, LinkIcon, PlusIcon } from '../icons';
import type { NewFileLanguage } from '../newFile';
import type { MenuAction } from '../ProjectMenu';
import { Page } from '../page/Page';
import { PageHeader } from '../page/PageHeader';
import type { OpenProject, ProjectDetails, ProjectEntryRow } from '../projectFile';
import { ScrollArea } from '../ScrollArea';
import { CurrentProjectCard } from './CurrentProjectCard';
import { MoreMenuButton } from './MoreMenuButton';
import { emptyDraft, isBlank, type NewProjectChoice, type NewProjectDraft } from './newProjectForm';
import { NewProjectSection } from './NewProjectSection';
import type { OpenProjectInfo } from './openProject';
import { ProjectAdvancedCard } from './ProjectAdvancedCard';
import { ProjectDetailsCard, type BoardChoice, type NameRequest } from './ProjectDetailsCard';
import { AddFilesCard, type AddProjectFiles } from './AddFilesCard';
import { ProjectFilesCard, type ProjectFileActions } from './ProjectFilesCard';
import { ProjectListSection, type ProjectListsProps } from './ProjectListSection';
import { ACTIVE_SECTION, FIRST_SECTION, isListSection, NEW_SECTION, pageOf, projectsSection, type ListSectionId, type ProjectsSectionId } from './projectsSections';
import { ProjectsSidebar, SECTION_ICONS } from './ProjectsSidebar';
import type { NameAsk } from './useProjectsPage';
import { ProjectStorageCard, type GitHubStorage, type LocalStorage } from './ProjectStorageCard';
import './ProjectsPage.css';
import { useActiveProjectNavigation } from './useActiveProjectNavigation';

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
  addFiles: AddProjectFiles;
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
  newProject: NewProjectSettings;
}

/** What New project starts from. */
export interface NewProjectSettings {
  /** The first language ticked in Settings › Languages. */
  readonly language: NewFileLanguage;
  /** The files now in Files, which Keep files adds to the new project. */
  readonly filesNow: readonly string[];
}

const TITLE_ID = 'wb-projects-title';

/**
 * The Projects page (issue #44), in the editor's place like Settings: a sidebar of where
 * projects are stored and New project, then the active project and its file actions. The lists
 * have the open project on top; Active project shows it in full, with where Save writes it.
 */
export function ProjectsPage(props: ProjectsPageProps) {
  const { section, onClose, info, saves, lists, active, nameAsk } = props;
  const pageSection = pageOf(section);
  const { label, intro } = projectsSection(pageSection);
  const name = nameGuard(active.needsName, nameAsk);
  const flow = useNewProjectFlow(section, props.onSectionChange, props.newProject.language);
  const navigation = useActiveProjectNavigation(section, flow.select);
  const sidebar = (
    <ProjectsSidebar current={section} unsaved={info.unsaved} onSelect={navigation.select} onBack={onClose} onAddFiles={navigation.showAddExistingFiles} />
  );
  const shown: ShownSection = {
    page: props,
    busy: active.busy !== null || active.github.projects.busy !== null,
    saves: { toComputer: name.withName(saves.toComputer), toGitHub: name.withName(saves.toGitHub) },
    name,
    flow,
    openNewProject: () => flow.select(NEW_SECTION.id),
    unfoldAddFiles: navigation.unfoldingAddFiles,
  };

  return (
    <Page className="wb-projects" titleId={TITLE_ID} onClose={onClose} sidebar={sidebar}>
      <PageHeader titleId={TITLE_ID} icon={SECTION_ICONS[pageSection]} title={label} subtitle={intro} closeLabel="Close projects" onClose={onClose}>
        {isListSection(section) && <MoreMenuButton label="More: new project, open another" actions={listsMenu(lists, shown.openNewProject)} />}
      </PageHeader>
      {/* Overview and Files share the mounted page and its card state. */}
      <ScrollArea key={pageSection} className="wb-page__scroll">
        <div ref={navigation.bodyRef} className="wb-projects__body">{sectionBody(pageSection, shown)}</div>
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
  name: NameGuard;
  flow: NewProjectFlow;
  openNewProject: () => void;
  /** Add files unfolds for the sidebar's Add file (useActiveProjectNavigation). */
  unfoldAddFiles: boolean;
}

/** The section's body: one of the lists, or a section of its own. */
function sectionBody(section: Exclude<ProjectsSectionId, 'active-files'>, shown: ShownSection): ReactNode {
  return isListSection(section) ? listBody(section, shown) : OWN_SECTION_BODIES[section](shown);
}

function listBody(section: ListSectionId, { page, name, flow, openNewProject }: ShownSection) {
  return (
    <ProjectListSection
      {...page.lists}
      section={section}
      openProject={page.info}
      onNewProject={openNewProject}
      onBackToWorkspace={page.onClose}
      onShowDetails={() => flow.select(ACTIVE_SECTION.id)}
      onRename={name.askForName}
    />
  );
}

/** The sections that are not lists, each drawn. */
const OWN_SECTION_BODIES: Readonly<Record<Exclude<ProjectsSectionId, ListSectionId | 'active-files'>, (shown: ShownSection) => ReactNode>> = {
  active: ({ page, busy, saves, name, openNewProject, unfoldAddFiles }) => (
    <>
      <CurrentProjectCard
        project={page.info}
        busy={busy}
        onSave={page.info.destination === 'github' ? saves.toGitHub : saves.toComputer}
        onOpenInWorkspace={page.onClose}
        menu={[...listsMenu(page.lists, openNewProject), closeProjectAction(page.active)]}
      />
      <ActiveProjectSection active={page.active} info={page.info} busy={busy} name={name.request} saves={saves} unfoldAddFiles={unfoldAddFiles} />
    </>
  ),
  new: ({ page, busy, flow }) => (
    <NewProjectSection
      draft={flow.draft}
      onDraftChange={flow.onDraftChange}
      boards={page.active.board.boards}
      workspace={{ openBoard: page.active.project.board, fileNames: page.newProject.filesNow }}
      openProject={page.info}
      busy={busy || page.lists.opening}
      onCreate={page.onCreateProject}
      onCancel={flow.cancel}
    />
  ),
};

/** The New project form's input, and where its Cancel goes back to. */
interface NewProjectFlow {
  readonly draft: NewProjectDraft;
  readonly onDraftChange: (draft: NewProjectDraft) => void;
  /** Shows a section; going to New project remembers where from, unless a new project is under way. */
  readonly select: (section: ProjectsSectionId) => void;
  /** Cancel: the form emptied, and back to the section the new project was started from. */
  readonly cancel: () => void;
}

/**
 * The New project form's input is kept while the page is open: a stop in Active project to
 * name and save the open project first, or Cancel in the question about Files' files, keeps
 * it, and Cancel afterwards still goes back to where the new project was started. A form
 * left blank starts over from wherever New project is opened next; the first section when
 * it was opened from outside the page.
 */
function useNewProjectFlow(section: ProjectsSectionId, onSectionChange: (section: ProjectsSectionId) => void, language: NewFileLanguage): NewProjectFlow {
  const [draft, setDraft] = useState<NewProjectDraft>(() => emptyDraft(language));
  const [startedFrom, setStartedFrom] = useState<ProjectsSectionId | null>(null);
  const select = (next: ProjectsSectionId) => {
    const startsNewProject = next === NEW_SECTION.id && section !== NEW_SECTION.id && isBlank(draft);
    if (startsNewProject) setStartedFrom(section);
    onSectionChange(next);
  };
  const cancel = () => {
    setDraft(emptyDraft(language));
    setStartedFrom(null);
    onSectionChange(startedFrom ?? FIRST_SECTION);
  };
  return { draft, onDraftChange: setDraft, select, cancel };
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
  unfoldAddFiles: boolean;
}

/** Active project: its details, where it is saved, its files, and the rest (issue #44), each card open. */
function ActiveProjectSection({ active, info, busy, name, saves, unfoldAddFiles }: ActiveProjectSectionProps) {
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
      <div data-project-files>
        <ProjectFilesCard project={active.project} rows={active.rows} busy={active.busy} actions={active.files} />
      </div>
      <AddFilesCard addFiles={active.addFiles} unfold={unfoldAddFiles} />
      <ProjectAdvancedCard project={active.project} onCloseProject={active.onCloseProject} />
    </>
  );
}

interface NameGuard {
  readonly request: NameRequest;
  /** Rename…: shows the name field. */
  readonly askForName: () => void;
  /** `save`, or, while the project has no name, the name field marked as missing. */
  readonly withName: (save: () => void) => () => void;
}

/** A project without a name is named in its details before it is saved anywhere. */
function nameGuard(needed: boolean, nameAsk: NameAsk): NameGuard {
  const withName = (save: () => void) => () => (needed ? nameAsk.ask(true) : save());
  const request: NameRequest = { needed, missing: nameAsk.missing, focusPending: nameAsk.focusPending, onFocused: nameAsk.onFocused };
  return { request, askForName: () => nameAsk.ask(false), withName };
}
