// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { desktopBridge } from './desktop';
import type { FolderFile, FolderHandle, ItemSource, SkippedFile } from './localProjectScan';
import type { ProjectListItem } from './projectCatalog';
import type { LocalSourceFile } from './projectFile';
import { storedLayout } from './projectLayout';
import { NO_FOLDER, readChosenFolderFiles, readDesktopFolder, readRememberedFolder, type FolderReading, type FolderState } from './projectsFolderReading';
import { loadProjectsFolder, saveProjectsFolder } from './projectsFolderStore';
import { pickProjectsFolder } from './fileSystemAccess';
import { canPickFolder, type PickedFolder } from './projectSave';

/** What opening a local project needs; the Workbench opens it the way its kind says (docs/project_browse_page.md § 8). */
export type LocalOpenRequest =
  | { kind: 'path'; path: string }
  | { kind: 'handle'; text: string; location: string; localFiles: LocalSourceFile[]; folder: PickedFolder }
  | { kind: 'files'; projectFile: File; others: File[] };

export type { FolderState } from './projectsFolderReading';

export interface LocalProjects {
  /** null until a folder has been read. */
  items: ProjectListItem[] | null;
  folderState: FolderState;
  /** The folder's full path (Windows app) or name (browser); '' when there is none. */
  folderLabel: string;
  scanning: boolean;
  error: string | null;
  skipped: SkippedFile[];
  truncated: boolean;
  /** The folder is kept for the next visit (the Windows app, Chrome and Edge) rather than for this one only. */
  remembered: boolean;
  rescan(): void;
  /** Must be called from a click: it opens a picker. */
  chooseFolder(): void;
  /** Must be called from a click: the browser asks for the folder permission again. */
  allowAccess(): void;
  readForOpen(item: ProjectListItem): Promise<LocalOpenRequest>;
  /**
   * A folder the user picked for a project (the project folder dialog) becomes the projects
   * folder when none is chosen yet, so the project's own folder is listed without asking again.
   */
  adoptFolder(folder: FolderHandle): void;
  /** The same for browsers without folder handles: the files a folder input chose. */
  adoptFolderFiles(files: readonly File[]): void;
}

type Backend = 'desktop' | 'handle' | 'files';

/** The Windows app's own folder reading, else a folder handle (Chrome, Edge), else a folder input. */
function backendOfThisBrowser(): Backend {
  const bridge = desktopBridge();
  if (bridge?.listLocalProjects && bridge.chooseProjectsFolder) return 'desktop';
  return canPickFolder() ? 'handle' : 'files';
}

/**
 * The projects in the local projects folder (docs/project_browse_page.md § 6). Reads when
 * `active` turns on — the Projects page opening — and on rescan.
 */
export function useLocalProjects(active: boolean): LocalProjects {
  const backend = useMemo(backendOfThisBrowser, []);
  const [reading, setReading] = useState<FolderReading>(NO_FOLDER);
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [remembered, setRemembered] = useState(backend !== 'files');
  const folderHandle = useRef<FolderHandle | null>(null);
  const chosenFiles = useRef<File[] | null>(null);
  const newestScan = useRef(0);

  const read = useCallback(async (): Promise<FolderReading> => {
    if (backend === 'desktop') return readDesktopFolder(desktopBridge()!.listLocalProjects!);
    if (backend === 'files') return readChosenFolderFiles(chosenFiles.current ?? []);
    const { folder, reading: next } = await readRememberedFolder(folderHandle.current, loadProjectsFolder);
    folderHandle.current = folder;
    return next;
  }, [backend]);

  const scan = useCallback(async () => {
    const thisScan = ++newestScan.current;
    setScanning(true);
    setError(null);
    try {
      const next = await read();
      if (thisScan === newestScan.current) setReading(next);
    } catch (failure) {
      if (thisScan === newestScan.current) setError(failure instanceof Error ? failure.message : String(failure));
    } finally {
      if (thisScan === newestScan.current) setScanning(false);
    }
  }, [read]);

  useEffect(() => {
    if (active) void scan();
  }, [active, scan]);

  const chooseFolder = () => {
    if (backend === 'files') chooseFolderWithInput((files) => void adoptChosenFiles(files));
    else void chooseFolderOfBackend();
  };

  const adoptChosenFiles = async (files: File[]) => {
    chosenFiles.current = files;
    setRemembered(false);
    await scan();
  };

  const chooseFolderOfBackend = async () => {
    try {
      if (backend === 'desktop') {
        if (!(await desktopBridge()?.chooseProjectsFolder?.())) return;
      } else {
        const picked = (await pickProjectsFolder()) as FolderHandle | undefined;
        if (!picked) return;
        folderHandle.current = picked;
        setRemembered(await saveProjectsFolder(picked));
      }
      await scan();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure));
    }
  };

  const allowAccess = () => {
    const handle = folderHandle.current;
    if (!handle?.requestPermission) return;
    handle
      .requestPermission({ mode: 'read' })
      .then(() => scan())
      .catch((failure) => setError(failure instanceof Error ? failure.message : String(failure)));
  };

  const readForOpen = async (item: ProjectListItem): Promise<LocalOpenRequest> => {
    if (backend === 'desktop') return { kind: 'path', path: item.location };
    const source = reading.outcome?.sources.get(item.key);
    if (!source) throw new Error(`${item.name} is no longer in the folder. Read the list again.`);
    return openRequestFor(item, source);
  };

  const adoptFolder = (folder: FolderHandle) => {
    if (backend !== 'handle') return;
    void (async () => {
      folderHandle.current ??= await loadProjectsFolder();
      if (folderHandle.current !== null) return;
      folderHandle.current = folder;
      setRemembered(await saveProjectsFolder(folder));
      if (active) await scan();
    })();
  };

  const adoptFolderFiles = (files: readonly File[]) => {
    if (backend !== 'files' || chosenFiles.current !== null) return;
    chosenFiles.current = [...files];
    if (active) void scan();
  };

  return {
    items: reading.outcome?.items ?? null,
    folderState: reading.folderState,
    folderLabel: reading.folderLabel,
    scanning,
    error,
    skipped: reading.outcome?.skipped ?? [],
    truncated: reading.outcome?.truncated ?? false,
    remembered,
    rescan: () => void scan(),
    chooseFolder,
    allowAccess,
    readForOpen,
    adoptFolder,
    adoptFolderFiles,
  };
}

/** Opens the browser's folder picker for browsers that cannot keep a folder handle. */
function chooseFolderWithInput(onChosen: (files: File[]) => void): void {
  const input = document.createElement('input');
  input.type = 'file';
  input.multiple = true;
  // `webkitdirectory` is not in the DOM typings; every current browser supports it.
  input.setAttribute('webkitdirectory', '');
  input.onchange = () => {
    if (input.files && input.files.length > 0) onChosen([...input.files]);
  };
  input.click();
}

/**
 * What opening a listed project needs. From a folder handle: the project file, and its
 * files next to it and in its own `<project>/<source folder>/`, each with its path
 * (docs/impl_project_structure.md § 6.8).
 */
async function openRequestFor(item: ProjectListItem, source: ItemSource): Promise<LocalOpenRequest> {
  if (source.kind === 'files') return { kind: 'files', projectFile: source.projectFile, others: source.others };
  const listed = new Set(item.files.map((file) => file.name.toLowerCase()));
  let text = '';
  const localFiles: LocalSourceFile[] = [];
  for await (const [, child] of source.folder.entries()) {
    if (child.kind !== 'file') continue;
    if (child.name === source.fileName) text = await (await child.getFile()).text();
    else if (listed.has(child.name.toLowerCase())) localFiles.push(await sourceFileOf(child, child.name));
  }
  if (text === '') throw new Error(`${source.fileName} could not be read.`);
  const { projectDirectory, sourceDirectory } = storedLayout(text, source.fileName);
  const inner = await subfolder(source.folder, [projectDirectory, sourceDirectory]);
  if (inner) {
    for await (const [, child] of inner.entries()) {
      if (child.kind === 'file' && listed.has(child.name.toLowerCase())) {
        localFiles.push(await sourceFileOf(child, `${projectDirectory}/${sourceDirectory}/${child.name}`));
      }
    }
  }
  return { kind: 'handle', text, location: item.location, localFiles, folder: source.folder };
}

/** The folder at `parts` inside `folder`, or null when it is not there. Names are matched ignoring case. */
async function subfolder(folder: FolderHandle, parts: readonly string[]): Promise<FolderHandle | null> {
  let current: FolderHandle = folder;
  for (const part of parts) {
    let next: FolderHandle | null = null;
    for await (const [, child] of current.entries()) {
      if (child.kind === 'directory' && child.name.toLowerCase() === part.toLowerCase()) next = child;
    }
    if (!next) return null;
    current = next;
  }
  return current;
}

async function sourceFileOf(child: FolderFile, path: string): Promise<LocalSourceFile> {
  return { name: child.name, content: await (await child.getFile()).text(), path };
}
