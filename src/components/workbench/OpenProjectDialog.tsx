// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import { useEffect, useId, useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import { Dialog } from './Dialog';
import { FolderOpenIcon, ProjectIcon, UploadIcon } from './icons';
import './NewFileDialog.css';

/** The example project shipped with HDLBoard (public/projects/), by its address relative to the page. */
export const EXAMPLE_PROJECT = 'projects/adder-and-counter/adder-and-counter.hdlboard.json';

export interface OpenProjectDialogProps {
  /** The Windows app: a file path can be opened too. */
  canOpenPaths: boolean;
  /** Opening is in progress. */
  busy: boolean;
  /** Why the last try failed, if it did. */
  error: string | null;
  onOpen: (location: string) => void;
  /** Every file of a folder the student chose: the project file and its files. */
  onFolderChosen: (files: File[]) => void;
  /** Chrome and Edge: Open project folder asks for the folder itself instead (a handle the Projects page keeps). */
  onChooseFolder?: () => void;
  /** Select files: Upload File's own picker (source files, a .zip, or a project file with its files). */
  onSelectFiles: () => void;
  onClose: () => void;
}

/**
 * Open project or files (Upload File, and the Projects page's Open from URL): files or a
 * project folder from this computer, or the address of a project file (docs/PROJECTS.md) — a URL such as a
 * GitHub gist, a path on the HDLBoard site, or, in the Windows app, a file path.
 * The project's files are read from next to it, or from their own URLs.
 */
export function OpenProjectDialog({ canOpenPaths, busy, error, onOpen, onFolderChosen, onChooseFolder, onSelectFiles, onClose }: OpenProjectDialogProps) {
  const [location, setLocation] = useState('');
  const formId = useId();
  const empty = location.trim() === '';

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!empty && !busy) onOpen(location.trim());
  };

  return (
    <Dialog
      open
      onClose={onClose}
      title="Open project or files"
      subtitle="Add source files, or open a .hdlboard.json project file and all its files"
      icon={<ProjectIcon />}
      footer={
        <div className="wb-dialog__actions">
          <button type="button" className="wb-dialog__secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" form={formId} className="wb-dialog__close" disabled={empty || busy}>
            {busy ? 'Opening…' : 'Open'}
          </button>
        </div>
      }
    >
      <FromThisComputer busy={busy} onFolderChosen={onFolderChosen} onChooseFolder={onChooseFolder} onSelectFiles={onSelectFiles} />
      <form id={formId} className="wb-newfile" onSubmit={handleSubmit}>
        <label className="wb-newfile__label" htmlFor={`${formId}-location`}>
          {canOpenPaths ? 'Project file URL or path' : 'Project file URL'}
        </label>
        <input
          id={`${formId}-location`}
          className="wb-newfile__name"
          type="text"
          value={location}
          onChange={(e) => setLocation(e.target.value)}
          placeholder={canOpenPaths ? 'https://… or C:\\Projects\\lab1\\lab1.hdlboard.json' : 'https://…/lab1.hdlboard.json'}
          autoFocus
          spellCheck={false}
          autoComplete="off"
          aria-invalid={error !== null}
          aria-describedby={`${formId}-hint`}
        />
        <div id={`${formId}-hint`} className="wb-newfile__hint">
          {error !== null ? (
            <span className="wb-newfile__error" role="alert">
              {error}
            </span>
          ) : (
            <ul className="wb-openproject__examples">
              <li>
                A GitHub gist: <code>https://gist.github.com/&lt;user&gt;/&lt;id&gt;</code>
              </li>
              <li>
                Any web address: <code>https://example.com/lab1/lab1.hdlboard.json</code>
              </li>
              <li>
                A project on this HDLBoard site:{' '}
                <button type="button" className="wb-openproject__example" onClick={() => setLocation(EXAMPLE_PROJECT)}>
                  {EXAMPLE_PROJECT}
                </button>
              </li>
              {canOpenPaths && (
                <li>
                  A file on this computer: <code>C:\Projects\lab1\lab1.hdlboard.json</code>
                </li>
              )}
            </ul>
          )}
        </div>
        <p className="wb-openproject__note">
          The files listed without a URL are read from the folder the project file is in.
          {!canOpenPaths && ' To open a project from this computer, use Open project folder above.'}
        </p>
      </form>
    </Dialog>
  );
}

/**
 * From this computer: Select files hands over to Upload File's picker; with Open project
 * folder the student chooses the project's folder, and its project file opens with its files. A browser cannot read the files next to a single chosen file,
 * but it can read a whole folder the student chooses (every current browser).
 */
function FromThisComputer({
  busy,
  onFolderChosen,
  onChooseFolder,
  onSelectFiles,
}: {
  busy: boolean;
  onFolderChosen: (files: File[]) => void;
  onChooseFolder?: () => void;
  onSelectFiles: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  // `webkitdirectory` is not in React's typings.
  useEffect(() => {
    inputRef.current?.setAttribute('webkitdirectory', '');
  }, []);

  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) onFolderChosen([...e.target.files]);
    e.target.value = '';
  };

  return (
    <div className="wb-openproject__folder">
      <span className="wb-newfile__label">From this computer</span>
      <div className="wb-openproject__folder-btns">
        <button type="button" className="wb-openproject__folder-btn" disabled={busy} onClick={onSelectFiles}>
          <UploadIcon aria-hidden="true" />
          Select files…
        </button>
        <button type="button" className="wb-openproject__folder-btn" disabled={busy} onClick={() => (onChooseFolder ? onChooseFolder() : inputRef.current?.click())}>
          <FolderOpenIcon aria-hidden="true" />
          Open project folder…
        </button>
      </div>
      <span className="wb-openproject__note">
        Select source files or a .zip to add them. To open a project, select its .hdlboard.json file with its files, or open
        the folder that holds them.
      </span>
      <input ref={inputRef} type="file" multiple hidden onChange={handleChange} tabIndex={-1} />
    </div>
  );
}

export default OpenProjectDialog;
