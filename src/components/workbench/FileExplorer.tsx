import { useState, type KeyboardEvent } from 'react';
import { cx } from '../board';
import type { VhdlFile } from './files';
import './FileExplorer.css';

export interface FileExplorerProps {
  files: VhdlFile[];
  activeFileId: string | null;
  onSelect: (id: string) => void;
  onUpload: () => void;
  onNewFile: () => void;
  onRename: (id: string, name: string) => void;
  onDelete: (id: string) => void;
}

const FOLDER_ORDER: VhdlFile['folder'][] = ['vhdl', 'work'];

/**
 * The "Files" panel: upload / new-file actions above a two-folder tree
 * (`vhdl/` for the design, `work/` for the testbench) matching
 * `DesignResources/WorkBench.png`.
 */
export function FileExplorer({
  files,
  activeFileId,
  onSelect,
  onUpload,
  onNewFile,
  onRename,
  onDelete,
}: FileExplorerProps) {
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [draftName, setDraftName] = useState('');

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
    <aside className="wb-files">
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
                        {renamingId === f.id ? (
                          <span className="wb-files__file wb-files__file--editing">
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
                            className="wb-files__file"
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
                              <span className="wb-icon wb-icon--rename" aria-hidden="true" />
                            </button>
                            <button
                              type="button"
                              className="wb-files__row-action wb-files__row-action--danger"
                              aria-label={`Delete ${f.name}`}
                              onClick={() => handleDelete(f)}
                            >
                              <span className="wb-icon wb-icon--trash" aria-hidden="true" />
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
