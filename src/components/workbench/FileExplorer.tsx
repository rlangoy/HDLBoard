// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import { useState, type DragEvent, type KeyboardEvent } from 'react';
import { cx } from '../board';
import type { VhdlFile } from './files';
import { DeleteIcon, EditIcon } from './icons';
import './FileExplorer.css';

export interface FileExplorerProps {
  files: VhdlFile[];
  activeFileId: string | null;
  onSelect: (id: string) => void;
  onUpload: () => void;
  onNewFile: () => void;
  onRename: (id: string, name: string) => void;
  onDelete: (id: string) => void;
  /** Files dropped anywhere on this panel — Workbench does the reading/filtering. */
  onFilesDropped: (files: FileList) => void;
  /** The `vhdl/` file GHDL elaborates as top-level — a blue dot, vs. every other `vhdl/` file's gray circle. */
  topFileId: string | null;
  onSetTopFile: (id: string) => void;
}

const FOLDER_ORDER: VhdlFile['folder'][] = ['vhdl', 'work'];

/**
 * The "Files" panel: upload / new-file actions above the folder tree —
 * `vhdl/` for the design and `work/` for an uploaded `tb_*` testbench.
 * A folder with no files is not drawn, so the starter project shows only
 * `vhdl/`.
 */
export function FileExplorer({
  files,
  activeFileId,
  onSelect,
  onUpload,
  onNewFile,
  onRename,
  onDelete,
  onFilesDropped,
  topFileId,
  onSetTopFile,
}: FileExplorerProps) {
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [draftName, setDraftName] = useState('');
  // A ref-counted depth rather than a plain boolean: dragging over a child
  // element fires dragleave on the parent before dragenter on the child,
  // so a naive "set false on dragleave" flickers the highlight off and on
  // as the pointer crosses every row underneath it.
  const [dragDepth, setDragDepth] = useState(0);

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
    if (e.dataTransfer.files.length > 0) onFilesDropped(e.dataTransfer.files);
  };

  const toggleFolder = (folder: string) => {
    setCollapsed((prev) => ({ ...prev, [folder]: !prev[folder] }));
  };

  const startRename = (f: VhdlFile) => {
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

  const handleDelete = (f: VhdlFile) => {
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
          Drop .vhd / .vhdl files
        </div>
      )}
      <div className="wb-files__header">
        <span className="wb-icon wb-icon--folder-outline" aria-hidden="true" />
        <h2 className="wb-files__title">Files</h2>
      </div>

      <div className="wb-files__actions">
        <button type="button" className="wb-files__upload" onClick={onUpload}>
          <span className="wb-icon wb-icon--upload" aria-hidden="true" />
          <span className="wb-files__label-text">Upload VHDL File</span>
        </button>
        <button type="button" className="wb-files__new" onClick={onNewFile}>
          <span className="wb-icon wb-icon--plus" aria-hidden="true" />
          <span className="wb-files__label-text">New File</span>
        </button>
      </div>

      <div className="wb-files__tree" role="tree">
        {FOLDER_ORDER.map((folder) => {
          const inFolder = files.filter((f) => f.folder === folder);
          if (inFolder.length === 0) return null;
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
                      <div
                        className={cx('wb-files__row', f.id === activeFileId && 'is-active')}
                      >
                        {folder === 'vhdl' && (
                          <button
                            type="button"
                            className={cx('wb-files__top-dot', f.id === topFileId && 'is-top')}
                            aria-pressed={f.id === topFileId}
                            aria-label={
                              f.id === topFileId
                                ? `${f.name} is the top-level file`
                                : `Set ${f.name} as the top-level file`
                            }
                            title={f.id === topFileId ? 'Top-File' : 'Set Top-File'}
                            disabled={f.id === topFileId}
                            onClick={() => onSetTopFile(f.id)}
                          >
                            <span className="wb-files__top-dot-glyph" aria-hidden="true" />
                          </button>
                        )}
                        {renamingId === f.id ? (
                          <span
                            className={cx(
                              'wb-files__file wb-files__file--editing',
                              folder === 'vhdl' && 'wb-files__file--has-top-dot',
                            )}
                          >
                            <span className="wb-icon wb-icon--file" aria-hidden="true" />
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
                            aria-selected={f.id === activeFileId}
                            className={cx('wb-files__file', folder === 'vhdl' && 'wb-files__file--has-top-dot')}
                            onClick={() => onSelect(f.id)}
                            onDoubleClick={() => startRename(f)}
                          >
                            <span className="wb-icon wb-icon--file" aria-hidden="true" />
                            <span className="wb-files__label-text">{f.name}</span>
                          </button>
                        )}
                        {renamingId !== f.id && (
                          <span className="wb-files__row-actions">
                            <button
                              type="button"
                              className="wb-files__row-action"
                              aria-label={`Rename ${f.name}`}
                              onClick={() => startRename(f)}
                            >
                              <EditIcon className="wb-files__row-icon" aria-hidden="true" />
                            </button>
                            <button
                              type="button"
                              className="wb-files__row-action wb-files__row-action--danger"
                              aria-label={`Delete ${f.name}`}
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
    </aside>
  );
}

export default FileExplorer;
