// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import { CloseIcon, LinkIcon, PlusIcon } from '../icons';
import type { MenuAction } from '../ProjectMenu';
import { Page } from '../page/Page';
import { PageHeader } from '../page/PageHeader';
import type { OpenProject, ProjectDetails, ProjectEntryRow } from '../projectFile';
import { ScrollArea } from '../ScrollArea';
import { CurrentProjectCard } from './CurrentProjectCard';
import type { OpenProjectInfo } from './openProject';
import { ProjectAdvancedCard } from './ProjectAdvancedCard';
import { ProjectDetailsCard, type BoardChoice, type NameRequest } from './ProjectDetailsCard';
import { ProjectFilesCard, type ProjectFileActions } from './ProjectFilesCard';
import { ProjectListSection, type ProjectListsProps } from './ProjectListSection';
import { projectsSection, type ProjectsSectionId } from './projectsSections';
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
}

const TITLE_ID = 'wb-projects-title';

/**
 * The Projects page (issue #44), in the editor's place like Settings: a sidebar of where
 * projects are stored, and the active project at its foot. The project open now is on top
 * of every section, with where Save writes it and the way back to the editor.
 */
export function ProjectsPage({ section, onSectionChange, onClose, info, saves, lists, active, nameAsk }: ProjectsPageProps) {
  const { label, intro } = projectsSection(section);
  const name = nameGuard(active.needsName, nameAsk);
  const guarded: ProjectSaves = { toComputer: name.withName(saves.toComputer), toGitHub: name.withName(saves.toGitHub) };
  const busy = active.busy !== null || active.github.projects.busy !== null;

  return (
    <Page className="wb-projects" titleId={TITLE_ID} onClose={onClose} sidebar={<ProjectsSidebar current={section} onSelect={onSectionChange} onBack={onClose} />}>
      <PageHeader titleId={TITLE_ID} icon={SECTION_ICONS[section]} title={label} subtitle={intro} closeLabel="Close projects" onClose={onClose}>
      </PageHeader>
      {/* Keyed by section, so another section starts at its top. */}
      <ScrollArea key={section} className="wb-page__scroll">
        <div className="wb-projects__body">
          <CurrentProjectCard
            project={info}
            busy={busy}
            onSave={info.destination === 'github' ? guarded.toGitHub : guarded.toComputer}
            onShowDetails={section === 'active' ? undefined : () => onSectionChange('active')}
            onOpenInWorkspace={onClose}
            menu={cardMenu(lists, active)}
          />
          {section === 'active' ? (
            <ActiveProjectSection active={active} info={info} busy={busy} name={name.request} saves={guarded} />
          ) : (
            <ProjectListSection
              {...lists}
              section={section}
              openProject={info}
              onBackToWorkspace={onClose}
              onShowDetails={() => onSectionChange('active')}
              onRename={name.askForName}
            />
          )}
        </div>
      </ScrollArea>
    </Page>
  );
}

/** The active project's ⋮ menu: starting or opening another project, and closing this one. */
function cardMenu(lists: ProjectListsProps, active: ActiveProjectProps): MenuAction[] {
  return [
    { label: 'New project', icon: <PlusIcon aria-hidden="true" />, onSelect: lists.onNewProject, detail: 'Name it, add files, then save it' },
    { label: 'Open from a URL or path…', icon: <LinkIcon aria-hidden="true" />, onSelect: lists.onOpenFromUrl },
    { label: 'Close project', icon: <CloseIcon aria-hidden="true" />, onSelect: active.onCloseProject, detail: 'Files keeps its files' },
  ];
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
