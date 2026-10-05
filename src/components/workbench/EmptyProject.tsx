// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import { BookIcon, FileIcon, UploadIcon } from './icons';

const TEXT = {
  title: 'No files yet',
  hint: 'Start from an example, or make your own.',
  examples: 'Examples',
  newFile: 'New file',
  upload: 'Upload',
};

export interface EmptyProjectProps {
  onExamples: () => void;
  onNewFile: () => void;
  onUpload: () => void;
}

/**
 * The editor of a project with no files (docs/cleanup_file_tabs.md § 5.6): the Files
 * panel's own three ways to get one, so this also shows where they live.
 */
export function EmptyProject({ onExamples, onNewFile, onUpload }: EmptyProjectProps) {
  return (
    <div className="wb-editor__empty">
      <FileIcon className="wb-editor__empty-icon" aria-hidden="true" />
      <p className="wb-editor__empty-title">{TEXT.title}</p>
      <p className="wb-editor__empty-hint">{TEXT.hint}</p>
      <div className="wb-editor__empty-actions">
        <button type="button" className="wb-editor__empty-btn is-primary" onClick={onExamples}>
          <BookIcon aria-hidden="true" />
          {TEXT.examples}
        </button>
        <button type="button" className="wb-editor__empty-btn" onClick={onNewFile}>
          <span className="wb-icon wb-icon--plus" aria-hidden="true" />
          {TEXT.newFile}
        </button>
        <button type="button" className="wb-editor__empty-btn" onClick={onUpload}>
          <UploadIcon aria-hidden="true" />
          {TEXT.upload}
        </button>
      </div>
    </div>
  );
}
