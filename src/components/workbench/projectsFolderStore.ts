// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * Remembers the projects folder a browser (Chrome, Edge) was given access to, as the folder
 * handle itself in IndexedDB (docs/project_browse_page.md § 6.3). Every failure — no
 * IndexedDB, a private window, a handle that cannot be stored — reads as "no folder".
 */

import type { FolderHandle } from './localProjectScan';

const DATABASE = 'hdlboard';
const STORE = 'handles';
const KEY = 'projectsFolder';

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function settle<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function loadProjectsFolder(): Promise<FolderHandle | null> {
  try {
    const database = await openDatabase();
    const handle = await settle(database.transaction(STORE).objectStore(STORE).get(KEY));
    database.close();
    return (handle as FolderHandle | undefined) ?? null;
  } catch {
    return null;
  }
}

/** True when the folder is remembered. */
export async function saveProjectsFolder(handle: FolderHandle): Promise<boolean> {
  try {
    const database = await openDatabase();
    await settle(database.transaction(STORE, 'readwrite').objectStore(STORE).put(handle, KEY));
    database.close();
    return true;
  } catch {
    return false;
  }
}
