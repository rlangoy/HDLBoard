// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import { FileIcon, GridIcon, PlusIcon } from '../icons';
import type { ProjectsSectionId } from './projectsSections';

interface ActiveProjectNavProps {
  current: ProjectsSectionId;
  onSelect: (section: ProjectsSectionId) => void;
  /** Add file: scrolls to Project files' Add existing files. */
  onAddFiles: () => void;
}

const VIEWS = [
  { id: 'active', label: 'Overview', icon: <GridIcon /> },
  { id: 'active-files', label: 'Files', icon: <FileIcon /> },
] as const;

/** Inline navigation, in the parent's row styles: each entry is a position in the active project's page. */
export function ActiveProjectNav({ current, onSelect, onAddFiles }: ActiveProjectNavProps) {
  return (
    <ul className="wb-projects-subnav" aria-label="Active project views">
      {VIEWS.map((view) => (
        <li key={view.id}>
          <button type="button" className="wb-page-nav__item" aria-current={current === view.id ? 'page' : undefined} onClick={() => onSelect(view.id)}>
            <span className="wb-page-nav__icon" aria-hidden="true">{view.icon}</span>
            {view.label}
          </button>
        </li>
      ))}
      <li>
        <button type="button" className="wb-page-nav__item" onClick={onAddFiles}>
          <span className="wb-page-nav__icon" aria-hidden="true"><PlusIcon /></span>
          Add file
        </button>
      </li>
    </ul>
  );
}
