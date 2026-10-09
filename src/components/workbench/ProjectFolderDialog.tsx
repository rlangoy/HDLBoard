// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import { useEffect, useRef, type ChangeEvent } from 'react';
import { Dialog } from './Dialog';
import { FolderOpenIcon } from './icons';
import './NewFileDialog.css';

export interface ProjectFolderDialogProps {
  projectName: string;
  /** The project's files that are stored next to the project file but were not chosen with it. */
  missing: readonly string[];
  /** Every file of the folder the student chose. */
  onFolderChosen: (files: File[]) => void;
  onClose: () => void;
}

/**
 * Shown as soon as a project opened in a browser lacks files stored next to it: a
 * browser can read only the files the student chooses, never the rest of the folder a
 * project file came from. One click picks that folder, and the files load.
 */
export function ProjectFolderDialog({ projectName, missing, onFolderChosen, onClose }: ProjectFolderDialogProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  // `webkitdirectory` is not in React's typings; every current browser supports it.
  useEffect(() => {
    inputRef.current?.setAttribute('webkitdirectory', '');
  }, []);

  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) onFolderChosen([...e.target.files]);
    e.target.value = '';
  };

  const one = missing.length === 1;
  return (
    <Dialog
      open
      onClose={onClose}
      title="Choose the project folder"
      subtitle={projectName || 'Project'}
      icon={<FolderOpenIcon />}
      footer={
        <div className="wb-newfile__buttons">
          <button type="button" className="wb-newfile__cancel" onClick={onClose}>
            Not now
          </button>
          <button type="button" className="wb-dialog__close wb-openproject__choose" onClick={() => inputRef.current?.click()} autoFocus>
            <FolderOpenIcon aria-hidden="true" />
            Choose project folder…
          </button>
        </div>
      }
    >
      <p className="wb-openproject__lead">
        {one ? 'This file is' : 'These files are'} stored in the same folder as the project file:
      </p>
      <ul className="wb-openproject__missing">
        {missing.map((name) => (
          <li key={name}>{name}</li>
        ))}
      </ul>
      <p className="wb-openproject__note">
        A browser can only read the files you choose. Choose the folder the project file is in, and HDLBoard loads{' '}
        {one ? 'it' : 'them'}. Next time, open the project with Open Project › Choose project folder.
      </p>
      <input ref={inputRef} type="file" multiple hidden onChange={handleChange} tabIndex={-1} />
    </Dialog>
  );
}

export default ProjectFolderDialog;
