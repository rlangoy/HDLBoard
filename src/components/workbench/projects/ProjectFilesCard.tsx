// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import { useEffect, useRef, type ChangeEvent, type ReactNode } from 'react';
import { cx } from '../../board';
import { AlertIcon, DeleteIcon, FileIcon, FolderOpenIcon, MinusIcon, OpenInIcon, PlusIcon, RefreshIcon } from '../icons';
import { FoldingPageCard } from '../page/PageCard';
import { MISSING_LOCAL_FILE, type OpenProject, type ProjectEntryRow } from '../projectFile';
import { AutoTextArea } from './AutoTextArea';

/** What can be done with the project's files; the files themselves are added, renamed and deleted in Files. */
export interface ProjectFileActions {
  /** Files in Files that are not in the project (availableFiles): offered to be added. */
  available: readonly string[];
  onAddFiles: (names: readonly string[]) => void;
  /** Take a file out of the project; it stays in Files. */
  onLeaveProject: (name: string) => void;
  onEntryChange: (name: string, patch: { description?: string; url?: string }) => void;
  /** Show a file of the project in the editor. */
  onOpenFile: (name: string) => void;
  /** Take an entry that could not be loaded out of the project. */
  onRemoveEntry: (name: string) => void;
  /** Download a file again from its URL, replacing what Files has. */
  onReloadFromUrl: (name: string) => void;
  /** The files of a folder the student chose, to fill in entries that were not found. */
  onFolderChosen: (files: File[]) => void;
}

export interface ProjectFilesCardProps {
  project: OpenProject;
  /** The project's files as they are now (projectEntries). */
  rows: readonly ProjectEntryRow[];
  /** Work in progress, e.g. "Downloading counter.vhd…"; the buttons wait while it runs. */
  busy: string | null;
  actions: ProjectFileActions;
}

/** Active project › Project files: each file with its description, and what could join or is missing. */
export function ProjectFilesCard({ project, rows, busy, actions }: ProjectFilesCardProps) {
  const missing = rows.filter((row) => row.status === 'unloaded' && row.problem === MISSING_LOCAL_FILE);
  const unloaded = rows.filter((row) => row.status === 'unloaded').length;
  return (
    <FoldingPageCard title={`Project files (${rows.length})`} icon={<FileIcon />}>
      {busy !== null && (
        <p className="wb-active__busy" role="status">
          <span className="wb-active__spinner" aria-hidden="true" />
          {busy}
        </p>
      )}
      {project.warnings.length > 0 && <Warnings warnings={project.warnings} />}
      {missing.length > 0 && <MissingFiles names={missing.map((row) => row.name)} busy={busy !== null} onFolderChosen={actions.onFolderChosen} />}
      {actions.available.length > 0 && <AvailableFiles names={actions.available} hasFiles={rows.length > 0} onAdd={actions.onAddFiles} />}
      {unloaded > 0 && (
        <p className="wb-projects__muted">
          {rows.length - unloaded} in Files, {unloaded} not loaded
        </p>
      )}
      <FilesTable rows={rows} busy={busy !== null} actions={actions} />
    </FoldingPageCard>
  );
}

function FilesTable({ rows, busy, actions }: { rows: readonly ProjectEntryRow[]; busy: boolean; actions: ProjectFileActions }) {
  if (rows.length === 0) {
    return (
      <p className="wb-projects__muted">
        No files in the project yet. {actions.available.length > 0 ? 'Add files from the list above, or make new ones' : 'Make files'} with New File or Upload File,
        and they join the project.
      </p>
    );
  }
  return (
    <table className="wb-active__files">
      <thead>
        <tr>
          <th scope="col">File name</th>
          <th scope="col">Description</th>
          <th scope="col">
            <span className="wb-projects__sr">Actions</span>
          </th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <FileRow key={row.name} row={row} busy={busy} actions={actions} />
        ))}
      </tbody>
    </table>
  );
}

/** One file of the project: its name, its description, and what can be done with it. */
function FileRow({ row, busy, actions }: { row: ProjectEntryRow; busy: boolean; actions: ProjectFileActions }) {
  return (
    <tr className={cx(row.status !== 'loaded' && 'is-unloaded')}>
      <td className="wb-active__file-cell">
        <FileName row={row} onOpen={actions.onOpenFile} />
      </td>
      <td>
        <AutoTextArea
          value={row.description}
          placeholder="What this file is for"
          ariaLabel={`Description of ${row.name}`}
          onChange={(description) => actions.onEntryChange(row.name, { description })}
          minRows={1}
          pencilWhenEmpty
        />
      </td>
      <td className="wb-active__file-actions">
        <FileButtons row={row} busy={busy} actions={actions} />
      </td>
    </tr>
  );
}

/** A loaded file opens in the editor; one that could not be loaded says why. */
function FileName({ row, onOpen }: { row: ProjectEntryRow; onOpen: (name: string) => void }) {
  if (row.status === 'loaded') {
    return (
      <button type="button" className="wb-active__file" onClick={() => onOpen(row.name)} title={`Show ${row.name} in the editor`}>
        <FileIcon aria-hidden="true" />
        <span>{row.name}</span>
      </button>
    );
  }
  return (
    <>
      <span className="wb-active__file is-unloaded" title={row.name}>
        <AlertIcon aria-hidden="true" />
        <span>{row.name}</span>
      </span>
      <span className="wb-active__problem">{row.problem}</span>
    </>
  );
}

/**
 * What can be done with one file. Where it is stored (its URL) is kept in the project file
 * but not edited here; it can be downloaded from there again.
 */
function FileButtons({ row, busy, actions }: { row: ProjectEntryRow; busy: boolean; actions: ProjectFileActions }) {
  const loaded = row.status === 'loaded';
  return (
    <>
      {loaded && (
        <IconButton label={`Show ${row.name}`} title="Show in the editor" onClick={() => actions.onOpenFile(row.name)}>
          <OpenInIcon aria-hidden="true" />
        </IconButton>
      )}
      {row.url !== '' && (
        <IconButton
          label={`Download ${row.name} again from its URL`}
          title={loaded ? 'Download again from its URL (replaces the file in Files)' : 'Try downloading it again'}
          disabled={busy}
          onClick={() => actions.onReloadFromUrl(row.name)}
        >
          <RefreshIcon aria-hidden="true" />
        </IconButton>
      )}
      {loaded ? (
        <IconButton label={`Take ${row.name} out of the project`} title="Take out of the project (the file stays in Files)" onClick={() => actions.onLeaveProject(row.name)}>
          <MinusIcon aria-hidden="true" />
        </IconButton>
      ) : (
        <IconButton label={`Remove ${row.name} from the project`} title="Remove from the project" danger onClick={() => actions.onRemoveEntry(row.name)}>
          <DeleteIcon aria-hidden="true" />
        </IconButton>
      )}
    </>
  );
}

interface IconButtonProps {
  /** For screen readers: what the button does to which file. */
  label: string;
  /** The tooltip. */
  title: string;
  onClick: () => void;
  disabled?: boolean;
  /** Red on hover: it takes something away. */
  danger?: boolean;
  children: ReactNode;
}

function IconButton({ label, title, onClick, disabled, danger, children }: IconButtonProps) {
  return (
    <button type="button" className={cx('wb-projects__icon-btn', danger && 'is-danger')} onClick={onClick} disabled={disabled} aria-label={label} title={title}>
      {children}
    </button>
  );
}

function Warnings({ warnings }: { warnings: readonly string[] }) {
  return (
    <div className="wb-active__callout is-warn" role="note">
      <strong>
        <AlertIcon aria-hidden="true" />
        Opened with {warnings.length === 1 ? 'a warning' : `${warnings.length} warnings`}
      </strong>
      <ul>
        {warnings.map((warning) => (
          <li key={warning}>{warning}</li>
        ))}
      </ul>
    </div>
  );
}

/** Files in Files that are not in the project yet, each with Add, and Add all. */
function AvailableFiles({ names, hasFiles, onAdd }: { names: readonly string[]; hasFiles: boolean; onAdd: (names: readonly string[]) => void }) {
  return (
    <div className="wb-active__callout" role="group" aria-label="Files you can add">
      <div className="wb-active__callout-head">
        <strong>
          {hasFiles ? 'More files you can add' : 'Files you can add'} ({names.length})
        </strong>
        {names.length > 1 && (
          <button type="button" className="wb-projects__btn" onClick={() => onAdd(names)}>
            <PlusIcon aria-hidden="true" />
            Add all
          </button>
        )}
      </div>
      <span className="wb-projects__muted">These files are in Files but not in the project. Add the ones that belong to it.</span>
      <ul className="wb-active__available">
        {names.map((name) => (
          <li key={name}>
            <FileIcon aria-hidden="true" />
            <span>{name}</span>
            <button type="button" className="wb-projects__btn is-small" onClick={() => onAdd([name])} aria-label={`Add ${name} to the project`}>
              <PlusIcon aria-hidden="true" />
              Add to project
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Files stored next to the project file that were not chosen with it: pick the folder to load them. */
function MissingFiles({ names, busy, onFolderChosen }: { names: readonly string[]; busy: boolean; onFolderChosen: (files: File[]) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  // `webkitdirectory` is not in React's typings; every current browser supports it.
  useEffect(() => {
    inputRef.current?.setAttribute('webkitdirectory', '');
  }, []);
  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    if (event.target.files) onFolderChosen([...event.target.files]);
    event.target.value = '';
  };
  return (
    <div className="wb-active__callout" role="group" aria-label="Files not found">
      <div className="wb-active__callout-head">
        <strong>
          <FolderOpenIcon aria-hidden="true" />
          {names.length === 1 ? '1 file was not found' : `${names.length} files were not found`}
        </strong>
        <button type="button" className="wb-projects__btn is-primary" disabled={busy} onClick={() => inputRef.current?.click()}>
          <FolderOpenIcon aria-hidden="true" />
          Choose project folder…
        </button>
      </div>
      <span className="wb-projects__muted">
        {names.join(', ')} {names.length === 1 ? 'is' : 'are'} stored in the project folder. Choose that folder to open {names.length === 1 ? 'it' : 'them'}.
      </span>
      <input ref={inputRef} type="file" multiple hidden onChange={handleChange} tabIndex={-1} />
    </div>
  );
}
