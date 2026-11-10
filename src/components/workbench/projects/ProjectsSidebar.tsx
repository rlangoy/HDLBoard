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

/** The lists, then, ruled off at the bottom, the active project. */
const NAV_GROUPS = [LIST_SECTIONS.map(navEntry), [navEntry(ACTIVE_SECTION)]];

export interface ProjectsSidebarProps {
  current: ProjectsSectionId;
  onSelect: (section: ProjectsSectionId) => void;
  onBack: () => void;
}

export function ProjectsSidebar({ current, onSelect, onBack }: ProjectsSidebarProps) {
  return <PageSidebar label="Project sections" groups={NAV_GROUPS} current={current} onSelect={onSelect} onBack={onBack} />;
}
