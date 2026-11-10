// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import type { IndexEntry } from '../../../github/projectIndex';
import { copyText } from '../clipboard';
import { CopyIcon, DeleteIcon, EditIcon, InfoIcon, OpenInIcon } from '../icons';
import type { ProjectListItem } from '../projectCatalog';
import type { MenuAction } from '../ProjectMenu';
import type { ProjectRow } from './projectRows';

export interface RowMenuHandlers {
  onOpen: (row: ProjectRow) => void;
  /** The open project's details, in the Active project section. */
  onShowDetails: () => void;
  /** The open project's name field, in the Active project section. */
  onRename: () => void;
  onDeleteFromGitHub: (entry: IndexEntry) => void;
  /** Present only where a local project can be shown in Explorer (the Windows app). */
  onShowInFolder?: (path: string) => void;
}

/**
 * A row's ⋮ menu: what is done less often than Open (issue #44). The open project is
 * renamed in its details; another project opens first. Deleting is from GitHub only:
 * a project file on this computer is never deleted from here.
 */
export function rowMenuActions(row: ProjectRow, handlers: RowMenuHandlers): MenuAction[] {
  const placeActions = row.places.flatMap((place) => (place.item ? itemActions(place.item, handlers) : []));
  if (!row.isOpen) return [{ label: 'Open', icon: <OpenInIcon aria-hidden="true" />, onSelect: () => handlers.onOpen(row) }, ...placeActions];
  return [
    { label: 'Project details', icon: <InfoIcon aria-hidden="true" />, onSelect: handlers.onShowDetails },
    { label: 'Rename…', icon: <EditIcon aria-hidden="true" />, onSelect: handlers.onRename },
    ...placeActions,
  ];
}

/** What can be done with one stored copy. */
function itemActions(item: ProjectListItem, { onDeleteFromGitHub, onShowInFolder }: RowMenuHandlers): MenuAction[] {
  if (item.source === 'github') {
    const entry = item.entry;
    return [
      { label: 'Copy share link', icon: <CopyIcon aria-hidden="true" />, onSelect: () => void copyText(item.location) },
      { label: 'Show on github.com', icon: <OpenInIcon aria-hidden="true" />, onSelect: () => window.open(item.location, '_blank', 'noopener,noreferrer') },
      ...(entry ? [{ label: 'Delete from GitHub…', icon: <DeleteIcon aria-hidden="true" />, danger: true, onSelect: () => onDeleteFromGitHub(entry) }] : []),
    ];
  }
  if (!onShowInFolder) return [];
  return [
    { label: 'Copy path', icon: <CopyIcon aria-hidden="true" />, onSelect: () => void copyText(item.location) },
    { label: 'Show in Explorer', icon: <OpenInIcon aria-hidden="true" />, onSelect: () => onShowInFolder(item.location) },
  ];
}
