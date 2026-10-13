// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import { useEffect, useRef, useState, type DragEvent, type KeyboardEvent } from 'react';
import { cx } from '../board';
import { ACCEPTED_FILES_TEXT, hasTopDot } from './fileKinds';
import { rowsByFolder, type FileRow } from './fileRows';
import { FileRowLabel } from './FileRowLabel';
import { BookIcon, DeleteIcon, DownloadIcon, EditIcon, FileIcon, FilesIcon, FolderZipIcon, LinkIcon, ProjectIcon, UploadIcon } from './icons';
import { ScrollArea } from './ScrollArea';
import { droppedFileHandles, type FileHandles } from './fileSystemAccess';
import './FileExplorer.css';

export interface FileExplorerProps {
  /** Every file, in Files order, with what its row shows (fileRows.ts). */
  rows: readonly FileRow[];
  onSelect: (id: string) => void;
  onUpload: () => void;
  onNewFile: () => void;
  /** Open a project file by its URL or, in the Windows app, its path. */
  onOpenProject: () => void;
  onRename: (id: string, name: string) => void;
  onDelete: (id: string) => void;
  /** Save one file to the user's disk, as it currently reads in the editor. */
  onDownload: (id: string) => void;
  /** Save the whole project (every folder) as one .zip. */
  onDownloadAll: () => void;
  /** Show the Examples pane over the editor, or hide it again. */
  onToggleExamples: () => void;
  /** The Examples pane is showing: its button looks pressed. */
  examplesOpen?: boolean;
  /** Files dropped anywhere on this panel — Workbench does the reading/filtering. */
  onFilesDropped: (files: FileList, handles: Promise<FileHandles>) => void;
  onSetTopFile: (id: string) => void;
  /** A simulation is compiling or running: the top file can't change until it stops. */
  topLocked?: boolean;
  /** The open project, if any: drawn above the folders, and opens the project page. */
  project?: { name: string; fileName: string; description: string; unsaved: boolean };
  /** The project page is showing: the project row looks pressed. */
  projectOpen?: boolean;
  onToggleProject?: () => void;
  /** No project is open: Create Project starts one on the project page. */
  onCreateProject?: () => void;
}

interface TopDotButtonProps {
  file: FileRow;
  /** A simulation is running: no other file can become top until it stops. */
  locked: boolean;
  onSetTop: (id: string) => void;
}

function topDotTitle(isTop: boolean, locked: boolean): string {
  if (isTop) return 'Top-File';
  return locked ? 'Stop the simulation to change the Top-File' : 'Set Top-File';
}

/**
 * The dot ahead of a design file: blue on the top file, grey on the others —
 * click a grey one to make that file top. Disabled on the top file (a second
 * click there would do nothing) and, while `locked`, on every other one too.
 */
function TopDotButton({ file, locked, onSetTop }: TopDotButtonProps) {
  const { isTop } = file;
  return (
    <button
      type="button"
      className={cx('wb-files__top-dot', isTop && 'is-top', locked && !isTop && 'is-locked')}
      aria-pressed={isTop}
      aria-label={isTop ? `${file.name} is the top-level file` : `Set ${file.name} as the top-level file`}
      title={topDotTitle(isTop, locked)}
      disabled={isTop || locked}
      onClick={() => onSetTop(file.id)}
    >
      <span className="wb-files__top-dot-glyph" aria-hidden="true" />
    </button>
  );
}

/**
 * The "Files" panel, the project's one file list (docs/cleanup_file_tabs.md F1):
 * Examples beside the title, upload / new-file / download-all
 * on one row below, then the folder tree —
 * `vhdl/` and `verilog/` for designs and `work/` for an uploaded VHDL `tb_*`
 * testbench. A folder with no files is not drawn, so the starter project
 * shows only `vhdl/`.
 */
export function FileExplorer({
  rows,
  onSelect,
  onUpload,
  onNewFile,
  onOpenProject,
  onRename,
  onDelete,
  onDownload,
  onDownloadAll,
  onToggleExamples,
  examplesOpen = false,
  onFilesDropped,
  onSetTopFile,
  topLocked = false,
  project,
  projectOpen = false,
  onToggleProject,
  onCreateProject,
}: FileExplorerProps) {
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [draftName, setDraftName] = useState('');
  // A ref-counted depth rather than a plain boolean: dragging over a child
  // element fires dragleave on the parent before dragenter on the child,
  // so a naive "set false on dragleave" flickers the highlight off and on
  // as the pointer crosses every row underneath it.
  const [dragDepth, setDragDepth] = useState(0);
  const treeRef = useScrollShownIntoView(rows);

  const handleDragEnter = (e: DragEvent<HTMLElement>) => {
    if (!e.dataTransfer.types.includes('Files')) return;
    e.preventDefault();
    setDragDepth((d) => d + 1);
  };

  const handleDragOver = (e: DragEvent<HTMLElement>) => {
    if (!e.dataTransfer.types.includes('Files')) return;
    e.preventDefault(); // required for onDrop to fire at all
    e.dataTransfer.dropEffect = 'copy';
  };

  const handleDragLeave = (e: DragEvent<HTMLElement>) => {
    if (!e.dataTransfer.types.includes('Files')) return;
    e.preventDefault();
    setDragDepth((d) => Math.max(0, d - 1));
  };

  const handleDrop = (e: DragEvent<HTMLElement>) => {
    e.preventDefault();
    setDragDepth(0);
    if (e.dataTransfer.files.length > 0) onFilesDropped(e.dataTransfer.files, droppedFileHandles(e.dataTransfer));
  };

  const toggleFolder = (folder: string) => {
    setCollapsed((prev) => ({ ...prev, [folder]: !prev[folder] }));
  };

  const startRename = (f: FileRow) => {
    setRenamingId(f.id);
    setDraftName(f.name);
  };

  const commitRename = (id: string) => {
    const name = draftName.trim();
    setRenamingId(null);
    if (name) onRename(id, name);
  };

  const handleRenameKeyDown = (e: KeyboardEvent<HTMLInputElement>, id: string) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      commitRename(id);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setRenamingId(null);
    }
  };

  const handleDelete = (f: FileRow) => {
    if (window.confirm(`Delete ${f.name}? This cannot be undone.`)) {
      onDelete(f.id);
    }
  };

  return (
    <aside
      className={cx('wb-files', dragDepth > 0 && 'is-drag-over')}
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {dragDepth > 0 && (
        <div className="wb-files__drop-hint" aria-hidden="true">
          <span className="wb-icon wb-icon--upload" aria-hidden="true" />
          Drop {ACCEPTED_FILES_TEXT} files
        </div>
      )}
      <div className="wb-files__header">
        <FilesIcon className="wb-icon wb-icon--files" aria-hidden="true" />
        <h2 className="wb-files__title">Files</h2>
        <button
          type="button"
          className="wb-files__examples"
          onClick={onToggleExamples}
          aria-pressed={examplesOpen}
          title="Browse the example designs and copy one into your files"
        >
          <BookIcon className="wb-files__examples-icon" aria-hidden="true" />
          <span className="wb-files__label-text">Examples</span>
        </button>
      </div>

      <div className="wb-files__actions">
        <button
          type="button"
          className="wb-files__upload"
          onClick={onUpload}
          title="Upload File: add source files, or a .zip such as one Download All saved. Choose a project .json (with its files) to open a project."
        >
          <UploadIcon className="wb-files__action-icon" aria-hidden="true" />
          <span className="wb-files__label-text">Upload File</span>
        </button>
        <button type="button" className="wb-files__new" onClick={onNewFile} title="New File">
          <span className="wb-icon wb-icon--plus" aria-hidden="true" />
          <span className="wb-files__label-text">New File</span>
        </button>
        <button
          type="button"
          className="wb-files__open-project"
          onClick={onOpenProject}
          title="Open Project: open a project file by its URL (e.g. a GitHub gist) or, in the Windows app, its path"
        >
          <LinkIcon className="wb-files__action-icon" aria-hidden="true" />
          <span className="wb-files__label-text">Open Project</span>
        </button>
        <button
          type="button"
          className="wb-files__download-all"
          onClick={onDownloadAll}
          disabled={rows.length === 0}
          title="Download All: save every file as one .zip, keeping the folders"
        >
          <FolderZipIcon className="wb-files__action-icon" aria-hidden="true" />
          <span className="wb-files__label-text">Download All</span>
        </button>
      </div>

      {project && (
        <button
          type="button"
          className={cx('wb-files__project', projectOpen && 'is-open')}
          onClick={onToggleProject}
          aria-pressed={projectOpen}
          title="Open Project Page"
        >
          <ProjectIcon className="wb-files__project-icon" aria-hidden="true" />
          <span className="wb-files__project-text">
            <span className="wb-files__project-name">{project.name || 'Untitled project'}</span>
            {project.description.trim() !== '' && <span className="wb-files__project-description">{project.description.trim()}</span>}
          </span>
          {/* Its own tooltip: hovering the dot says what it means. */}
          {project.unsaved && <span className="wb-files__project-dot" role="img" aria-label="Unsaved changes" title="Unsaved changes" />}
        </button>
      )}

      {!project && onCreateProject && (
        <button
          type="button"
          className="wb-files__project wb-files__project--create"
          onClick={onCreateProject}
          title="Create Project: name a project and choose which files belong to it"
        >
          <ProjectIcon className="wb-files__project-icon" aria-hidden="true" />
          <span className="wb-files__project-text">Create Project</span>
        </button>
      )}

      {/* Only the tree scrolls: the header and buttons above stay put. */}
      <ScrollArea className="wb-files__scroll">
        <div className="wb-files__tree" role="tree" ref={treeRef}>
          {rowsByFolder(rows).map(({ folder, rows: inFolder }) => {
            const isCollapsed = Boolean(collapsed[folder]);
            return (
              <div className="wb-files__folder" key={folder}>
                <button
                  type="button"
                  className="wb-files__folder-label"
                  onClick={() => toggleFolder(folder)}
                  aria-expanded={!isCollapsed}
                >
                  <span className={cx('wb-icon wb-icon--chevron', !isCollapsed && 'is-open')} aria-hidden="true" />
                  <span className="wb-icon wb-icon--folder" aria-hidden="true" />
                  <span className="wb-files__label-text">{folder}/</span>
                </button>
                {!isCollapsed && (
                  <ul className="wb-files__list" role="group">
                    {inFolder.map((f) => (
                      <li key={f.id}>
                        <div className={cx('wb-files__row', f.shown && 'is-shown')}>
                          {hasTopDot(folder) && (
                            <TopDotButton
                              file={f}
                              locked={topLocked}
                              onSetTop={onSetTopFile}
                            />
                          )}
                          {renamingId === f.id ? (
                            <span
                              className={cx(
                                'wb-files__file wb-files__file--editing',
                                hasTopDot(folder) && 'wb-files__file--has-top-dot',
                              )}
                            >
                              <FileIcon className="wb-icon--file" aria-hidden="true" />
                              <input
                                type="text"
                                className="wb-files__rename-input"
                                value={draftName}
                                autoFocus
                                onFocus={(e) => e.currentTarget.select()}
                                onChange={(e) => setDraftName(e.target.value)}
                                onKeyDown={(e) => handleRenameKeyDown(e, f.id)}
                                onBlur={() => commitRename(f.id)}
                                aria-label={`Rename ${f.name}`}
                              />
                            </span>
                          ) : (
                            <button
                              type="button"
                              role="treeitem"
                              aria-selected={f.shown}
                              title={f.name}
                              className={cx('wb-files__file', hasTopDot(folder) && 'wb-files__file--has-top-dot')}
                              onClick={() => onSelect(f.id)}
                              onDoubleClick={() => startRename(f)}
                            >
                              <FileRowLabel row={f} />
                            </button>
                          )}
                          {renamingId !== f.id && (
                            <span className="wb-files__row-actions">
                              <button
                                type="button"
                                className="wb-files__row-action"
                                aria-label={`Download ${f.name}`}
                                title="Download"
                                onClick={() => onDownload(f.id)}
                              >
                                <DownloadIcon className="wb-files__row-icon" aria-hidden="true" />
                              </button>
                              <button
                                type="button"
                                className="wb-files__row-action"
                                aria-label={`Rename ${f.name}`}
                                title="Rename"
                                onClick={() => startRename(f)}
                              >
                                <EditIcon className="wb-files__row-icon" aria-hidden="true" />
                              </button>
                              <button
                                type="button"
                                className="wb-files__row-action wb-files__row-action--danger"
                                aria-label={`Delete ${f.name}`}
                                title="Delete"
                                onClick={() => handleDelete(f)}
                              >
                                <DeleteIcon className="wb-files__row-icon" aria-hidden="true" />
                              </button>
                            </span>
                          )}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            );
          })}
        </div>
      </ScrollArea>
    </aside>
  );
}

/**
 * Keeps a shown file's row in sight when what is shown changes, e.g. after a pick in
 * the header's file menu. A collapsed folder stays collapsed: the student closed it.
 */
function useScrollShownIntoView(rows: readonly FileRow[]) {
  const treeRef = useRef<HTMLDivElement>(null);
  const shownKey = rows
    .filter((row) => row.shown)
    .map((row) => row.id)
    .join('|');
  useEffect(() => {
    treeRef.current?.querySelector('.wb-files__row.is-shown')?.scrollIntoView({ block: 'nearest' });
  }, [shownKey]);
  return treeRef;
}

export default FileExplorer;
