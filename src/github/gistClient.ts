// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import type { GitHubHttp } from './githubHttp';

/** The Gist endpoints HDLBoard uses. Gists are always created secret (`public: false`). */

const PAGE_SIZE = 100;
const MAX_PAGES = 10;

export interface TextFile {
  name: string;
  content: string;
}

interface GistFileJson {
  filename: string;
  content?: string;
  truncated?: boolean;
  raw_url: string;
}

interface GistJson {
  id: string;
  html_url: string;
  description: string | null;
  updated_at: string;
  owner?: { login: string } | null;
  files: Record<string, GistFileJson | null>;
}

export interface GistSummary {
  id: string;
  htmlUrl: string;
  description: string;
  /** ISO 8601; changes with every edit, here or on github.com. */
  updatedAt: string;
  ownerLogin: string;
  fileNames: string[];
}

export interface Gist extends GistSummary {
  files: TextFile[];
}

/** `null` deletes the file from the gist. */
export type GistFileChanges = Record<string, { content: string } | null>;

export class GistClient {
  constructor(private readonly http: GitHubHttp) {}

  async listOwnGists(): Promise<GistSummary[]> {
    const gists: GistSummary[] = [];
    for (let page = 1; page <= MAX_PAGES; page++) {
      const batch = await this.http.getJson<GistJson[]>(`/gists?per_page=${PAGE_SIZE}&page=${page}`);
      gists.push(...batch.map(toSummary));
      if (batch.length < PAGE_SIZE) break;
    }
    return gists;
  }

  async getGist(gistId: string): Promise<Gist> {
    return this.toGist(await this.http.getJson<GistJson>(gistPath(gistId)));
  }

  async createGist(description: string, files: TextFile[]): Promise<Gist> {
    const body = { description, public: false, files: toContentMap(files) };
    return this.toGist(await this.http.postJson<GistJson>('/gists', body));
  }

  async updateGist(gistId: string, changes: GistFileChanges, description?: string): Promise<Gist> {
    const body = description === undefined ? { files: changes } : { description, files: changes };
    return this.toGist(await this.http.patchJson<GistJson>(gistPath(gistId), body));
  }

  deleteGist(gistId: string): Promise<void> {
    return this.http.delete(gistPath(gistId));
  }

  private async toGist(json: GistJson): Promise<Gist> {
    const files = await Promise.all(presentFiles(json).map((file) => this.readFile(file)));
    return { ...toSummary(json), files };
  }

  /** The API leaves out the content of files over 1 MB; those are read from their raw URL. */
  private async readFile(file: GistFileJson): Promise<TextFile> {
    const isComplete = file.content !== undefined && file.truncated !== true;
    const content = isComplete ? (file.content as string) : await this.http.getRawText(file.raw_url);
    return { name: file.filename, content };
  }
}

function gistPath(gistId: string): string {
  return `/gists/${encodeURIComponent(gistId)}`;
}

function toSummary(json: GistJson): GistSummary {
  return {
    id: json.id,
    htmlUrl: json.html_url,
    description: json.description ?? '',
    updatedAt: json.updated_at,
    ownerLogin: json.owner?.login ?? '',
    fileNames: presentFiles(json).map((file) => file.filename),
  };
}

function presentFiles(json: GistJson): GistFileJson[] {
  return Object.values(json.files).filter((file): file is GistFileJson => file !== null);
}

function toContentMap(files: TextFile[]): Record<string, { content: string }> {
  return Object.fromEntries(files.map((file) => [file.name, { content: file.content }]));
}
