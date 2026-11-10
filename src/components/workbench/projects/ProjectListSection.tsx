// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { Activity } from '../GitHubStatus';
import { AlertIcon, PlusIcon, ProjectIcon } from '../icons';
import type { ProjectListItem } from '../projectCatalog';
import { ProjectMenu } from '../ProjectMenu';
import type { LocalProjects } from '../useLocalProjects';
import { ListToolbar } from './ListToolbar';
import type { OpenProjectInfo } from './openProject';
import type { ProjectRow } from './projectRows';
import type { ListSectionId } from './projectsSections';
import { GitHubAccountCard, LocalFolderCard, SourcesFooter } from './ProjectSources';
import { ProjectTable } from './ProjectTable';
import { rowMenuActions, type RowMenuHandlers } from './rowMenu';
import { useProjectList, type ProjectList, type ProjectSources } from './useProjectList';

export interface ProjectListsProps extends ProjectSources {
  /** A project is being opened: every Open waits. */
  opening: boolean;
  onOpenItem: (item: ProjectListItem) => void;
  /** Starts a new, empty project and shows it in the Active project section. */
  onNewProject: () => void;
  onSignIn: () => void;
  /** The old way in: a project file by its URL or path. */
  onOpenFromUrl: () => void;
  /** Present only where a local project can be shown in Explorer (the Windows app). */
  onShowInFolder?: (path: string) => void;
}

export interface ProjectListSectionProps extends ProjectListsProps {
  section: ListSectionId;
  openProject: OpenProjectInfo;
  /** Open on the open project's row: back to the editor. */
  onBackToWorkspace: () => void;
  /** The open project's ⋮ › Project details and Rename. */
  onShowDetails: () => void;
  onRename: () => void;
}

/** One of the lists: where its projects are stored, a search and a sort, and the projects. */
export function ProjectListSection(props: ProjectListSectionProps) {
  const { section, connection, localProjects } = props;
  const list = useProjectList(section, props, props.openProject);
  const searchRef = useSearchFocusOnOpen();
  const [menu, setMenu] = useState<{ row: ProjectRow; anchor: HTMLElement } | null>(null);
  const closeMenu = useCallback(() => setMenu(null), []);
  const openRow = (row: ProjectRow) => {
    const item = row.places[0]?.item;
    if (row.isOpen) props.onBackToWorkspace();
    else if (item) props.onOpenItem(item);
  };
  const menuHandlers: RowMenuHandlers = { ...props, onOpen: openRow, onDeleteFromGitHub: props.gitHubProjects.remove };

  return (
    <div className="wb-projects__section" onKeyDown={(event) => focusSearchOnShortcut(event, searchRef.current)}>
      <PlaceHeader {...props} onRetry={list.refresh} />
      <ListToolbar list={list} searchRef={searchRef} />
      <ListOrWhyNot section={section} list={list} signedIn={connection.session !== null} onNewProject={props.onNewProject} onSignIn={props.onSignIn}>
        <ProjectTable rows={list.shown} query={list.query} opening={props.opening} onOpen={openRow} onMenu={(row, anchor) => setMenu({ row, anchor })} />
      </ListOrWhyNot>
      {section === 'all' && <SourcesFooter local={localProjects} connection={connection} onSignIn={props.onSignIn} />}
      <p className="wb-projects__aside">
        Have a project file somewhere else?{' '}
        <button type="button" className="wb-projects__link" onClick={props.onOpenFromUrl}>
          Open from a URL or path…
        </button>
      </p>
      {menu && <ProjectMenu anchor={menu.anchor} actions={rowMenuActions(menu.row, menuHandlers)} onClose={closeMenu} />}
    </div>
  );
}

/**
 * The search has the focus as the page opens (the list sections' Ctrl+F and / then work at
 * once); not when another section is chosen, where the focus stays in the sidebar.
 */
function useSearchFocusOnOpen() {
  const searchRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const search = searchRef.current;
    if (search && !search.closest('.wb-page')?.contains(document.activeElement)) search.focus();
  }, []);
  return searchRef;
}

/** Ctrl+F, or / outside a field, goes to the search. */
function focusSearchOnShortcut(event: KeyboardEvent, search: HTMLInputElement | null) {
  const typing = event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement;
  if (!(event.ctrlKey && event.key === 'f') && !(event.key === '/' && !typing)) return;
  event.preventDefault();
  search?.focus();
}

/** Above the list: the place's folder or account, what GitHub is doing, and why the folder could not be read. */
function PlaceHeader({ section, connection, gitHubProjects, localProjects, onSignIn, onRetry }: ProjectListSectionProps & { onRetry: () => void }) {
  return (
    <>
      {section === 'local' && <LocalFolderCard local={localProjects} />}
      {section === 'github' && <GitHubAccountCard connection={connection} onSignIn={onSignIn} />}
      {section !== 'local' && <Activity projects={gitHubProjects} />}
      {section !== 'github' && <LocalFolderError local={localProjects} onRetry={onRetry} />}
    </>
  );
}

/** The projects folder could not be read: why, with Try again. A folder never chosen is LocalFolderCard's. */
function LocalFolderError({ local, onRetry }: { local: LocalProjects; onRetry: () => void }) {
  if (local.error === null || local.folderState === 'none') return null;
  return (
    <div className="wb-projects__error" role="alert">
      <AlertIcon aria-hidden="true" />
      <span>Could not read the projects folder: {local.error}</span>
      <button type="button" className="wb-projects__btn" onClick={onRetry}>
        Try again
      </button>
    </div>
  );
}

interface ListOrWhyNotProps {
  section: ListSectionId;
  list: ProjectList;
  signedIn: boolean;
  onNewProject: () => void;
  onSignIn: () => void;
  /** The list, shown when there is something to list. */
  children: ReactNode;
}

/** The list; or, while there is nothing to list, why not and what to do about it. */
function ListOrWhyNot({ section, list, signedIn, onNewProject, onSignIn, children }: ListOrWhyNotProps) {
  if (list.loading) return <Skeletons />;
  if (section === 'github' && (!signedIn || list.gitHubUnread)) return <GitHubWhyNot signedIn={signedIn} onSignIn={onSignIn} onRetry={list.refresh} />;
  if (list.inSection.length === 0) {
    return (
      <EmptyState text={section === 'github' ? 'No projects on GitHub yet. Save one there from the Active project.' : 'No projects here yet.'}>
        <button type="button" className="wb-projects__btn is-primary" onClick={onNewProject}>
          <PlusIcon aria-hidden="true" />
          New project
        </button>
      </EmptyState>
    );
  }
  if (list.shown.length === 0) {
    return (
      <EmptyState text={`No projects match “${list.query.trim()}”.`}>
        <button type="button" className="wb-projects__btn" onClick={() => list.setQuery('')}>
          Clear search
        </button>
      </EmptyState>
    );
  }
  return <>{children}</>;
}

/** On GitHub lists nothing: signed out, or its list could not be read (there may well be projects there). */
function GitHubWhyNot({ signedIn, onSignIn, onRetry }: { signedIn: boolean; onSignIn: () => void; onRetry: () => void }) {
  if (!signedIn) {
    return (
      <EmptyState text="Sign in to GitHub to see the projects saved on your account.">
        <button type="button" className="wb-projects__btn is-primary" onClick={onSignIn}>
          Sign in to GitHub
        </button>
      </EmptyState>
    );
  }
  return (
    <EmptyState text="Your projects on GitHub could not be read.">
      <button type="button" className="wb-projects__btn" onClick={onRetry}>
        Try again
      </button>
    </EmptyState>
  );
}

function EmptyState({ text, children }: { text: string; children: ReactNode }) {
  return (
    <div className="wb-projects__empty">
      <ProjectIcon aria-hidden="true" />
      <p>{text}</p>
      {children}
    </div>
  );
}

function Skeletons() {
  return (
    <ul className="wb-projects__skeletons" aria-hidden="true">
      {[0, 1, 2].map((n) => (
        <li key={n} className="wb-projects__skeleton">
          <i className="is-tile" />
          <span>
            <i className="is-title" />
            <i className="is-text" />
          </span>
        </li>
      ))}
    </ul>
  );
}
