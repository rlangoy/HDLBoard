// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import { useId, useState } from 'react';
import { cx } from '../../board';
import { PROJECT_ACCEPTED_FILES_TEXT } from '../fileKinds';
import { FilePlusIcon, PlusIcon, UploadIcon } from '../icons';
import type { NewFileLanguage } from '../newFile';
import { FoldingPageCard } from '../page/PageCard';
import { useFileDrop, type FilesDropped } from '../useFileDrop';
import { NewFileForm } from './NewFileForm';
import { LANGUAGE_OPTIONS } from './newProjectForm';

/** The ways a file joins the open project, from the workspace's files. */
export interface AddProjectFiles {
  /** What a new file's name field starts with, e.g. untitled1. */
  suggestedName: string;
  /** The names in Files, which a new file may not take. */
  existingNames: readonly string[];
  /** Creates the file (a valid name, with its extension) with the board's ports; it joins the project. */
  onCreate: (fileName: string, language: NewFileLanguage) => void;
  /** The computer's file picker; the files chosen join the project. */
  onBrowse: () => void;
  /** Files dropped from the computer join the project as Browse adds them. */
  onDrop: FilesDropped;
  /** Work in progress elsewhere on the page: the buttons wait. */
  busy: boolean;
}

interface AddFilesCardProps {
  addFiles: AddProjectFiles;
  /** Unfolds the card, for the sidebar's Add file, which scrolls to it. */
  unfold: boolean;
}

/** Active project › Add files, under Project files: create a new file, or add files from the computer. */
export function AddFilesCard({ addFiles, unfold }: AddFilesCardProps) {
  return (
    <FoldingPageCard title="Add files" icon={<FilePlusIcon />} unfold={unfold}>
      <div className="wb-add-files">
        <CreateNewFile addFiles={addFiles} />
        <AddExistingFiles onBrowse={addFiles.onBrowse} onDrop={addFiles.onDrop} busy={addFiles.busy} />
      </div>
    </FoldingPageCard>
  );
}

/** A button for each language; either one opens the file-name form of that language in their place. */
function CreateNewFile({ addFiles }: { addFiles: AddProjectFiles }) {
  const [language, setLanguage] = useState<NewFileLanguage | null>(null);
  if (language === null) return <LanguageButtons busy={addFiles.busy} onChoose={setLanguage} />;
  const create = (fileName: string, chosen: NewFileLanguage) => {
    addFiles.onCreate(fileName, chosen);
    setLanguage(null);
  };
  return (
    <NewFileForm
      key={language}
      language={language}
      suggestedName={addFiles.suggestedName}
      existingNames={addFiles.existingNames}
      busy={addFiles.busy}
      onCreate={create}
      onCancel={() => setLanguage(null)}
    />
  );
}

function LanguageButtons({ busy, onChoose }: { busy: boolean; onChoose: (language: NewFileLanguage) => void }) {
  const titleId = useId();
  return (
    <section aria-labelledby={titleId}>
      <h4 id={titleId} className="wb-add-files__label">
        Create new file
      </h4>
      <div className="wb-add-files__languages">
        {LANGUAGE_OPTIONS.map((option) => (
          <button key={option.id} type="button" className="wb-projects__btn wb-add-files__language" disabled={busy} onClick={() => onChoose(option.id)}>
            <PlusIcon aria-hidden="true" />
            {option.label} file
          </button>
        ))}
      </div>
    </section>
  );
}

/** While busy a drop is still taken, so the browser does not open the file in the page's place. */
const IGNORED_DROP: FilesDropped = () => undefined;

interface AddExistingFilesProps {
  onBrowse: () => void;
  onDrop: FilesDropped;
  busy: boolean;
}

/** A dashed area to drop files on, with Browse files for the picker. */
function AddExistingFiles({ onBrowse, onDrop, busy }: AddExistingFilesProps) {
  const titleId = useId();
  const drop = useFileDrop(busy ? IGNORED_DROP : onDrop);
  return (
    <section aria-labelledby={titleId} data-add-existing-files>
      <h4 id={titleId} className="wb-add-files__label">
        Add existing files
      </h4>
      <div className={cx('wb-add-files__drop', drop.dragging && 'is-drag-over')} {...drop.handlers}>
        <UploadIcon className="wb-add-files__drop-icon" aria-hidden="true" />
        <strong aria-live="polite">{drop.dragging ? 'Drop to add the files to the project' : 'Drag and drop files here'}</strong>
        <span className="wb-add-files__browse">
          or
          <button type="button" className="wb-projects__btn is-open" disabled={busy} onClick={onBrowse}>
            Browse files
          </button>
        </span>
        <span className="wb-projects__muted">{PROJECT_ACCEPTED_FILES_TEXT}</span>
      </div>
    </section>
  );
}
