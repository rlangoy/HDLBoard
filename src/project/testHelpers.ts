// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import type { FetchFn } from './fetchText';
import type { ProjectFileEntry } from './types';

export function projectJson(files: unknown[], overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    version: 1,
    name: 'Test',
    board: 'DE1-SoC',
    description: 'A test project',
    files,
    ...overrides,
  });
}

export function entry(name: string, url = '', description = `about ${name}`): ProjectFileEntry {
  return { name, url, description };
}

export interface RecordedRequest {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: unknown;
}

type Route = (request: RecordedRequest) => Response | Promise<Response>;

/** A fake `fetch` that records requests and answers from a route table keyed by "METHOD url". */
export function fakeFetch(routes: Record<string, Route | Response | string>) {
  const requests: RecordedRequest[] = [];
  const fetchFn: FetchFn = async (input, init) => {
    const request: RecordedRequest = {
      url: String(input),
      method: init?.method ?? 'GET',
      headers: { ...(init?.headers as Record<string, string> | undefined) },
      body: typeof init?.body === 'string' ? parseBody(init.body) : undefined,
    };
    requests.push(request);
    const route = routes[`${request.method} ${request.url}`];
    if (route === undefined) throw new TypeError('Failed to fetch');
    if (typeof route === 'string') return new Response(route, { status: 200 });
    if (route instanceof Response) return route.clone();
    return route(request);
  };
  return { fetchFn, requests };
}

export function jsonResponse(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...headers } });
}

/** JSON bodies are parsed; form bodies are kept as text. */
function parseBody(body: string): unknown {
  try {
    return JSON.parse(body);
  } catch {
    return body;
  }
}
