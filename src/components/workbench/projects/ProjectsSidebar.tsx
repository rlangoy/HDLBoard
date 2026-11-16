// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import type { ReactNode } from 'react';
import { FileIcon, GitHubIcon, LaptopIcon, PlusIcon, ProjectIcon, StackIcon } from '../icons';
import { PageSidebar, type PageNavEntry } from '../page/PageSidebar';
import { ACTIVE_SECTION, LIST_SECTIONS, NEW_SECTION, type ProjectsSection, type ProjectsSectionId } from './projectsSections';
import { ActiveProjectNav } from './ActiveProjectNav';

export const SECTION_ICONS: Readonly<Record<ProjectsSectionId, ReactNode>> = {
  all: <StackIcon />,
  local: <LaptopIcon />,
  github: <GitHubIcon />,
  active: <ProjectIcon />,
  'active-files': <FileIcon />,
  new: <PlusIcon />,
};

const navEntry = (section: ProjectsSection): PageNavEntry<ProjectsSectionId> => ({ id: section.id, label: section.label, icon: SECTION_ICONS[section.id] });

const LIST_ENTRIES = LIST_SECTIONS.map(navEntry);

/** New project follows the lists; the active project and its children are ruled off below. */
function navGroups(unsaved: boolean, children: ReactNode) {
  const active = { ...navEntry(ACTIVE_SECTION), marker: unsaved ? 'Unsaved changes' : undefined, children };
  return [[...LIST_ENTRIES, navEntry(NEW_SECTION)], [active]];
}

export interface ProjectsSidebarProps {
  current: ProjectsSectionId;
  /** The open project has changes where it saves to. */
  unsaved: boolean;
  onSelect: (section: ProjectsSectionId) => void;
  onBack: () => void;
  /** Add file, under Active project: scrolls to Add existing files. Absent: the parent navigation only. */
  onAddFiles?: () => void;
}

export function ProjectsSidebar({ current, unsaved, onSelect, onBack, onAddFiles }: ProjectsSidebarProps) {
  const children = onAddFiles && <ActiveProjectNav current={current} onSelect={onSelect} onAddFiles={onAddFiles} />;
  return <PageSidebar label="Project sections" groups={navGroups(unsaved, children)} current={current} onSelect={onSelect} onBack={onBack} />;
}
