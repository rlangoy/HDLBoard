// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import { cx } from '../../board';
import { FileIcon, GitHubIcon, LaptopIcon, MoreIcon, OpenInIcon, ProjectIcon } from '../icons';
import { displayName, fileHit, relativeTime } from '../projectCatalog';
import type { ProjectPlace, ProjectRow } from './projectRows';
import { SavedChip } from './StateChip';

export interface ProjectTableProps {
  rows: readonly ProjectRow[];
  /** The search text: a file that matched it is shown under its project. */
  query: string;
  /** Every Open waits while a project is opening. */
  opening: boolean;
  onOpen: (row: ProjectRow) => void;
  /** Opens the row's ⋮ menu below `button`. */
  onMenu: (row: ProjectRow, button: HTMLElement) => void;
}

const PLACE_LABEL = { local: 'On this computer', github: 'On GitHub' } as const;

const rowName = (row: ProjectRow) => displayName(row.name) || 'Untitled project';

/** The projects, one row each: name and description together, where they are stored, when saved. */
export function ProjectTable({ rows, ...rowProps }: ProjectTableProps) {
  return (
    <div className="wb-projects-table">
      <table aria-label="Projects">
        <thead>
          <tr>
            <th scope="col">Project</th>
            <th scope="col" className="is-places">Location</th>
            <th scope="col" className="is-saved">Last saved</th>
            <th scope="col">
              <span className="wb-projects__sr">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <ProjectTableRow key={row.key} row={row} {...rowProps} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

type RowProps = Omit<ProjectTableProps, 'rows'> & { row: ProjectRow };

/** One project: Open stays on every row; what is done less often is in its ⋮ menu. */
function ProjectTableRow({ row, query, opening, onOpen, onMenu }: RowProps) {
  return (
    <tr className={cx(row.isOpen && 'is-open')}>
      <td>
        <NameAndDescription row={row} query={query} />
      </td>
      <td className="is-places">
        <Places places={row.places} />
      </td>
      <td className="is-saved">
        <SavedWhen iso={row.updatedAt} />
      </td>
      <td>
        <div className="wb-projects-table__actions">
          <button type="button" className="wb-projects__btn is-open" onClick={() => onOpen(row)} disabled={opening && !row.isOpen} aria-label={`Open ${rowName(row)}`}>
            <OpenInIcon aria-hidden="true" />
            Open
          </button>
          <button type="button" className="wb-projects__icon-btn" onClick={(event) => onMenu(row, event.currentTarget)} aria-haspopup="menu" aria-label={`More for ${rowName(row)}`}>
            <MoreIcon aria-hidden="true" />
          </button>
        </div>
      </td>
    </tr>
  );
}

/** The name with its description beneath, so a project is known without opening it; while searching, the file that matched. */
function NameAndDescription({ row, query }: { row: ProjectRow; query: string }) {
  const hit = fileHit(row, query);
  return (
    <div className="wb-projects-table__project">
      <span className="wb-projects-table__tile" aria-hidden="true">
        <ProjectIcon />
      </span>
      <span className="wb-projects-table__text">
        <span className="wb-projects-table__name">
          <strong title={row.name}>{rowName(row)}</strong>
          {row.isOpen && <span className="wb-projects-chip is-open">Open now</span>}
        </span>
        {row.description !== '' && <span className="wb-projects-table__description">{row.description}</span>}
        {hit && (
          <span className="wb-projects-table__hit">
            <FileIcon aria-hidden="true" />
            <strong>{hit.name}</strong>
            {hit.description !== '' && ` — ${hit.description}`}
          </span>
        )}
      </span>
    </div>
  );
}

/** Each place the project is stored; for the open project, whether that place holds it as it is now. */
function Places({ places }: { places: readonly ProjectPlace[] }) {
  return (
    <ul className="wb-projects-table__places">
      {places.map((place) => (
        <li key={place.source}>
          {place.source === 'github' ? <GitHubIcon aria-hidden="true" /> : <LaptopIcon aria-hidden="true" />}
          <span>{PLACE_LABEL[place.source]}</span>
          {place.state && <SavedChip state={place.state} />}
        </li>
      ))}
    </ul>
  );
}

function SavedWhen({ iso }: { iso: string }) {
  if (iso === '') return <span className="wb-projects__muted">—</span>;
  return <time dateTime={iso} title={new Date(iso).toLocaleString()}>{relativeTime(iso)}</time>;
}
