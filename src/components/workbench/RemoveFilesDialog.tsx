// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import { Dialog } from './Dialog';
import { AlertIcon } from './icons';
import './NewFileDialog.css';
import './BoardChangeDialog.css';

export interface RemoveFilesDialogProps {
  /** The new project's name. */
  projectName: string;
  /** The files now in Files. */
  fileNames: readonly string[];
  /** The top file Keep files adds (in the open project's board's names), and the one Remove files leaves alone (the chosen board's). */
  keepFileName: string;
  removeFileName: string;
  onKeep: () => void;
  onRemove: () => void;
  onCancel: () => void;
}

/** At most this many file names are listed; the rest are counted. */
const LISTED_FILES = 8;

/**
 * New File › Project with files in Files: should the new project list them, or start
 * without them? Removing takes them out of Files only — files saved on disk or in a gist
 * stay there — so the dialog says that unsaved changes are lost. Cancel creates nothing.
 */
export function RemoveFilesDialog({ projectName, fileNames, keepFileName, removeFileName, onKeep, onRemove, onCancel }: RemoveFilesDialogProps) {
  return (
    <Dialog
      open
      onClose={onCancel}
      title="Remove the existing files?"
      subtitle={`New project ${projectName}`}
      icon={<AlertIcon />}
      describedBy="wb-removefiles-list"
      footer={
        <div className="wb-newfile__buttons">
          <button type="button" className="wb-newfile__cancel" onClick={onCancel}>
            Cancel
          </button>
          <button type="button" className="wb-newfile__cancel" onClick={onRemove}>
            Remove files
          </button>
          <button type="button" className="wb-dialog__close" autoFocus onClick={onKeep}>
            Keep files
          </button>
        </div>
      }
    >
      <FileList fileNames={fileNames} />
      <Choices keepFileName={keepFileName} removeFileName={removeFileName} />
    </Dialog>
  );
}

/** The files now in Files, at most LISTED_FILES by name. */
function FileList({ fileNames }: { fileNames: readonly string[] }) {
  const listed = fileNames.slice(0, LISTED_FILES);
  const more = fileNames.length - listed.length;
  return (
    <>
      <p className="wb-newfile__label">Files has {fileNames.length === 1 ? 'a file' : `${fileNames.length} files`}:</p>
      <ul id="wb-removefiles-list" className="wb-overwrite__list">
        {listed.map((name) => (
          <li key={name}>
            <code>{name}</code>
          </li>
        ))}
        {more > 0 && <li>and {more} more</li>}
      </ul>
    </>
  );
}

/** What each button does, in its own words. */
function Choices({ keepFileName, removeFileName }: { keepFileName: string; removeFileName: string }) {
  return (
    <dl className="wb-boardchange__choices">
      <div>
        <dt>Keep files</dt>
        <dd>The new project lists them, and {keepFileName}, a new top file in their names.</dd>
      </div>
      <div>
        <dt>Remove files</dt>
        <dd>
          They leave Files, and the new project starts with {removeFileName} alone. Copies saved on disk or on GitHub
          are not touched; changes not saved are lost.
        </dd>
      </div>
    </dl>
  );
}
