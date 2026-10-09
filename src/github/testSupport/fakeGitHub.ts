// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import type { FetchFn } from '../githubHttp';

/** Test support only: the gist endpoints of api.github.com, in memory. */

interface StoredGist {
  id: string;
  description: string;
  ownerLogin: string;
  updatedAt: string;
  files: Map<string, string>;
}

interface GistBody {
  description?: string;
  files: Record<string, { content: string } | null>;
}

const API = 'https://api.github.com';
export const FAKE_LOGIN = 'student';

/**
 * Enough of api.github.com for the use cases: GET /user, GET /gists, POST /gists,
 * and GET / PATCH / DELETE /gists/:id. Every write moves the gist's `updated_at`.
 */
export class FakeGitHub {
  readonly gists = new Map<string, StoredGist>();
  readonly requests: string[] = [];
  /** What GET /user answers in X-OAuth-Scopes; null leaves the header out (fine-grained tokens). */
  grantedScopes: string | null = 'gist';
  private nextId = 1;
  private clock = 0;

  readonly fetch: FetchFn = async (url, init = {}) => {
    const method = init.method ?? 'GET';
    this.requests.push(`${method} ${url.replace(API, '')}`);
    const body = typeof init.body === 'string' ? (JSON.parse(init.body) as GistBody) : undefined;
    return this.handle(method, new URL(url), body);
  };

  addGist(description: string, files: Record<string, string>, ownerLogin = FAKE_LOGIN): string {
    const id = `${String(this.nextId++).padStart(20, 'a')}`;
    this.gists.set(id, { id, description, ownerLogin, updatedAt: this.tick(), files: new Map(Object.entries(files)) });
    return id;
  }

  /** A change made somewhere else, e.g. on github.com. */
  editElsewhere(gistId: string, fileName: string, content: string): void {
    const gist = this.gists.get(gistId)!;
    gist.files.set(fileName, content);
    gist.updatedAt = this.tick();
  }

  fileNames(gistId: string): string[] {
    return [...(this.gists.get(gistId)?.files.keys() ?? [])];
  }

  fileContent(gistId: string, fileName: string): string | undefined {
    return this.gists.get(gistId)?.files.get(fileName);
  }

  writes(): string[] {
    return this.requests.filter((request) => !request.startsWith('GET'));
  }

  private handle(method: string, url: URL, body: GistBody | undefined): Response {
    const gistId = url.pathname.match(/^\/gists\/(\w+)$/)?.[1];
    if (method === 'GET' && url.pathname === '/user') return this.user();
    if (method === 'GET' && url.pathname === '/gists') return this.list(url);
    if (method === 'POST' && url.pathname === '/gists') return this.create(body!);
    if (gistId === undefined || !this.gists.has(gistId)) return json(404, { message: 'Not Found' });
    if (method === 'GET') return json(200, toJson(this.gists.get(gistId)!));
    if (method === 'PATCH') return this.update(gistId, body!);
    if (method === 'DELETE') return this.remove(gistId);
    return json(404, { message: 'Not Found' });
  }

  private user(): Response {
    const headers: Record<string, string> = this.grantedScopes === null ? {} : { 'X-OAuth-Scopes': this.grantedScopes };
    return json(200, { login: FAKE_LOGIN, avatar_url: '' }, headers);
  }

  private list(url: URL): Response {
    const page = Number(url.searchParams.get('page') ?? 1);
    const own = [...this.gists.values()].filter((gist) => gist.ownerLogin === FAKE_LOGIN).map(toJson);
    return json(200, page === 1 ? own : []);
  }

  private create(body: GistBody): Response {
    const files = Object.fromEntries(Object.entries(body.files).map(([name, file]) => [name, file?.content ?? '']));
    const id = this.addGist(body.description ?? '', files);
    return json(201, toJson(this.gists.get(id)!));
  }

  private update(gistId: string, body: GistBody): Response {
    const gist = this.gists.get(gistId)!;
    if (gist.ownerLogin !== FAKE_LOGIN) return json(404, { message: 'Not Found' });
    for (const [name, change] of Object.entries(body.files)) {
      if (change === null) gist.files.delete(name);
      else gist.files.set(name, change.content);
    }
    if (body.description !== undefined) gist.description = body.description;
    gist.updatedAt = this.tick();
    return json(200, toJson(gist));
  }

  private remove(gistId: string): Response {
    this.gists.delete(gistId);
    return new Response(null, { status: 204 });
  }

  private tick(): string {
    return new Date(Date.UTC(2026, 9, 9, 8, 0, this.clock++)).toISOString();
  }
}

function toJson(gist: StoredGist) {
  return {
    id: gist.id,
    html_url: `https://gist.github.com/${gist.ownerLogin}/${gist.id}`,
    description: gist.description,
    updated_at: gist.updatedAt,
    owner: { login: gist.ownerLogin },
    files: Object.fromEntries(
      [...gist.files].map(([name, content]) => [
        name,
        { filename: name, content, truncated: false, raw_url: `https://gist.githubusercontent.com/${gist.ownerLogin}/${gist.id}/raw/${name}` },
      ]),
    ),
  };
}

function json(status: number, body: unknown, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...headers } });
}
