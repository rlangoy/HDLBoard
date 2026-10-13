// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { cx } from '../board';
import { copyText } from './clipboard';
import { Activity } from './GitHubStatus';
import {
  AlertIcon,
  ChevronDownIcon,
  CloseIcon,
  CopyIcon,
  DeleteIcon,
  FolderOpenIcon,
  GridIcon,
  InfoIcon,
  LaptopIcon,
  ListIcon,
  OpenInIcon,
  PlusIcon,
  ProjectIcon,
  RefreshIcon,
  RowsIcon,
  SearchIcon,
} from './icons';
import { ProjectCards, ProjectTable, type ProjectItemsProps } from './ProjectItems';
import { ProjectMenu, type MenuAction } from './ProjectMenu';
import {
  PROJECTS_PAGE_PREFS_KEY,
  filterItems,
  itemFromIndexEntry,
  parseProjectsPagePrefs,
  sortItems,
  type ProjectListItem,
  type ProjectsPagePrefs,
  type ProjectsView,
} from './projectCatalog';
import { MAX_LISTED_PROJECTS } from './localProjectScan';
import { shareLink } from './projectGitHub';
import { AccountCard, OpenNowCard, type OpenProjectInfo } from './ProjectsAccount';
import { ScrollArea } from './ScrollArea';
import type { GitHubConnection } from './useGitHub';
import type { GitHubProjects } from './useGitHubProjects';
import type { LocalProjects } from './useLocalProjects';
import './ProjectsPage.css';

export interface ProjectsPageProps {
  connection: GitHubConnection;
  gitHubProjects: GitHubProjects;
  localProjects: LocalProjects;
  openProject: OpenProjectInfo | null;
  /** A project is being opened: every Open button waits. */
  opening: boolean;
  onOpenItem: (item: ProjectListItem) => void;
  /** Starts a new, empty project and shows its project page. */
  onNewProject: () => void;
  onShowProjectPage: () => void;
  onSignIn: () => void;
  /** The old way in: a project file by its URL or path. */
  onOpenFromUrl: () => void;
  /** Present only where a local project can be shown in Explorer (the Windows app). */
  onShowInFolder?: (path: string) => void;
  /** Back to the code. */
  onClose: () => void;
}

const VIEWS: readonly { view: ProjectsView; label: string; icon: typeof RowsIcon }[] = [
  { view: 'compact', label: 'Compact list', icon: RowsIcon },
  { view: 'grid', label: 'Small icons', icon: GridIcon },
  { view: 'list', label: 'Details', icon: ListIcon },
];

/**
 * The Projects page (docs/project_browse_page.md): the projects in the local projects folder
 * and on GitHub in one list, shown over the editor like the project page. Opening and the
 * GitHub actions are the Workbench's; this page lists, searches and asks.
 */
export function ProjectsPage(props: ProjectsPageProps) {
  const { connection, gitHubProjects, localProjects, openProject, onClose } = props;
  const titleId = useId();
  const searchRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState('');
  const [prefs, setPrefs] = usePersistedPrefs();
  const [menu, setMenu] = useState<{ item: ProjectListItem; anchor: HTMLElement } | null>(null);

  useFocusSearchOnOpen(searchRef);

  const items = useProjectItems(connection, gitHubProjects, localProjects);
  const shown = useMemo(() => sortItems(filterItems(items, query, prefs.type), prefs.sort), [items, query, prefs.type, prefs.sort]);
  const readingGitHub = connection.session !== null && gitHubProjects.entries === null && gitHubProjects.busy !== null;
  const loading = items.length === 0 && (localProjects.scanning || readingGitHub);

  const isOpenNow = (item: ProjectListItem) =>
    openProject !== null && (item.gistId !== undefined ? item.gistId === openProject.gistId : item.location === openProject.location);
  const { onShowInFolder } = props;
  const listProps: ProjectItemsProps = {
    items: shown,
    query,
    opening: props.opening,
    isOpenNow,
    onOpen: props.onOpenItem,
    onMenu: (item, anchor) => setMenu({ item, anchor }),
    onShowInFolder: onShowInFolder && ((item) => onShowInFolder(item.location)),
  };

  const refresh = () => {
    localProjects.rescan();
    gitHubProjects.refresh();
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape' && !e.defaultPrevented && !(e.target instanceof HTMLSelectElement)) {
      e.preventDefault();
      onClose();
    } else if ((e.ctrlKey && e.key === 'f') || (e.key === '/' && !(e.target instanceof HTMLInputElement))) {
      e.preventDefault();
      searchRef.current?.focus();
    }
  };

  return (
    <section tabIndex={-1} className="wb-projects" aria-labelledby={titleId} onKeyDown={handleKeyDown}>
      <ScrollArea className="wb-projects__scroll">
        <div className="wb-projects__inner">
          <div className="wb-projects__top">
            <AccountCard connection={connection} onSignIn={props.onSignIn} />
            <button type="button" className="wb-projects__btn is-primary" onClick={props.onNewProject} aria-label="New project" title="Start a new project: name it, add files, then save it on this computer or on GitHub">
              <PlusIcon aria-hidden="true" />
              <span className="wb-projects__new-label">New project</span>
            </button>
            <button type="button" className="wb-projects__icon-btn is-close" onClick={onClose} aria-label="Close the projects page" title="Back to the code (Esc)">
              <CloseIcon aria-hidden="true" />
            </button>
          </div>

          {openProject && (
            <OpenNowCard project={openProject} busy={gitHubProjects.busy !== null} onShowProjectPage={props.onShowProjectPage} onSaveToGitHub={gitHubProjects.save} />
          )}
          <Activity projects={{ busy: gitHubProjects.busy, message: gitHubProjects.message?.tone === 'error' ? null : gitHubProjects.message }} />

          <div className="wb-projects__title-row">
            <div className="wb-projects__titles">
              <h2 id={titleId} className="wb-projects__title">
                My Projects
              </h2>
              <p className="wb-projects__subtitle">Projects on this computer and on GitHub, in one place.</p>
            </div>
            <button
              type="button"
              className={cx('wb-projects__icon-btn is-boxed', (localProjects.scanning || gitHubProjects.busy !== null) && 'is-spinning')}
              onClick={refresh}
              aria-label="Read the lists again"
              title="Read the lists again"
            >
              <RefreshIcon aria-hidden="true" />
            </button>
          </div>

          <Toolbar searchRef={searchRef} query={query} onQuery={setQuery} prefs={prefs} onPrefs={setPrefs} />
          <StatusLine local={localProjects} shown={shown.length} all={items} />
          <p className="wb-projects__sr" role="status">
            Showing {shown.length} of {items.length} projects
          </p>

          <ErrorBanner message={errorMessage(gitHubProjects, localProjects)} onRetry={refresh} />

          <Results
            loading={loading}
            all={items.length}
            shown={shown}
            query={query}
            prefs={prefs}
            listProps={listProps}
            onSort={(sort) => setPrefs({ ...prefs, sort })}
            onNewProject={props.onNewProject}
            onClearFilters={() => {
              setQuery('');
              setPrefs({ ...prefs, type: 'all' });
            }}
          />

          <p className="wb-projects__note">
            <InfoIcon aria-hidden="true" />
            <span>
              Local projects are the project files in your projects folder and the folders directly inside it. Projects on GitHub are stored as secret gists on your
              account.{' '}
              <button type="button" className="wb-projects__btn is-text" onClick={props.onOpenFromUrl}>
                Open from a URL or path…
              </button>
            </span>
          </p>
        </div>
      </ScrollArea>
      {menu && <ProjectMenu anchor={menu.anchor} actions={menuActionsFor(menu.item, gitHubProjects, props.onOpenItem, onShowInFolder)} onClose={() => setMenu(null)} />}
    </section>
  );
}

/** The local projects and, signed in, the user's projects on GitHub, as one list. */
function useProjectItems(connection: GitHubConnection, gitHubProjects: GitHubProjects, localProjects: LocalProjects): ProjectListItem[] {
  const login = connection.session?.user.login ?? null;
  const entries = gitHubProjects.entries;
  const local = localProjects.items;
  return useMemo(() => {
    const github = login !== null && entries !== null ? entries.map((entry) => itemFromIndexEntry(entry, login)) : [];
    return [...(local ?? []), ...github];
  }, [login, entries, local]);
}

/** The type, sort and view choices, kept in this browser (the search text is not). */
function usePersistedPrefs(): [ProjectsPagePrefs, (prefs: ProjectsPagePrefs) => void] {
  const [prefs, setPrefsState] = useState(() => parseProjectsPagePrefs(readStored()));
  const setPrefs = (next: ProjectsPagePrefs) => {
    setPrefsState(next);
    try {
      localStorage.setItem(PROJECTS_PAGE_PREFS_KEY, JSON.stringify(next));
    } catch {
      // Private window or blocked storage: the choice lasts for this visit.
    }
  };
  return [prefs, setPrefs];
}

function readStored(): string | null {
  try {
    return localStorage.getItem(PROJECTS_PAGE_PREFS_KEY);
  } catch {
    return null;
  }
}

/** The search field gets the focus as the page opens, and the button that opened it gets it back on close. */
function useFocusSearchOnOpen(searchRef: { current: HTMLInputElement | null }) {
  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    searchRef.current?.focus();
    return () => opener?.focus();
  }, [searchRef]);
}

function errorMessage(gitHubProjects: GitHubProjects, localProjects: LocalProjects): string | null {
  if (localProjects.error !== null) return `Could not read the projects folder: ${localProjects.error}`;
  return gitHubProjects.message?.tone === 'error' ? gitHubProjects.message.text : null;
}

function menuActionsFor(
  item: ProjectListItem,
  gitHubProjects: GitHubProjects,
  onOpen: (item: ProjectListItem) => void,
  onShowInFolder: ((path: string) => void) | undefined,
): MenuAction[] {
  const open: MenuAction = { label: 'Open', icon: <FolderOpenIcon aria-hidden="true" />, onSelect: () => onOpen(item) };
  const copy = (label: string, text: string): MenuAction => ({ label, icon: <CopyIcon aria-hidden="true" />, onSelect: () => void copyText(text) });
  if (item.source === 'github' && item.entry) {
    const entry = item.entry;
    return [
      open,
      copy('Copy share link', shareLink(window.location.href, { htmlUrl: entry.url })),
      { label: 'Delete from GitHub…', icon: <DeleteIcon aria-hidden="true" />, danger: true, onSelect: () => gitHubProjects.remove(entry) },
    ];
  }
  if (!onShowInFolder) return [open];
  return [
    open,
    copy('Copy path', item.location),
    { label: 'Show in Explorer', icon: <OpenInIcon aria-hidden="true" />, onSelect: () => onShowInFolder(item.location) },
  ];
}

/* ---------------------------------------------------------------- toolbar and status */

interface ToolbarProps {
  searchRef: { current: HTMLInputElement | null };
  query: string;
  onQuery: (query: string) => void;
  prefs: ProjectsPagePrefs;
  onPrefs: (prefs: ProjectsPagePrefs) => void;
}

function Toolbar({ searchRef, query, onQuery, prefs, onPrefs }: ToolbarProps) {
  return (
    <div className="wb-projects__toolbar">
      <label className="wb-projects__search">
        <SearchIcon aria-hidden="true" />
        <input
          ref={searchRef}
          type="search"
          value={query}
          onChange={(e) => onQuery(e.target.value)}
          placeholder="Search projects and files…"
          aria-label="Search projects"
          autoComplete="off"
        />
      </label>
      <Select label="Language" value={prefs.type} onChange={(type) => onPrefs({ ...prefs, type })}>
        <option value="all">All types</option>
        <option value="vhdl">VHDL</option>
        <option value="verilog">Verilog</option>
      </Select>
      <Select label="Sort by" value={prefs.sort} onChange={(sort) => onPrefs({ ...prefs, sort })}>
        <option value="newest">Newest first</option>
        <option value="oldest">Oldest first</option>
        <option value="name">Name A–Z</option>
      </Select>
      <div className="wb-projects__segmented" role="radiogroup" aria-label="View">
        {VIEWS.map(({ view, label, icon: Icon }) => (
          <button key={view} type="button" role="radio" aria-checked={prefs.view === view} aria-label={label} title={label} onClick={() => onPrefs({ ...prefs, view })}>
            <Icon aria-hidden="true" />
          </button>
        ))}
      </div>
    </div>
  );
}

interface SelectProps<T extends string> {
  label: string;
  value: T;
  onChange: (value: T) => void;
  children: React.ReactNode;
}

function Select<T extends string>({ label, value, onChange, children }: SelectProps<T>) {
  return (
    <span className="wb-projects__select">
      <select aria-label={label} value={value} onChange={(e) => onChange(e.target.value as T)}>
        {children}
      </select>
      <ChevronDownIcon aria-hidden="true" />
    </span>
  );
}

function StatusLine({ local, shown, all }: { local: LocalProjects; shown: number; all: readonly ProjectListItem[] }) {
  return (
    <div className="wb-projects__status">
      <FolderLine local={local} />
      <span>{countsText(shown, all)}</span>
    </div>
  );
}

function countsText(shown: number, all: readonly ProjectListItem[]): string {
  if (shown < all.length) return `Showing ${shown} of ${all.length}`;
  const local = all.filter((item) => item.source === 'local').length;
  return [local > 0 && `${local} local`, all.length - local > 0 && `${all.length - local} on GitHub`].filter(Boolean).join(' · ');
}

function FolderLine({ local }: { local: LocalProjects }) {
  const { folderState, folderLabel } = local;
  return (
    <span className="wb-projects__folder">
      <LaptopIcon aria-hidden="true" />
      {folderState === 'none' && (
        <>
          No local folder chosen.
          <button type="button" className="wb-projects__btn is-text" onClick={local.chooseFolder}>
            Choose folder…
          </button>
        </>
      )}
      {folderState === 'needs-permission' && (
        <>
          <button type="button" className="wb-projects__btn is-text" onClick={local.allowAccess}>
            Allow access to {folderLabel}
          </button>
          <button type="button" className="wb-projects__btn is-text" onClick={local.chooseFolder}>
            Change…
          </button>
        </>
      )}
      {folderState === 'ready' && (
        <>
          Local folder: <code title={folderLabel}>{folderLabel}</code>
          <button type="button" className="wb-projects__btn is-text" onClick={local.chooseFolder}>
            Change…
          </button>
          {!local.remembered && <span>(for this visit only)</span>}
          {local.truncated && <span>Showing the first {MAX_LISTED_PROJECTS} projects.</span>}
          {local.skipped.length > 0 && (
            <span title={local.skipped.map((file) => `${file.path}: ${file.reason}`).join('\n')}>
              {local.skipped.length === 1 ? '1 file could not be read.' : `${local.skipped.length} files could not be read.`}
            </span>
          )}
        </>
      )}
    </span>
  );
}

function ErrorBanner({ message, onRetry }: { message: string | null; onRetry: () => void }) {
  if (message === null) return null;
  return (
    <div className="wb-projects__error" role="alert">
      <AlertIcon aria-hidden="true" />
      <span>{message}</span>
      <button type="button" className="wb-projects__btn" onClick={onRetry}>
        Try again
      </button>
    </div>
  );
}

/* ---------------------------------------------------------------- the list, or why there is none */

interface ResultsProps {
  loading: boolean;
  all: number;
  shown: readonly ProjectListItem[];
  query: string;
  prefs: ProjectsPagePrefs;
  listProps: ProjectItemsProps;
  onSort: (sort: ProjectsPagePrefs['sort']) => void;
  onNewProject: () => void;
  onClearFilters: () => void;
}

function Results({ loading, all, shown, query, prefs, listProps, onSort, onNewProject, onClearFilters }: ResultsProps) {
  if (loading) return <Skeletons />;
  if (all === 0) {
    return (
      <EmptyState icon={<ProjectIcon aria-hidden="true" />} text="No projects yet. Create one, choose a local folder, or connect GitHub.">
        <button type="button" className="wb-projects__btn is-primary" onClick={onNewProject}>
          <PlusIcon aria-hidden="true" />
          New project
        </button>
      </EmptyState>
    );
  }
  if (shown.length === 0) {
    const text = query.trim() !== '' ? `No projects match “${query.trim()}”.` : `No ${prefs.type === 'vhdl' ? 'VHDL' : 'Verilog'} projects.`;
    return (
      <EmptyState icon={<SearchIcon aria-hidden="true" />} text={text}>
        <button type="button" className="wb-projects__btn" onClick={onClearFilters}>
          Clear filters
        </button>
      </EmptyState>
    );
  }
  if (prefs.view === 'compact') return <ProjectTable {...listProps} sort={prefs.sort} onSort={onSort} total={all} />;
  return <ProjectCards {...listProps} grid={prefs.view === 'grid'} />;
}

function EmptyState({ icon, text, children }: { icon: React.ReactNode; text: string; children: React.ReactNode }) {
  return (
    <div className="wb-projects__empty">
      {icon}
      <p>{text}</p>
      {children}
    </div>
  );
}

function Skeletons() {
  return (
    <ul className="wb-projects__list" aria-hidden="true">
      {[0, 1, 2].map((n) => (
        <li key={n} className="wb-projects__skeleton">
          <i className="is-tile" />
          <span>
            <i className="is-title" />
            <i className="is-text" />
            <i className="is-meta" />
          </span>
        </li>
      ))}
    </ul>
  );
}

export default ProjectsPage;
