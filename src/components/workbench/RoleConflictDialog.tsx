// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import { Dialog } from './Dialog';
import { ChipIcon, FlaskIcon } from './icons';
import { TEXT, keepFile, roleConflictText } from './testbenchText';
import type { UnitRole } from './tbDetect/types';
import './NewFileDialog.css';

export interface RoleConflictDialogProps {
  /** The file the student is reclassifying. */
  fileName: string;
  /** The file in the other pane, which already has that role. */
  otherName: string;
  role: UnitRole;
  onKeep: (which: 'file' | 'other') => void;
  onCancel: () => void;
}

/**
 * A role change from a badge menu would put two designs or two testbenches side
 * by side, which the split never shows: ask which file stays on screen, or cancel
 * the change. Keeping a file lays the split out again around it.
 */
export function RoleConflictDialog({ fileName, otherName, role, onKeep, onCancel }: RoleConflictDialogProps) {
  return (
    <Dialog
      open
      onClose={onCancel}
      title={role === 'tb' ? TEXT.twoTestbenchesTitle : TEXT.twoDesignsTitle}
      subtitle={roleConflictText(fileName, otherName, role)}
      icon={role === 'tb' ? <FlaskIcon /> : <ChipIcon />}
      footer={
        <div className="wb-newfile__buttons">
          <button type="button" className="wb-newfile__cancel" onClick={onCancel}>
            {TEXT.cancel}
          </button>
          <button type="button" className="wb-newfile__cancel" onClick={() => onKeep('other')}>
            {keepFile(otherName)}
          </button>
          <button type="button" className="wb-dialog__close" autoFocus onClick={() => onKeep('file')}>
            {keepFile(fileName)}
          </button>
        </div>
      }
    >
      <p className="wb-newfile__label">{TEXT.roleConflictQuestion}</p>
    </Dialog>
  );
}
