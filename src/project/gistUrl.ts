// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import type { FetchFn } from './fetchText';
import { isProjectFileName } from './fileName';

/**
 * Reading public GitHub gists without signing in.
 *
 * A gist page (`https://gist.github.com/<owner>/<id>`) is an HTML page that does
 * not allow cross-origin requests. The same gist's raw address
 * (`https://gist.githubusercontent.com/<owner>/<id>/raw[/<file>]`) returns the
 * file content, allows cross-origin requests and has no rate limit, so every
 * download goes there. Only finding a file's *name* needs the GitHub API
 * (60 requests per hour without sign-in), and that is optional.
 */

const GIST_PAGE_URL = /^https:\/\/gist\.github\.com\/([^/?#]+)\/([0-9a-f]{20,40})\/?(?:[?#].*)?$/i;
const GIST_RAW_URL = /^https:\/\/gist\.githubusercontent\.com\/([^/?#]+)\/([0-9a-f]{20,40})\/raw(?:\/|$)/i;
const GIST_API = 'https://api.github.com/gists';

export interface GistRef {
  owner: string;
  gistId: string;
}

/** Parses `https://gist.github.com/<owner>/<id>`; null for any other URL. */
export function parseGistPageUrl(url: string): GistRef | null {
  const match = GIST_PAGE_URL.exec(url.trim());
  return match ? { owner: match[1], gistId: match[2] } : null;
}

/** Parses a gist page or raw address (`https://gist.githubusercontent.com/<owner>/<id>/raw/…`); null for any other URL. */
export function parseGistRef(url: string): GistRef | null {
  const match = GIST_RAW_URL.exec(url.trim());
  return match ? { owner: match[1], gistId: match[2] } : parseGistPageUrl(url);
}

export function isGistUrl(url: string): boolean {
  return parseGistPageUrl(url) !== null || GIST_RAW_URL.test(url.trim());
}

/** Raw address of a gist: its first file, or the named file when `fileName` is given. */
export function gistRawUrl({ owner, gistId }: GistRef, fileName?: string): string {
  const base = `https://gist.githubusercontent.com/${owner}/${gistId}/raw`;
  return fileName ? `${base}/${encodeURIComponent(fileName)}` : base;
}

/** The address that returns a gist page's content; other URLs are unchanged. */
export function gistDownloadUrl(url: string): string {
  const ref = parseGistPageUrl(url);
  return ref ? gistRawUrl(ref) : url;
}

/**
 * Where to read a project file from. For a gist page this is the raw URL of the
 * gist's `.hdlboard.json` file, so the project gets its real file name and files
 * without their own URL resolve next to it in the gist. When the GitHub API
 * cannot be reached (offline, rate limit), the gist's raw URL is used without a
 * file name. Other URLs are returned unchanged.
 */
export async function resolveProjectUrl(url: string, fetchFn: FetchFn = fetch): Promise<string> {
  const ref = parseGistPageUrl(url);
  if (!ref) return url;
  const projectFileName = await findGistProjectFileName(ref.gistId, fetchFn);
  return gistRawUrl(ref, projectFileName ?? undefined);
}

/** Name of the gist's only `.hdlboard.json` file, or null when unknown or ambiguous. */
async function findGistProjectFileName(gistId: string, fetchFn: FetchFn): Promise<string | null> {
  try {
    const response = await fetchFn(`${GIST_API}/${gistId}`, { headers: { Accept: 'application/vnd.github+json' } });
    if (!response.ok) return null;
    const gist = (await response.json()) as { files?: Record<string, unknown> };
    const candidates = Object.keys(gist.files ?? {}).filter(isProjectFileName);
    return candidates.length === 1 ? candidates[0] : null;
  } catch {
    return null;
  }
}
