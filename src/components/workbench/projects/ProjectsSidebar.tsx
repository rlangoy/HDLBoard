// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import type { ReactNode } from 'react';
import { GitHubIcon, LaptopIcon, ProjectIcon, StackIcon } from '../icons';
import { PageSidebar, type PageNavEntry } from '../page/PageSidebar';
import { ACTIVE_SECTION, LIST_SECTIONS, type ProjectsSection, type ProjectsSectionId } from './projectsSections';

export const SECTION_ICONS: Readonly<Record<ProjectsSectionId, ReactNode>> = {
  all: <StackIcon />,
  local: <LaptopIcon />,
  github: <GitHubIcon />,
  active: <ProjectIcon />,
};

const navEntry = (section: ProjectsSection): PageNavEntry<ProjectsSectionId> => ({ id: section.id, label: section.label, icon: SECTION_ICONS[section.id] });

const LIST_ENTRIES = LIST_SECTIONS.map(navEntry);

/** The lists, then, ruled off below them, the active project: a dot while it has unsaved changes. */
function navGroups(unsaved: boolean) {
  const active = { ...navEntry(ACTIVE_SECTION), marker: unsaved ? 'Unsaved changes' : undefined };
  return [LIST_ENTRIES, [active]];
}

export interface ProjectsSidebarProps {
  current: ProjectsSectionId;
  /** The open project has changes where it saves to. */
  unsaved: boolean;
  onSelect: (section: ProjectsSectionId) => void;
  onBack: () => void;
}

export function ProjectsSidebar({ current, unsaved, onSelect, onBack }: ProjectsSidebarProps) {
  return <PageSidebar label="Project sections" groups={navGroups(unsaved)} current={current} onSelect={onSelect} onBack={onBack} />;
}
