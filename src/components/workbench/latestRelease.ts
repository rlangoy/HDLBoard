// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import { REPO_PATH, REPO_URL } from './project';
import { versionNumber } from './releaseVersion';

/** GitHub's newest release of HDLBoard; drafts and pre-releases are never "latest". */
export const LATEST_RELEASE_URL = `https://api.github.com/repos/${REPO_PATH}/releases/latest`;

/** A check that hears nothing back in this time has failed. */
const TIMEOUT_MS = 15_000;

export interface Release {
  /** The number only, without the tag's `v`: `1.6.2`. */
  readonly version: string;
  /** The release's title on GitHub: `HDLBoard 1.6.2`. */
  readonly name: string;
  /** The release page on GitHub. */
  readonly url: string;
}

/** Asks GitHub for the latest release. Throws when it cannot be asked or the answer is not a release. */
export async function fetchLatestRelease(fetchFn: typeof fetch = fetch): Promise<Release> {
  const response = await fetchFn(LATEST_RELEASE_URL, {
    headers: { Accept: 'application/vnd.github+json' },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`GitHub answered ${response.status}`);
  return parseRelease(await response.json());
}

/**
 * The fields the app uses from GitHub's release JSON. The page link is opened
 * in the user's browser, so only a link into this project's repository is taken.
 */
export function parseRelease(json: unknown): Release {
  const raw = (json ?? {}) as { tag_name?: unknown; name?: unknown; html_url?: unknown };
  const version = typeof raw.tag_name === 'string' ? versionNumber(raw.tag_name) : null;
  if (!version) throw new Error('the release has no version number');
  if (typeof raw.html_url !== 'string' || !raw.html_url.startsWith(`${REPO_URL}/`)) {
    throw new Error('the release has no page in the HDLBoard repository');
  }
  const name = typeof raw.name === 'string' && raw.name.trim() !== '' ? raw.name.trim() : `HDLBoard ${version}`;
  return { version, name, url: raw.html_url };
}
