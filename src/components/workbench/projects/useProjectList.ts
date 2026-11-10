// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import { useMemo, useState } from 'react';
import {
  PROJECTS_PAGE_PREFS_KEY,
  filterItems,
  itemFromIndexEntry,
  parseProjectsPagePrefs,
  sortItems,
  storedProjectsPagePrefs,
  type ProjectListItem,
  type SortOrder,
} from '../projectCatalog';
import type { GitHubConnection } from '../useGitHub';
import type { GitHubProjects } from '../useGitHubProjects';
import type { LocalProjects } from '../useLocalProjects';
import type { OpenProjectInfo } from './openProject';
import { projectRows, rowsInSection, type ProjectRow } from './projectRows';
import type { ListSectionId } from './projectsSections';

/** Where a list's projects come from. */
export interface ProjectSources {
  connection: GitHubConnection;
  gitHubProjects: GitHubProjects;
  localProjects: LocalProjects;
}

export interface ProjectList {
  query: string;
  setQuery: (query: string) => void;
  sort: SortOrder;
  setSort: (sort: SortOrder) => void;
  /** The section's rows, before the search. */
  inSection: readonly ProjectRow[];
  /** The rows the search leaves, sorted. */
  shown: readonly ProjectRow[];
  /** Nothing is listed yet, and a place is still being read. */
  loading: boolean;
  /** A place is being read again. */
  refreshing: boolean;
  /** Signed in, but the list on GitHub could not be read: there may well be projects there. */
  gitHubUnread: boolean;
  /** Reads the section's places again. */
  refresh: () => void;
}

/** A list section's rows, searched and sorted, and how to read its places again. */
export function useProjectList(section: ListSectionId, sources: ProjectSources, openProject: OpenProjectInfo): ProjectList {
  const { connection, gitHubProjects, localProjects } = sources;
  const [query, setQuery] = useState('');
  const [sort, setSort] = usePersistedSort();
  const items = useListedItems(sources);
  const inSection = useMemo(() => rowsInSection(projectRows(items, openProject), section), [items, openProject, section]);
  const shown = useMemo(() => sortItems(filterItems(inSection, query), sort), [inSection, query, sort]);
  const readingGitHub = connection.session !== null && gitHubProjects.entries === null && gitHubProjects.busy !== null;
  const refresh = () => {
    if (section !== 'github') localProjects.rescan();
    if (section !== 'local') gitHubProjects.refresh();
  };
  return {
    query,
    setQuery,
    sort,
    setSort,
    inSection,
    shown,
    loading: items.length === 0 && (localProjects.scanning || readingGitHub),
    refreshing: localProjects.scanning || gitHubProjects.busy !== null,
    gitHubUnread: connection.session !== null && gitHubProjects.entries === null && gitHubProjects.busy === null,
    refresh,
  };
}

/** The projects folder's projects and, signed in, the user's projects on GitHub. */
function useListedItems({ connection, gitHubProjects, localProjects }: ProjectSources): ProjectListItem[] {
  const login = connection.session?.user.login ?? null;
  const entries = gitHubProjects.entries;
  const local = localProjects.items;
  return useMemo(() => {
    const github = login !== null && entries !== null ? entries.map((entry) => itemFromIndexEntry(entry, login)) : [];
    return [...(local ?? []), ...github];
  }, [login, entries, local]);
}

/** The sort, kept in this browser. */
function usePersistedSort(): [SortOrder, (sort: SortOrder) => void] {
  const [sort, setSortState] = useState(() => parseProjectsPagePrefs(readStored()).sort);
  const setSort = (next: SortOrder) => {
    setSortState(next);
    try {
      localStorage.setItem(PROJECTS_PAGE_PREFS_KEY, storedProjectsPagePrefs({ sort: next }));
    } catch {
      // Private window or blocked storage: the choice lasts for this visit.
    }
  };
  return [sort, setSort];
}

function readStored(): string | null {
  try {
    return localStorage.getItem(PROJECTS_PAGE_PREFS_KEY);
  } catch {
    return null;
  }
}
