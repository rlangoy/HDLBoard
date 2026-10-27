// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import { Dialog } from './Dialog';
import { AlertIcon } from './icons';
import './NewFileDialog.css';

export interface OverwriteDialogProps {
  /** Every file the save would overwrite, by its full path relative to the project file. */
  paths: readonly string[];
  onOverwrite: () => void;
  onCancel: () => void;
}

/**
 * Save project would write over files that are not the project's own
 * (docs/impl_project_structure.md D12): ask first. Full relative paths, never bare names:
 * with several projects in one folder a bare name is ambiguous. Cancel saves nothing.
 */
export function OverwriteDialog({ paths, onOverwrite, onCancel }: OverwriteDialogProps) {
  return (
    <Dialog
      open
      onClose={onCancel}
      title="Overwrite files?"
      subtitle={paths.length === 1 ? 'A file with this name is already there.' : `${paths.length} files with these names are already there.`}
      icon={<AlertIcon />}
      describedBy="wb-overwrite-list"
      footer={
        <div className="wb-dialog__actions">
          <button type="button" className="wb-dialog__secondary" onClick={onCancel}>
            Cancel
          </button>
          <button type="button" className="wb-dialog__close" autoFocus onClick={onOverwrite}>
            Overwrite
          </button>
        </div>
      }
    >
      <p className="wb-newfile__label">Saving the project writes over:</p>
      <ul id="wb-overwrite-list" className="wb-overwrite__list">
        {paths.map((path) => (
          <li key={path}>
            <code>{path}</code>
          </li>
        ))}
      </ul>
      <p className="wb-newfile__label">Cancel saves nothing.</p>
    </Dialog>
  );
}
