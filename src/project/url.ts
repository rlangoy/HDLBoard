// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import { gistDownloadUrl } from './gistUrl';

/** URL rules shared by project loading and validation (§ 6.3). */

export function isHttpUrl(text: string): boolean {
  return /^https?:\/\//i.test(text);
}

export function isPlainHttpUrl(text: string): boolean {
  return /^http:\/\//i.test(text);
}

/** Returns why `url` cannot be fetched, or null when it is an acceptable http(s) URL. */
export function urlProblem(url: string): string | null {
  if (!isHttpUrl(url)) return `only http:// and https:// URLs are accepted, got "${url}"`;
  try {
    new URL(url);
    return null;
  } catch {
    return `"${url}" is not a valid URL`;
  }
}

/** The "directory" of a URL: everything up to and including the last `/`. */
export function parentUrl(url: string): string {
  return new URL('./', url).toString();
}

/**
 * The address that returns a file's content. A GitHub gist page shows a web page
 * and does not allow cross-origin requests; its raw address returns the file and
 * does (see gistUrl.ts). Other URLs are unchanged.
 */
export function directDownloadUrl(url: string): string {
  return gistDownloadUrl(url);
}
