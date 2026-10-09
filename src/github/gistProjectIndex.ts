// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import type { GistClient } from './gistClient';
import {
  emptyIndex,
  INDEX_FILE_NAME,
  INDEX_GIST_DESCRIPTION,
  parseIndex,
  serializeIndex,
  withEntry,
  withoutEntry,
  type IndexEntry,
  type ProjectIndex,
} from './projectIndex';

interface LoadedIndex {
  gistId: string;
  index: ProjectIndex;
}

/**
 * The user's project list, kept in `Repo.HDLBoard.json` in its own gist.
 * The index gist is created when the first project is registered. Every change
 * reads the index again right before writing it, so a stale copy never
 * overwrites entries saved from another computer.
 */
export class GistProjectIndex {
  private indexGistId: string | null = null;

  constructor(private readonly gists: GistClient) {}

  async listEntries(): Promise<IndexEntry[]> {
    const loaded = await this.load();
    return loaded?.index.projects ?? [];
  }

  async register(entry: IndexEntry): Promise<void> {
    const loaded = await this.load();
    const updated = withEntry(loaded?.index ?? emptyIndex(), entry);
    if (loaded === null) await this.createIndexGist(updated);
    else await this.write(loaded.gistId, updated);
  }

  async unregister(gistId: string): Promise<void> {
    const loaded = await this.load();
    if (loaded !== null) await this.write(loaded.gistId, withoutEntry(loaded.index, gistId));
  }

  private async load(): Promise<LoadedIndex | null> {
    const gistId = await this.findIndexGistId();
    if (gistId === null) return null;
    const gist = await this.gists.getGist(gistId);
    const indexFile = gist.files.find((file) => file.name === INDEX_FILE_NAME);
    return indexFile === undefined ? null : { gistId, index: parseIndex(indexFile.content) };
  }

  private async write(gistId: string, index: ProjectIndex): Promise<void> {
    await this.gists.updateGist(gistId, { [INDEX_FILE_NAME]: { content: serializeIndex(index) } });
  }

  private async findIndexGistId(): Promise<string | null> {
    this.indexGistId ??= await this.searchIndexGistId();
    return this.indexGistId;
  }

  private async searchIndexGistId(): Promise<string | null> {
    const gists = await this.gists.listOwnGists();
    return gists.find((gist) => gist.fileNames.includes(INDEX_FILE_NAME))?.id ?? null;
  }

  private async createIndexGist(index: ProjectIndex): Promise<void> {
    const created = await this.gists.createGist(INDEX_GIST_DESCRIPTION, [
      { name: INDEX_FILE_NAME, content: serializeIndex(index) },
    ]);
    this.indexGistId = created.id;
  }
}
