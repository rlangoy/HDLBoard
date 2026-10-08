// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import { directDownloadUrl, urlProblem } from './url';

export type FetchFn = typeof fetch;

/** Thrown when an http(s) resource cannot be fetched; the message is meant for the user. */
export class FetchError extends Error {
  constructor(
    readonly url: string,
    message: string,
  ) {
    super(message);
    this.name = 'FetchError';
  }
}

/**
 * Fetches a text resource over http(s) (§ 6.3). Rejects other schemes, and turns
 * the browser's opaque network failure into a message that names CORS, which is
 * by far the most common cause when HDLBoard runs in a browser. Gist pages are
 * fetched from their raw address.
 */
export async function fetchText(url: string, fetchFn: FetchFn = fetch): Promise<string> {
  const problem = urlProblem(url);
  if (problem) throw new FetchError(url, problem);

  let response: Response;
  try {
    response = await fetchFn(directDownloadUrl(url), { cache: 'no-store' });
  } catch {
    throw new FetchError(
      url,
      `Could not fetch ${url}: network error, or the server does not allow cross-origin requests (CORS)`,
    );
  }
  if (!response.ok) {
    throw new FetchError(url, `Could not fetch ${url}: HTTP ${response.status} ${response.statusText}`.trim());
  }
  return response.text();
}
