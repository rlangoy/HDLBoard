// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import { PLACE } from './places';

/** The Projects page's sections (issue #44). */
export type ProjectsSectionId = 'all' | 'local' | 'github' | 'active';

/** A section that lists projects; `active` shows the open one instead. */
export type ListSectionId = Exclude<ProjectsSectionId, 'active'>;

export interface ProjectsSection<Id extends ProjectsSectionId = ProjectsSectionId> {
  readonly id: Id;
  readonly label: string;
  /** Under the section's title. */
  readonly intro: string;
}

/** The lists, in the sidebar's order: where the projects are stored is the only filter. */
export const LIST_SECTIONS: readonly ProjectsSection<ListSectionId>[] = [
  { id: 'all', label: 'All projects', intro: 'Your projects on this computer and on GitHub, in one list.' },
  { id: 'local', label: PLACE.local.on, intro: 'Projects in your projects folder on this computer.' },
  { id: 'github', label: PLACE.github.on, intro: 'Projects saved on your GitHub account, as secret gists.' },
];

/** Below the lists, ruled off: the open project's own settings, as cards (also its card's Project details). */
export const ACTIVE_SECTION: ProjectsSection<'active'> = {
  id: 'active',
  label: 'Active project',
  intro: 'The project open in the workspace: its details, where it is saved, and its files.',
};

export const FIRST_SECTION: ProjectsSectionId = 'all';

export function projectsSection(id: ProjectsSectionId): ProjectsSection {
  return id === ACTIVE_SECTION.id ? ACTIVE_SECTION : (LIST_SECTIONS.find((section) => section.id === id) ?? LIST_SECTIONS[0]);
}
