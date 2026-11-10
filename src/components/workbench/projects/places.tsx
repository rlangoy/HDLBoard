// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import { GitHubIcon, LaptopIcon } from '../icons';
import type { ProjectSource } from '../projectCatalog';

/** How the page names a place a project is stored: one wording everywhere (issue #44). */
export interface PlaceNames {
  /** Inside a sentence: "Save to this computer", "not saved on GitHub". */
  readonly name: string;
  /** As a heading: "This computer". */
  readonly title: string;
  /** As a location: "On this computer". */
  readonly on: string;
}

export const PLACE: Readonly<Record<ProjectSource, PlaceNames>> = {
  local: { name: 'this computer', title: 'This computer', on: 'On this computer' },
  github: { name: 'GitHub', title: 'GitHub', on: 'On GitHub' },
};

/** The place's icon: a laptop, or GitHub's mark. */
export function PlaceIcon({ place }: { place: ProjectSource }) {
  return place === 'github' ? <GitHubIcon aria-hidden="true" /> : <LaptopIcon aria-hidden="true" />;
}
