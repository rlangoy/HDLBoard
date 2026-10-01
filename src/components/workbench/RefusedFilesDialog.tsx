// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import { useId } from 'react';
import { Dialog } from './Dialog';
import type { RefusedFile } from './fileNameRules';
import { FilesIcon } from './icons';
import './RefusedFilesDialog.css';

export interface RefusedFilesDialogProps {
  /** "Files not added", "File not renamed". */
  title: string;
  refused: readonly RefusedFile[];
  onClose: () => void;
}

/**
 * Says which files an upload, a drop or a rename refused, and why (fileNameRules.ts):
 * the name is taken, `tb_` is reserved, or the file is not a source file. Nothing was
 * changed for those files; any others in the same drop were added.
 */
export function RefusedFilesDialog({ title, refused, onClose }: RefusedFilesDialogProps) {
  const listId = `${useId()}-refused`;
  const subtitle = refused.length === 1 ? 'Nothing was changed for this file' : 'Nothing was changed for these files';
  return (
    <Dialog open onClose={onClose} title={title} subtitle={subtitle} icon={<FilesIcon />} describedBy={listId}>
      <ul id={listId} className="wb-refused">
        {refused.map(({ name, reason }) => (
          <li key={name} className="wb-refused__item">
            <strong className="wb-refused__name">{name}</strong>
            <span className="wb-refused__reason">{reason}</span>
          </li>
        ))}
      </ul>
    </Dialog>
  );
}

export default RefusedFilesDialog;
