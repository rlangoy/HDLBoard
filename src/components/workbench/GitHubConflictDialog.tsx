// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import { Dialog } from './Dialog';
import { AlertIcon, CloudDownloadIcon, CloudUploadIcon } from './icons';
import type { SaveConflict } from './useGitHubProjects';
import './GitHub.css';

export interface GitHubConflictDialogProps {
  conflict: SaveConflict;
  projectName: string;
  onReplaceGitHubVersion: () => void;
  onGetGitHubVersion: () => void;
  onCancel: () => void;
}

/**
 * Save to GitHub stopped: the project on GitHub changed since it was opened here
 * (another computer, github.com), so saving would overwrite that. Nothing is
 * overwritten until the student picks which version to keep.
 */
export function GitHubConflictDialog({ conflict, projectName, onReplaceGitHubVersion, onGetGitHubVersion, onCancel }: GitHubConflictDialogProps) {
  return (
    <Dialog
      open
      onClose={onCancel}
      title="Changed on GitHub"
      subtitle={projectName}
      icon={<AlertIcon />}
      footer={
        <div className="wb-github__conflict-buttons">
          <button type="button" className="wb-github__btn" onClick={onCancel}>
            Cancel
          </button>
          <button type="button" className="wb-github__btn" onClick={onGetGitHubVersion}>
            <CloudDownloadIcon aria-hidden="true" />
            Use the GitHub version
          </button>
          <button type="button" className="wb-github__btn wb-github__btn--danger" onClick={onReplaceGitHubVersion}>
            <CloudUploadIcon aria-hidden="true" />
            Keep mine, replace GitHub's
          </button>
        </div>
      }
    >
      <div className="wb-github__conflict">
        <p>
          {conflict.whenKnown
            ? 'The project on GitHub was changed after you opened it here, maybe on another computer or on github.com.'
            : 'HDLBoard cannot tell whether the project on GitHub was changed since you opened it here.'}{' '}
          Which version do you want to keep?
        </p>
        <ul>
          <li>
            <strong>Use the GitHub version</strong> opens the project as it is on GitHub. Your changes here are lost.
          </li>
          <li>
            <strong>Keep mine</strong> saves your version to GitHub. The changes made on GitHub are lost.
          </li>
        </ul>
      </div>
    </Dialog>
  );
}
