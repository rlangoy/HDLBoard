// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import { useEffect, useId, useRef, useState, type ChangeEvent, type KeyboardEvent, type ReactNode } from 'react';
import { cx } from '../board';
import { PROJECT_FILE_EXTENSION } from '../../project/types';
import {
  AlertIcon,
  CloseIcon,
  DeleteIcon,
  FileIcon,
  FolderOpenIcon,
  InfoIcon,
  LinkIcon,
  MinusIcon,
  OpenInIcon,
  PlusIcon,
  ProjectIcon,
  RefreshIcon,
  SaveIcon,
} from './icons';
import {
  KNOWN_BOARDS,
  MISSING_LOCAL_FILE,
  entryUrlError,
  projectFileBase,
  projectFileNameError,
  projectFileNameFromBase,
  type OpenProject,
  type ProjectDetails,
  type ProjectEntryRow,
} from './projectFile';
import { ScrollArea } from './ScrollArea';
import './ProjectPage.css';

export interface ProjectPageProps {
  project: OpenProject;
  /** The project's files as they are now (projectEntries). */
  rows: readonly ProjectEntryRow[];
  /** The project differs from its file as last opened or saved. */
  unsaved: boolean;
  /** Work in progress, e.g. "Downloading counter.vhd…"; the buttons wait while it runs. */
  busy: string | null;
  onDetailsChange: (details: ProjectDetails) => void;
  onEntryChange: (name: string, patch: { description?: string; url?: string }) => void;
  /** Show a file of the project in the editor. */
  onOpenFile: (name: string) => void;
  /** Take an entry that could not be loaded out of the project. */
  onRemoveEntry: (name: string) => void;
  /** Download a file again from its URL, replacing what Files has. */
  onReloadFromUrl: (name: string) => void;
  /** The files of a folder the student chose, to fill in entries that were not found. */
  onFolderChosen: (files: File[]) => void;
  /** Save the project file and every file of the project, side by side (projectSave.ts). */
  onSave: () => void;
  /** Where Save project writes, for its tooltip. */
  saveHint: string;
  /** Stop working in a project: Files keeps its files. */
  onCloseProject: () => void;
  /** Back to the code. */
  onClose: () => void;
  /** The GitHub card (ProjectGitHubCard), shown under the project's details. */
  github?: ReactNode;
  /** Files in Files that are not in the project (availableFiles): offered to be added. */
  available: readonly string[];
  onAddFiles: (names: readonly string[]) => void;
  /** Take a file out of the project; it stays in Files. */
  onLeaveProject: (name: string) => void;
}

/**
 * The project page: shown in place of the code while open (the editor stays mounted
 * underneath, like the Examples pane). Everything the project file holds can be edited
 * here — its name, board and description, its own file name, and each file's
 * description and URL. The files themselves are added, renamed and deleted in Files.
 */
export function ProjectPage(props: ProjectPageProps) {
  const { project, rows, unsaved, busy, onDetailsChange, onClose } = props;
  const missingInFolder = rows.filter((row) => row.status === 'unloaded' && row.problem === MISSING_LOCAL_FILE);
  const unloadedCount = rows.filter((row) => row.status === 'unloaded').length;
  const ids = useId();
  // Keyboard focus starts on the page, so Escape closes it and Tab walks its fields.
  const sectionRef = useRef<HTMLElement>(null);
  // A new project without a name starts in its name field instead (AutoTextArea autoFocus).
  const startsUnnamed = useRef(project.name === '');
  useEffect(() => {
    if (!startsUnnamed.current) sectionRef.current?.focus({ preventScroll: true });
  }, []);

  const closeOnEscape = (e: KeyboardEvent) => {
    if (e.key !== 'Escape' || e.defaultPrevented) return;
    e.preventDefault();
    onClose();
  };

  return (
    <section ref={sectionRef} tabIndex={-1} className="wb-project" aria-labelledby={`${ids}-title`} onKeyDown={closeOnEscape}>
      <ScrollArea className="wb-project__scroll">
        <div className="wb-project__inner">
          <section className="wb-project__card wb-project__header" aria-label="Project">
            <div className="wb-project__top">
              <div className="wb-project__badge" aria-hidden="true">
                <ProjectIcon />
              </div>
              <div className="wb-project__names">
                <span className="wb-project__eyebrow">
                  Project
                  {unsaved && <span className="wb-project__unsaved">Unsaved changes</span>}
                </span>
                <h2 id={`${ids}-title`} className="wb-project__title">
                  <AutoTextArea
                    className="wb-project__name-input"
                    value={project.name}
                    onChange={(name) => onDetailsChange({ name: name.replace(/\s*\n\s*/g, ' ') })}
                    placeholder="Project name"
                    ariaLabel="Project name"
                    autoFocus={startsUnnamed.current}
                    minRows={1}
                    singleLine
                  />
                </h2>
              </div>
              <div className="wb-project__actions">
                <button
                  type="button"
                  className="wb-project__btn wb-project__btn--primary"
                  onClick={props.onSave}
                  disabled={busy !== null}
                  title={props.saveHint}
                >
                  <SaveIcon aria-hidden="true" />
                  Save project
                </button>
                <button type="button" className="wb-project__close" onClick={onClose} aria-label="Close the project page" title="Back to the code (Esc)">
                  <CloseIcon aria-hidden="true" />
                </button>
              </div>
            </div>

            <dl className="wb-project__facts">
              <div className="wb-project__fact">
                <dt>Version</dt>
                <dd className="wb-project__version">{project.version}</dd>
              </div>
              <div className="wb-project__fact">
                <dt>
                  <label htmlFor={`${ids}-board`}>Board</label>
                </dt>
                <dd>
                  <select
                    id={`${ids}-board`}
                    className="wb-project__field wb-project__select"
                    value={project.board}
                    onChange={(e) => onDetailsChange({ board: e.target.value })}
                  >
                    {KNOWN_BOARDS.map((board) => (
                      <option key={board} value={board}>
                        {board}
                      </option>
                    ))}
                  </select>
                </dd>
              </div>
              <div className="wb-project__fact wb-project__fact--grow">
                <dt>
                  <label htmlFor={`${ids}-file`}>Project file</label>
                </dt>
                <dd>
                  <CommitField
                    id={`${ids}-file`}
                    value={project.fileName}
                    validate={projectFileNameError}
                    onCommit={(fileName) => onDetailsChange({ fileName })}
                    className="wb-project__mono"
                    suffix={PROJECT_FILE_EXTENSION}
                    toDraft={projectFileBase}
                    fromDraft={projectFileNameFromBase}
                  />
                </dd>
              </div>
              <div className="wb-project__fact wb-project__fact--wide">
                <dt>
                  <label htmlFor={`${ids}-description`}>Description</label>
                </dt>
                <dd>
                  <AutoTextArea
                    id={`${ids}-description`}
                    value={project.description}
                    placeholder="What the project is about: the exercise, what to try on the board…"
                    onChange={(description) => onDetailsChange({ description })}
                    minRows={3}
                  />
                </dd>
              </div>
            </dl>
            {project.location !== '' && (
              <p className="wb-project__location">
                Location <span className="wb-project__mono">{project.location}</span>
              </p>
            )}
          </section>

          {props.available.length > 0 && (
            <AvailableFilesCard names={props.available} onAdd={props.onAddFiles} hasFiles={rows.length > 0} />
          )}

          {props.github}

          {busy !== null && (
            <p className="wb-project__busy" role="status">
              <span className="wb-project__spinner" aria-hidden="true" />
              {busy}
            </p>
          )}

          {project.warnings.length > 0 && (
            <section className="wb-project__card wb-project__warnings" aria-label="Warnings">
              <h3 className="wb-project__card-title">
                <AlertIcon className="wb-project__warn-icon" aria-hidden="true" />
                Opened with {project.warnings.length === 1 ? 'a warning' : `${project.warnings.length} warnings`}
              </h3>
              <ul>
                {project.warnings.map((warning) => (
                  <li key={warning}>{warning}</li>
                ))}
              </ul>
            </section>
          )}

          {missingInFolder.length > 0 && (
            <MissingFilesCard names={missingInFolder.map((row) => row.name)} busy={busy !== null} onFolderChosen={props.onFolderChosen} />
          )}

          <section className="wb-project__card" aria-labelledby={`${ids}-files`}>
            <div className="wb-project__files-head">
              <h3 id={`${ids}-files`} className="wb-project__card-title">
                Project Files ({rows.length})
              </h3>
              {unloadedCount > 0 && (
                <span className="wb-project__count-note">
                  {rows.length - unloadedCount} in Files, {unloadedCount} not loaded
                </span>
              )}
            </div>
            {rows.length === 0 ? (
              <p className="wb-project__empty">
                No files in the project yet.{' '}
                {props.available.length > 0 ? 'Add files from the list above, or make new ones' : 'Make files'} with New File or
                Upload File, and they join the project.
              </p>
            ) : (
              <table className="wb-project__table">
                <thead>
                  <tr>
                    <th scope="col">Name</th>
                    <th scope="col">Stored at</th>
                    <th scope="col">Description</th>
                    <th scope="col">
                      <span className="wb-project__sr">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <EntryRow key={row.name} {...props} row={row} rowBusy={busy !== null} />
                  ))}
                </tbody>
              </table>
            )}
          </section>

          <p className="wb-project__note">
            <InfoIcon className="wb-project__note-icon" aria-hidden="true" />
            <span>
              The project file lists the project's files, each with a description. A file without a URL is stored next to the
              project file; one with a URL is downloaded from it. Save project writes the project file and all its files into one
              folder. To open a project, use Open Project with its URL or path, or Upload File with the project file and its
              files selected together. Files you add, rename or delete in Files are added, renamed or removed here too.
            </span>
          </p>
          <div className="wb-project__footer">
            <button type="button" className="wb-project__link-btn" onClick={props.onCloseProject}>
              Close project
            </button>
            <span>Files keeps its files; they are no longer listed in a project.</span>
          </div>
        </div>
      </ScrollArea>
    </section>
  );
}

interface EntryRowProps extends Omit<ProjectPageProps, 'busy'> {
  row: ProjectEntryRow;
  rowBusy: boolean;
}

/** One file of the project: its name, URL and description, and what can be done with it. */
function EntryRow({ row, rowBusy: busy, onEntryChange, onOpenFile, onRemoveEntry, onReloadFromUrl, onLeaveProject }: EntryRowProps) {
  const loaded = row.status === 'loaded';
  return (
    <tr className={cx('wb-project__row', !loaded && 'is-unloaded')}>
      <td className="wb-project__cell-name">
        {loaded ? (
          <button type="button" className="wb-project__file" onClick={() => onOpenFile(row.name)} title={`Show ${row.name} in the editor`}>
            <FileIcon className="wb-project__file-icon" aria-hidden="true" />
            {row.name}
          </button>
        ) : (
          <span className="wb-project__file is-unloaded">
            <AlertIcon className="wb-project__warn-icon" aria-hidden="true" />
            {row.name}
          </span>
        )}
        {!loaded && <span className="wb-project__problem">{row.problem}</span>}
      </td>
      <td className="wb-project__cell-url">
        <CommitField
          value={row.url}
          validate={entryUrlError}
          onCommit={(url) => onEntryChange(row.name, { url: url.trim() })}
          placeholder="(project folder)"
          ariaLabel={`URL of ${row.name}`}
          icon={row.url !== '' ? <LinkIcon aria-hidden="true" /> : undefined}
          className="wb-project__url"
        />
      </td>
      <td className="wb-project__cell-description">
        <AutoTextArea
          value={row.description}
          placeholder="What this file is for"
          ariaLabel={`Description of ${row.name}`}
          onChange={(description) => onEntryChange(row.name, { description })}
          minRows={1}
        />
      </td>
      <td className="wb-project__cell-actions">
        {loaded && (
          <button type="button" className="wb-project__icon-btn" onClick={() => onOpenFile(row.name)} aria-label={`Show ${row.name}`} title="Show in the editor">
            <OpenInIcon aria-hidden="true" />
          </button>
        )}
        {row.url !== '' && (
          <button
            type="button"
            className="wb-project__icon-btn"
            onClick={() => onReloadFromUrl(row.name)}
            disabled={busy}
            aria-label={`Download ${row.name} again from its URL`}
            title={loaded ? 'Download again from its URL (replaces the file in Files)' : 'Try downloading it again'}
          >
            <RefreshIcon aria-hidden="true" />
          </button>
        )}
        {loaded && (
          <button
            type="button"
            className="wb-project__icon-btn"
            onClick={() => onLeaveProject(row.name)}
            aria-label={`Take ${row.name} out of the project`}
            title="Take out of the project (the file stays in Files)"
          >
            <MinusIcon aria-hidden="true" />
          </button>
        )}
        {!loaded && (
          <button
            type="button"
            className="wb-project__icon-btn wb-project__icon-btn--danger"
            onClick={() => onRemoveEntry(row.name)}
            aria-label={`Remove ${row.name} from the project`}
            title="Remove from the project"
          >
            <DeleteIcon aria-hidden="true" />
          </button>
        )}
      </td>
    </tr>
  );
}

interface AvailableFilesCardProps {
  names: readonly string[];
  /** The project has files already: the card then reads as "more files". */
  hasFiles: boolean;
  onAdd: (names: readonly string[]) => void;
}

/** Files in Files that are not in the project yet, each with Add, and Add all. */
function AvailableFilesCard({ names, hasFiles, onAdd }: AvailableFilesCardProps) {
  return (
    <section className="wb-project__card wb-project__available" aria-label="Files you can add">
      <div className="wb-project__files-head">
        <h3 className="wb-project__card-title">
          {hasFiles ? 'More files you can add' : 'Files you can add'} ({names.length})
        </h3>
        {names.length > 1 && (
          <button type="button" className="wb-project__btn" onClick={() => onAdd(names)}>
            <PlusIcon aria-hidden="true" />
            Add all
          </button>
        )}
      </div>
      <p className="wb-project__available-text">These files are in Files but not in the project. Add the ones that belong to it.</p>
      <ul className="wb-project__available-list">
        {names.map((name) => (
          <li key={name} className="wb-project__available-row">
            <FileIcon className="wb-project__file-icon" aria-hidden="true" />
            <span className="wb-project__available-name">{name}</span>
            <button type="button" className="wb-project__btn wb-project__btn--small" onClick={() => onAdd([name])} aria-label={`Add ${name} to the project`}>
              <PlusIcon aria-hidden="true" />
              Add to project
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

interface MissingFilesCardProps {
  names: readonly string[];
  busy: boolean;
  onFolderChosen: (files: File[]) => void;
}

/** Files stored next to the project file that were not chosen with it: pick the folder to load them. */
function MissingFilesCard({ names, busy, onFolderChosen }: MissingFilesCardProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  // `webkitdirectory` is not in React's typings; every current browser supports it.
  useEffect(() => {
    inputRef.current?.setAttribute('webkitdirectory', '');
  }, []);

  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) onFolderChosen([...e.target.files]);
    e.target.value = '';
  };

  return (
    <section className="wb-project__card wb-project__missing" aria-label="Files not found">
      <div className="wb-project__missing-text">
        <h3 className="wb-project__card-title">
          <FolderOpenIcon className="wb-project__missing-icon" aria-hidden="true" />
          {names.length === 1 ? '1 file was not found' : `${names.length} files were not found`}
        </h3>
        <p>
          {names.join(', ')} {names.length === 1 ? 'is' : 'are'} stored in the project folder. Choose that folder to open{' '}
          {names.length === 1 ? 'it' : 'them'}.
        </p>
      </div>
      <button type="button" className="wb-project__btn wb-project__btn--primary" disabled={busy} onClick={() => inputRef.current?.click()}>
        <FolderOpenIcon aria-hidden="true" />
        Choose project folder…
      </button>
      <input ref={inputRef} type="file" multiple className="wb-project__hidden-input" onChange={handleChange} tabIndex={-1} />
    </section>
  );
}

interface CommitFieldProps {
  value: string;
  /** Why a typed value cannot be used, or undefined. */
  validate: (value: string) => string | undefined;
  onCommit: (value: string) => void;
  id?: string;
  placeholder?: string;
  ariaLabel?: string;
  icon?: ReactNode;
  className?: string;
  /**
   * A fixed ending drawn after the field, outside what can be typed, e.g. `.hdlboard.json`
   * (the input-group pattern): it cannot be deleted, and screen readers hear it with the field.
   */
  suffix?: string;
  /** With `suffix`: the value as it is edited (without the suffix), and back. */
  toDraft?: (value: string) => string;
  fromDraft?: (draft: string) => string;
}

const same = (text: string) => text;

/**
 * A text field that takes effect when left or on Enter, and only with a valid value —
 * a project file name or URL half typed is never saved. Escape goes back to the value.
 */
function CommitField({
  value,
  validate,
  onCommit,
  id,
  placeholder,
  ariaLabel,
  icon,
  className,
  suffix,
  toDraft = same,
  fromDraft = same,
}: CommitFieldProps) {
  const [draft, setDraft] = useState(() => toDraft(value));
  useEffect(() => setDraft(toDraft(value)), [value, toDraft]);
  const next = fromDraft(draft);
  const error = next === value ? undefined : validate(next);
  const errorId = useId();
  const suffixId = useId();
  const inputRef = useRef<HTMLInputElement>(null);

  const commit = () => {
    if (next !== value && validate(next) === undefined) onCommit(next);
    // An extension typed into the name is shown dropped once the field is left.
    else if (next === value) setDraft(toDraft(value));
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      commit();
    } else if (e.key === 'Escape' && draft !== toDraft(value)) {
      e.preventDefault();
      setDraft(toDraft(value));
    }
  };

  const describedBy = [suffix ? suffixId : undefined, error ? errorId : undefined].filter(Boolean).join(' ') || undefined;

  return (
    <div className={cx('wb-project__commit', className)}>
      <span className={cx('wb-project__field-wrap', suffix && 'has-suffix', error !== undefined && 'is-invalid')}>
        {icon && <span className="wb-project__field-icon">{icon}</span>}
        <input
          ref={inputRef}
          id={id}
          className={cx('wb-project__field', icon !== undefined && 'has-icon')}
          value={draft}
          placeholder={placeholder}
          aria-label={ariaLabel}
          aria-invalid={error !== undefined}
          aria-describedby={describedBy}
          spellCheck={false}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={handleKeyDown}
        />
        {suffix && (
          // Part of the field to the eye and the pointer, never part of what is typed.
          <span
            id={suffixId}
            className="wb-project__field-suffix"
            title={`The project file always ends in ${suffix}`}
            onMouseDown={(e) => {
              e.preventDefault();
              const input = inputRef.current;
              input?.focus();
              input?.setSelectionRange(input.value.length, input.value.length);
            }}
          >
            <span className="wb-project__sr">ends in </span>
            {suffix}
          </span>
        )}
      </span>
      {error && (
        <span id={errorId} className="wb-project__field-error" role="alert">
          {error}
        </span>
      )}
    </div>
  );
}

interface AutoTextAreaProps {
  value: string;
  /** Replaces the field look, e.g. the project name drawn as the page heading. */
  className?: string;
  /** Enter does not start a new line: the text wraps, but stays one line. */
  singleLine?: boolean;
  onChange: (value: string) => void;
  minRows: number;
  id?: string;
  placeholder?: string;
  ariaLabel?: string;
  autoFocus?: boolean;
}

/** A textarea as tall as its text, so a description is read without scrolling inside it. */
function AutoTextArea({ value, onChange, minRows, id, placeholder, ariaLabel, className, singleLine, autoFocus }: AutoTextAreaProps) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => fitHeight(ref.current), [value]);
  // A change of width rewraps the text: the column narrowing, or the page first laid out.
  useEffect(() => {
    const area = ref.current;
    if (!area) return undefined;
    let width = area.clientWidth;
    const observer = new ResizeObserver(() => {
      if (area.clientWidth === width) return;
      width = area.clientWidth;
      fitHeight(area);
    });
    observer.observe(area);
    return () => observer.disconnect();
  }, []);

  return (
    <textarea
      ref={ref}
      id={id}
      className={className ?? 'wb-project__field wb-project__textarea'}
      value={value}
      spellCheck={singleLine ? false : undefined}
      onKeyDown={singleLine ? (e) => e.key === 'Enter' && e.preventDefault() : undefined}
      rows={minRows}
      placeholder={placeholder}
      aria-label={ariaLabel}
      autoFocus={autoFocus}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

/** Makes a textarea exactly as tall as its text (its border included). */
function fitHeight(area: HTMLTextAreaElement | null) {
  if (!area) return;
  area.style.height = 'auto';
  const border = area.offsetHeight - area.clientHeight;
  area.style.height = `${area.scrollHeight + border}px`;
}

export default ProjectPage;
