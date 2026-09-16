import { useState } from 'react';
import { cx } from '../board';
import type { VhdlFile } from './files';
import './FileExplorer.css';

export interface FileExplorerProps {
  files: VhdlFile[];
  activeFileId: string | null;
  onSelect: (id: string) => void;
  onUpload: () => void;
  onNewFile: () => void;
}

const FOLDER_ORDER: VhdlFile['folder'][] = ['vhdl', 'work'];

/**
 * The "Files" panel: upload / new-file actions above a two-folder tree
 * (`vhdl/` for the design, `work/` for the testbench) matching
 * `DesignResources/WorkBench.png`.
 */
export function FileExplorer({ files, activeFileId, onSelect, onUpload, onNewFile }: FileExplorerProps) {
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  const toggleFolder = (folder: string) => {
    setCollapsed((prev) => ({ ...prev, [folder]: !prev[folder] }));
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
                      <button
                        type="button"
                        role="treeitem"
                        aria-selected={f.id === activeFileId}
                        className={cx('wb-files__file', f.id === activeFileId && 'is-active')}
                        onClick={() => onSelect(f.id)}
                      >
                        <span className="wb-icon wb-icon--file" aria-hidden="true" />
                        <span className="wb-files__label-text">{f.name}</span>
                      </button>
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
