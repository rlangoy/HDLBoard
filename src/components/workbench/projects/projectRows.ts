// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * The rows of the Projects page's lists (issue #44): one per project, with every place it is
 * stored. The open project's copy on this computer and its copy on GitHub are one row, each
 * place with whether it holds the project as it is now. Pure — no React, no I/O.
 */

import { isSameProject, type CatalogFile, type ProjectListItem, type ProjectSource, type Searchable, type Sortable } from '../projectCatalog';
import type { OpenProjectInfo } from './openProject';
import type { ListSectionId } from './projectsSections';

/** Whether a place holds the open project as it is now. Known for the open project only. */
export type PlaceState = 'saved' | 'changed';

/** One place a project is stored. */
export interface ProjectPlace {
  readonly source: ProjectSource;
  /** What Open and the ⋮ menu act on; absent for a place of the open project not listed (yet). */
  readonly item: ProjectListItem | undefined;
  /** ISO 8601, or '' when unknown. */
  readonly updatedAt: string;
  readonly state: PlaceState | undefined;
}

export interface ProjectRow extends Searchable, Sortable {
  readonly files: readonly CatalogFile[];
  /** On this computer before on GitHub. */
  readonly places: readonly ProjectPlace[];
  /** The project open in the workspace. */
  readonly isOpen: boolean;
}

/** One place of the open project: its listed copy there, if read yet, and whether it holds the project as it is now. */
function openPlace(source: ProjectSource, listed: readonly ProjectListItem[], state: PlaceState): ProjectPlace {
  const item = listed.find((candidate) => candidate.source === source);
  return { source, item, updatedAt: item?.updatedAt ?? '', state };
}

function openPlaces(open: OpenProjectInfo, listed: readonly ProjectListItem[]): ProjectPlace[] {
  const places: ProjectPlace[] = [];
  if (open.onComputer) places.push(openPlace('local', listed, open.changedSinceLocalSave ? 'changed' : 'saved'));
  if (open.gistId !== undefined) places.push(openPlace('github', listed, open.syncState === 'saved' ? 'saved' : 'changed'));
  return places;
}

/** The open project's row, as it is now (its name and description as edited); none while it is stored nowhere. */
function openRow(open: OpenProjectInfo, listed: readonly ProjectListItem[]): ProjectRow | undefined {
  const places = openPlaces(open, listed);
  if (places.length === 0) return undefined;
  return {
    key: `open:${open.location}:${open.gistId ?? ''}`,
    name: open.name,
    description: open.description,
    owner: listed.find((item) => item.source === 'github')?.owner ?? '',
    files: open.files,
    updatedAt: latest(places.map((place) => place.updatedAt)),
    places,
    isOpen: true,
  };
}

function itemRow(item: ProjectListItem): ProjectRow {
  return {
    key: item.key,
    name: item.name,
    description: item.description,
    owner: item.owner,
    files: item.files,
    updatedAt: item.updatedAt,
    places: [{ source: item.source, item, updatedAt: item.updatedAt, state: undefined }],
    isOpen: false,
  };
}

/** The latest of some ISO 8601 times; '' when none is known. */
function latest(times: readonly string[]): string {
  return times.filter((time) => time !== '').sort().at(-1) ?? '';
}

/** A listed project file or gist that is the open project. */
function isOpenItem(item: ProjectListItem, open: OpenProjectInfo): boolean {
  if (item.source === 'github') return open.gistId !== undefined && item.gistId === open.gistId;
  return open.onComputer && isSameProject(item, { name: open.name, gistId: undefined, location: open.location });
}

/** Every listed project as a row; the open project's places as one row, listed or not. */
export function projectRows(items: readonly ProjectListItem[], open: OpenProjectInfo | null): ProjectRow[] {
  if (open === null) return items.map(itemRow);
  const opened = items.filter((item) => isOpenItem(item, open));
  const others = items.filter((item) => !opened.includes(item));
  const row = openRow(open, opened);
  return [...(row ? [row] : []), ...others.map(itemRow)];
}

/** The one place each list keeps to; All projects keeps to none. */
const SECTION_PLACE: Readonly<Record<ListSectionId, ProjectSource | null>> = { all: null, local: 'local', github: 'github' };

/** The rows a section lists: all of them, or those stored in its one place. */
export function rowsInSection(rows: readonly ProjectRow[], section: ListSectionId): ProjectRow[] {
  const only = SECTION_PLACE[section];
  if (only === null) return [...rows];
  return rows.filter((row) => row.places.some((place) => place.source === only));
}

/** The open project's row first, wherever the sort put it; the others keep their order. */
export function openRowFirst(rows: readonly ProjectRow[]): ProjectRow[] {
  return [...rows.filter((row) => row.isOpen), ...rows.filter((row) => !row.isOpen)];
}
