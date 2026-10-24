// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import { useEffect, useId, useRef, useState, type ChangeEvent, type KeyboardEvent, type ReactNode } from 'react';
import { cx } from '../board';
import { CloseButton } from './CloseButton';
import {
  AlertIcon,
  DeleteIcon,
  FileIcon,
  FolderOpenIcon,
  InfoIcon,
  MinusIcon,
  OpenInIcon,
  PlusIcon,
  ProjectIcon,
  RefreshIcon,
  SaveIcon,
} from './icons';
import { DEFAULT_BOARD, findBoard } from '../../boards/boardCatalog';
import type { BoardCatalog } from '../../boards/types';
import { BOARD_TEXT, notInstalledNote, notInstalledOption } from './boardText';
import {
  MISSING_LOCAL_FILE,
  type OpenProject,
  type ProjectDetails,
  type ProjectEntryRow,
  projectNeedsName,
} from './projectFile';
import { GitHubStatus } from './GitHubStatus';
import { CloudUploadIcon, EditIcon } from './icons';
import { ScrollArea } from './ScrollArea';
import { pendingLayoutChange, sourceFolderOf } from './projectLayout';
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
  /** The boards available here: the Board list (docs/board_io_config_spec.md § 3.4). */
  boards: BoardCatalog;
  /** Another board was chosen: asks, and renames the files, as Settings › Board does. */
  onBoardChange: (id: string) => void;
  /** Loading, saving or compiling: the board cannot change just now. */
  boardLocked: boolean;
  /** Choose a board…, for a project on a board not installed here: opens Settings. */
  onChooseBoard: () => void;
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
  /** Folders the last save emptied (docs/impl_project_structure.md D13): offered for removal, never removed unasked. */
  emptiedFolders: readonly string[];
  onRemoveFolder: (folder: string) => void;
  /** Stop working in a project: Files keeps its files. */
  onCloseProject: () => void;
  /** Back to the code. */
  onClose: () => void;
  /**
   * The untouched Default project (isUntouchedDefault): Save to GitHub, with "Not on GitHub yet"
   * beside it, takes the place of Save project, and there is no GitHub card.
   */
  gitHubSave?: () => void;
  /** The name is still the Default's: its field is shown empty and highlighted, asking for one, and Save to GitHub waits for it. */
  askName?: boolean;
  /** The GitHub card (ProjectGitHubCard), shown under the project's details. */
  github?: ReactNode;
  /** Files in Files that are not in the project (availableFiles): offered to be added. */
  available: readonly string[];
  onAddFiles: (names: readonly string[]) => void;
  /** Take a file out of the project; it stays in Files. */
  onLeaveProject: (name: string) => void;
}

interface BoardSelectProps {
  id: string;
  boards: BoardCatalog;
  boardId: string;
  locked: boolean;
  onChange: (id: string) => void;
  onChooseBoard: () => void;
}

/**
 * The project's board, from the boards installed here, each described in its tooltip.
 * A board that is not installed stays selected, with a note: the id is kept when the
 * project is saved, until the student chooses another board.
 */
function BoardSelect({ id, boards, boardId, locked, onChange, onChooseBoard }: BoardSelectProps) {
  const installed = findBoard(boards, boardId).installed;
  return (
    <>
      <select id={id} className="wb-project__field wb-project__select" value={boardId} disabled={locked} onChange={(e) => onChange(e.target.value)}>
        {boards.boards.map((board) => (
          <option key={board.id} value={board.id} title={board.description}>
            {board.name}
          </option>
        ))}
        {!installed && <option value={boardId}>{notInstalledOption(boardId, DEFAULT_BOARD)}</option>}
      </select>
      {!installed && (
        <span className="wb-project__board-note" role="note">
          {notInstalledNote(boardId, DEFAULT_BOARD)}{' '}
          <button type="button" className="wb-project__text-btn" onClick={onChooseBoard}>
            {BOARD_TEXT.chooseBoard}
          </button>
        </span>
      )}
    </>
  );
}

/**
 * The project settings: shown in place of the code while open (the editor stays mounted
 * underneath, like the Examples pane). Everything the project file holds can be edited
 * here — its name, board and description, its own file name, and each file's
 * description and URL. The files themselves are added, renamed and deleted in Files.
 */
export function ProjectPage(props: ProjectPageProps) {
  const { project, rows, unsaved, busy, onDetailsChange, onClose } = props;
  const missingInFolder = rows.filter((row) => row.status === 'unloaded' && row.problem === MISSING_LOCAL_FILE);
  const unloadedCount = rows.filter((row) => row.status === 'unloaded').length;
  const ids = useId();
  const layoutChange = pendingLayoutChange(project);
  // Keyboard focus starts on the page, so Escape closes it and Tab walks its fields.
  const sectionRef = useRef<HTMLElement>(null);
  // A new project without a name starts in its name field instead (AutoTextArea autoFocus).
  const startsUnnamed = useRef(project.name === '');
  // Save to GitHub was clicked while the name is still asked for: the hint turns into an error.
  const [nameMissing, setNameMissing] = useState(false);
  // The name is asked for while it is empty, and — on the first save to GitHub — while it is still the Default's.
  const asking = props.askName === true || projectNeedsName(project);
  useEffect(() => {
    if (!asking) setNameMissing(false);
  }, [asking]);
  const focusName = () => document.getElementById(`${ids}-title`)?.querySelector('textarea')?.focus();
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
                  Project name
                  {unsaved && <span className="wb-project__unsaved">Unsaved changes</span>}
                </span>
                <div className={cx('wb-project__name-row', asking && 'is-asking', asking && nameMissing && 'is-error')}>
                  {asking && <EditIcon className="wb-project__name-icon" aria-hidden="true" />}
                  <h2 id={`${ids}-title`} className="wb-project__title">
                    <AutoTextArea
                      className={cx('wb-project__name-input', asking && 'is-asking')}
                      value={asking ? '' : project.name}
                      onChange={(name) => onDetailsChange({ name: name.replace(/\s*\n\s*/g, ' ') })}
                      placeholder={asking ? 'Enter project name' : 'Project name'}
                      ariaLabel="Project name"
                      autoFocus={startsUnnamed.current || props.askName}
                      minRows={1}
                      singleLine
                    />
                  </h2>
                </div>
                {asking && (
                  <span className={cx('wb-project__name-hint', nameMissing && 'is-error')} role="status">
                    Project name is required
                  </span>
                )}
                {props.gitHubSave && (
                  <div className="wb-project__github-state">
                    <GitHubStatus state="not-on-github" />
                  </div>
                )}
              </div>
              <div className="wb-project__actions">
                {props.gitHubSave ? (
                  <button type="button" className="wb-project__btn wb-project__btn--primary" aria-disabled={asking || undefined}
                      onClick={() => {
                        if (!asking) return props.gitHubSave?.();
                        setNameMissing(true);
                        focusName();
                      }}
                      disabled={busy !== null}>
                    <CloudUploadIcon aria-hidden="true" />
                    Save to GitHub
                  </button>
                ) : (
                  <button
                    type="button"
                    className="wb-project__btn wb-project__btn--primary"
                    aria-disabled={asking || undefined}
                    onClick={() => {
                      if (!asking) return props.onSave();
                      setNameMissing(true);
                      focusName();
                    }}
                    disabled={busy !== null}
                    title={props.saveHint}
                  >
                    <SaveIcon aria-hidden="true" />
                    Save project
                  </button>
                )}
                <CloseButton label="Close the project settings" hint="Back to the code (Esc)" onClick={onClose} />
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
                  <BoardSelect
                    id={`${ids}-board`}
                    boards={props.boards}
                    boardId={project.board}
                    locked={props.boardLocked}
                    onChange={props.onBoardChange}
                    onChooseBoard={props.onChooseBoard}
                  />
                </dd>
              </div>
              <div className="wb-project__fact wb-project__fact--grow">
                <dt>
                  <span>Project file</span>
                </dt>
                <dd>
                  <span id={`${ids}-file`} className="wb-project__mono wb-project__file-name-static" title="Named after the project">
                    {project.fileName}
                  </span>
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
                    pencilWhenEmpty
                  />
                </dd>
              </div>
            </dl>
            {project.location !== '' && (
              <p className="wb-project__location">
                Location <span className="wb-project__mono">{project.location}</span>
              </p>
            )}
            <LayoutHint project={project} change={layoutChange} />
          </section>

          {props.emptiedFolders.map((folder) => (
            <p key={folder} className="wb-project__card wb-project__emptied" role="status">
              <span>
                The old folder <span className="wb-project__mono">{folder}</span> is empty.
              </span>
              <button type="button" className="wb-project__btn" onClick={() => props.onRemoveFolder(folder)} disabled={busy !== null}>
                <DeleteIcon aria-hidden="true" />
                Remove folder
              </button>
            </p>
          ))}

          {props.available.length > 0 && (
            <AvailableFilesCard names={props.available} onAdd={props.onAddFiles} hasFiles={rows.length > 0} />
          )}

          {/* The GitHub card's Save to GitHub waits for a name too: a click on it asks for the name. */}
          <div
            onClickCapture={(event) => {
              if (!asking || !(event.target as HTMLElement).closest('.wb-github__btn--primary')) return;
              event.preventDefault();
              event.stopPropagation();
              setNameMissing(true);
              focusName();
            }}
          >
            {props.github}
          </div>

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
              The project file lists the project's files, each with a description. On this computer the files are stored in
              the project folder next to the project file, in its source folder ({sourceFolderOf(project)}); a file with a URL
              is downloaded from it. Save project writes the project file and all its files; Download All gives the same as a
              .zip. To open a project, use Open Project with its URL or path, or Upload File with the project file and its
              files selected together. Files you add, rename or delete in Files are added, renamed or removed here too.
            </span>
          </p>
          <div className="wb-project__footer">
            <button type="button" className="wb-project__link-btn" onClick={props.onCloseProject}>
              Close project
            </button>
            <span>Files keeps its files, in the Default project.</span>
          </div>
        </div>
      </ScrollArea>
    </section>
  );
}

/**
 * What the next save does to the files on disk (docs/impl_project_structure.md § 7): copy a
 * flat project into its source folder, or move the files to a new one. Nothing is said
 * about the flat files themselves: they are left alone (D9).
 */
function LayoutHint({ project, change }: { project: OpenProject; change: ReturnType<typeof pendingLayoutChange> }) {
  const target = sourceFolderOf(project);
  let text: ReactNode = null;
  if (change.renamedOutsideFrom !== undefined) {
    text = (
      <>
        The project file was renamed: its files move from <span className="wb-project__mono">{change.renamedOutsideFrom}</span> to{' '}
        <span className="wb-project__mono">{target}</span> when you save.
      </>
    );
  } else if (change.move) {
    text = (
      <>
        Files move to <span className="wb-project__mono">{target}</span> when you save.
      </>
    );
  } else if (change.copy) {
    text = (
      <>
        Files are copied to <span className="wb-project__mono">{target}</span> when you save.
      </>
    );
  }
  if (text === null) return null;
  return (
    <p className="wb-project__layout-hint" role="status">
      <InfoIcon className="wb-project__note-icon" aria-hidden="true" />
      <span>{text}</span>
    </p>
  );
}

interface EntryRowProps extends Omit<ProjectPageProps, 'busy'> {
  row: ProjectEntryRow;
  rowBusy: boolean;
}

/**
 * One file of the project: its name and description, and what can be done with it. Where
 * it is stored (its URL) is kept in the project file but not edited here: an advanced
 * setting for later.
 */
function EntryRow({ row, rowBusy: busy, onEntryChange, onOpenFile, onRemoveEntry, onReloadFromUrl, onLeaveProject }: EntryRowProps) {
  const loaded = row.status === 'loaded';
  return (
    <tr className={cx('wb-project__row', !loaded && 'is-unloaded')}>
      <td className="wb-project__cell-name">
        {loaded ? (
          <button type="button" className="wb-project__file" onClick={() => onOpenFile(row.name)} title={`Show ${row.name} in the editor`}>
            <FileIcon className="wb-project__file-icon" aria-hidden="true" />
            <span className="wb-project__file-name">{row.name}</span>
          </button>
        ) : (
          <span className="wb-project__file is-unloaded">
            <AlertIcon className="wb-project__warn-icon" aria-hidden="true" />
            <span className="wb-project__file-name" title={row.name}>
              {row.name}
            </span>
          </span>
        )}
        {!loaded && <span className="wb-project__problem">{row.problem}</span>}
      </td>
      <td className="wb-project__cell-description">
        <AutoTextArea
          value={row.description}
          placeholder="What this file is for"
          ariaLabel={`Description of ${row.name}`}
          onChange={(description) => onEntryChange(row.name, { description })}
          minRows={1}
          pencilWhenEmpty
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
  /** A small pencil inside the field while it is empty. */
  pencilWhenEmpty?: boolean;
}

/** A textarea as tall as its text, so a description is read without scrolling inside it. */
function AutoTextArea({ value, onChange, minRows, id, placeholder, ariaLabel, className, singleLine, autoFocus, pencilWhenEmpty }: AutoTextAreaProps) {
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

  const pencil = pencilWhenEmpty === true && value === '';
  const area = (
    <textarea
      ref={ref}
      id={id}
      className={cx(className ?? 'wb-project__field wb-project__textarea', pencil && 'has-pencil')}
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
  if (pencilWhenEmpty !== true) return area;
  return (
    <span className="wb-project__pencil-wrap">
      {area}
      {pencil && <EditIcon className="wb-project__pencil" aria-hidden="true" />}
    </span>
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
