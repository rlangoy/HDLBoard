// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import { useId, useState, type FormEvent } from 'react';
import { Dialog } from './Dialog';
import { FilesIcon } from './icons';
import { newFileName, newFileNameError, type NewFileLanguage } from './newFile';
import { projectFileNameFor, projectNameError } from './projectFile';
import './NewFileDialog.css';

export interface NewFileDialogProps {
  /** Pre-filled in the name field, selected so typing replaces it. */
  suggestedName: string;
  /** Every file name in the project, so a duplicate is caught before it is created. */
  existingNames: readonly string[];
  onCreate: (name: string, language: NewFileLanguage) => void;
  onClose: () => void;
  /** The language selected at first; VHDL unless given. */
  initialLanguage?: NewFileLanguage;
  /** Replaces the "Choose a name and a language" subtitle. */
  subtitle?: string;
  /** What the new file starts as: a board design (default) or an empty testbench. */
  kind?: 'design' | 'testbench';
  /**
   * Offers a third choice, Project: a project file listing the files now in Files,
   * opened on the project page. Not offered when this is not given.
   */
  onCreateProject?: (projectName: string) => void;
  /** How many files a new project would list. */
  projectFileCount?: number;
  /** The name of the project that is open now, which a new project replaces. */
  openProjectName?: string;
}

type Choice = NewFileLanguage | 'project';

/**
 * Asked by New File (the Files panel button and the editor's + tab): a name, and
 * VHDL or Verilog below it — VHDL unless changed. The extension follows the radio
 * button, and the name has to be a legal identifier of that language, since the
 * file is created as a module or entity of the same name (newFile.ts).
 *
 * Mounted only while it is open, so every opening starts over with the suggested
 * name and VHDL.
 */
export function NewFileDialog({
  suggestedName,
  existingNames,
  onCreate,
  onClose,
  initialLanguage = 'vhdl',
  subtitle,
  kind = 'design',
  onCreateProject,
  projectFileCount = 0,
  openProjectName,
}: NewFileDialogProps) {
  const [name, setName] = useState(suggestedName);
  const [choice, setChoice] = useState<Choice>(initialLanguage);
  const formId = useId();
  const errorId = `${formId}-error`;
  const isProject = choice === 'project';
  const language: NewFileLanguage = choice === 'project' ? 'vhdl' : choice;

  const error = isProject ? projectNameError(name) : newFileNameError(name, language, existingNames);
  // An empty field is not worth a red line; the disabled Create says enough.
  const empty = name.trim() === '';
  const showError = error !== undefined && !empty;

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (error !== undefined) return;
    if (isProject) onCreateProject?.(name.trim());
    else onCreate(newFileName(name, language), language);
  };

  return (
    <Dialog
      open
      onClose={onClose}
      title={isProject ? 'New Project' : 'New File'}
      subtitle={subtitle ?? (onCreateProject ? 'Choose a name, and a language or a project' : 'Choose a name and a language')}
      icon={<FilesIcon />}
      footer={
        <div className="wb-newfile__buttons">
          <button type="button" className="wb-newfile__cancel" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" form={formId} className="wb-dialog__close" disabled={error !== undefined}>
            Create
          </button>
        </div>
      }
    >
      <form id={formId} className="wb-newfile" onSubmit={handleSubmit}>
        <label className="wb-newfile__label" htmlFor={`${formId}-name`}>
          {isProject ? 'Project name' : 'File name'}
        </label>
        <input
          id={`${formId}-name`}
          className="wb-newfile__name"
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onFocus={(e) => e.target.select()}
          autoFocus
          spellCheck={false}
          autoComplete="off"
          aria-invalid={showError}
          aria-describedby={errorId}
        />
        <p id={errorId} className="wb-newfile__hint" role={showError ? 'alert' : undefined}>
          {empty ? (
            isProject ? 'Enter a name for the new project.' : 'Enter a name for the new file.'
          ) : isProject ? (
            <ProjectHint name={name} fileCount={projectFileCount} openProjectName={openProjectName} />
          ) : showError ? (
            <span className="wb-newfile__error">{error}</span>
          ) : (
            <>
              Creates <strong>{newFileName(name, language)}</strong>
              {language === 'verilog' ? ' with a module' : ' with an entity'} of the same name
              {kind === 'testbench' ? ': an empty testbench, no ports.' : " and the board's ports."}
            </>
          )}
        </p>

        <fieldset className="wb-newfile__languages">
          <legend className="wb-newfile__label">{onCreateProject ? 'Create' : 'Language'}</legend>
          <label className="wb-newfile__radio">
            <input
              type="radio"
              name={`${formId}-language`}
              value="vhdl"
              checked={choice === 'vhdl'}
              onChange={() => setChoice('vhdl')}
            />
            VHDL <span className="wb-newfile__ext">.vhd</span>
          </label>
          <label className="wb-newfile__radio">
            <input
              type="radio"
              name={`${formId}-language`}
              value="verilog"
              checked={choice === 'verilog'}
              onChange={() => setChoice('verilog')}
            />
            Verilog <span className="wb-newfile__ext">.v</span>
          </label>
          {onCreateProject && (
            <label className="wb-newfile__radio">
              <input
                type="radio"
                name={`${formId}-language`}
                value="project"
                checked={isProject}
                onChange={() => setChoice('project')}
              />
              Project <span className="wb-newfile__ext">.hdlboard.json</span>
            </label>
          )}
        </fieldset>
      </form>
    </Dialog>
  );
}

interface ProjectHintProps {
  name: string;
  fileCount: number;
  openProjectName?: string;
}

/** What Create does with Project chosen: which file it makes, and what it lists. */
function ProjectHint({ name, fileCount, openProjectName }: ProjectHintProps) {
  const files = fileCount === 0 ? 'no files yet' : fileCount === 1 ? 'the file in Files' : `the ${fileCount} files in Files`;
  return (
    <>
      Creates <strong>{projectFileNameFor(name)}</strong> listing {files}, and opens the project page.
      {openProjectName !== undefined && <> It replaces the open project, {openProjectName}.</>}
    </>
  );
}

export default NewFileDialog;
