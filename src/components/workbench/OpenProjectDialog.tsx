// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import { useId, useState, type FormEvent } from 'react';
import { Dialog } from './Dialog';
import { ProjectIcon } from './icons';
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
  onClose: () => void;
}

/**
 * Open Project: the address of a project file (docs/PROJECTS.md) — a URL such as a
 * GitHub gist, a path on the HDLBoard site, or, in the Windows app, a file path.
 * The project's files are read from next to it, or from their own URLs.
 */
export function OpenProjectDialog({ canOpenPaths, busy, error, onOpen, onClose }: OpenProjectDialogProps) {
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
      title="Open Project"
      subtitle="Open a .hdlboard.json project file and all its files"
      icon={<ProjectIcon />}
      footer={
        <div className="wb-newfile__buttons">
          <button type="button" className="wb-newfile__cancel" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" form={formId} className="wb-dialog__close" disabled={empty || busy}>
            {busy ? 'Opening…' : 'Open'}
          </button>
        </div>
      }
    >
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
          {!canOpenPaths && ' To open a project from this computer, use Upload File and select the project file together with its files.'}
        </p>
      </form>
    </Dialog>
  );
}

export default OpenProjectDialog;
