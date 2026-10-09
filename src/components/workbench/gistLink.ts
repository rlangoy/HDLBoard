// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import type { GistLink } from '../../github/projectGists';

/** The gist an open project is stored in (docs/GITHUB.md), and what it held when last opened or saved. */
export interface ProjectGistLink extends GistLink {
  /** fingerprintOf the project as last opened from or saved to the gist (projectGitHub.ts). */
  fingerprint: string;
}

const LINK_FIELDS = ['gistId', 'htmlUrl', 'ownerLogin', 'projectFileName', 'updatedAt', 'fingerprint'] as const;

/** A link as the desktop app stored it with the workspace (desktop.ts), or undefined when it does not look like one. */
export function parseStoredGistLink(raw: unknown): ProjectGistLink | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const record = raw as Record<string, unknown>;
  if (LINK_FIELDS.some((field) => typeof record[field] !== 'string')) return undefined;
  const [gistId, htmlUrl, ownerLogin, projectFileName, updatedAt, fingerprint] = LINK_FIELDS.map((field) => record[field] as string);
  return { gistId, htmlUrl, ownerLogin, projectFileName, updatedAt, fingerprint };
}
