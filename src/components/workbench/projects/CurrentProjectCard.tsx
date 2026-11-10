// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import { useCallback, useState } from 'react';
import { CloudUploadIcon, GitHubIcon, InfoIcon, LaptopIcon, MoreIcon, OpenInIcon, ProjectIcon, SaveIcon } from '../icons';
import { ProjectMenu, type MenuAction } from '../ProjectMenu';
import type { OpenProjectInfo, SaveDestination } from './openProject';
import { UnsavedChip } from './StateChip';

export interface CurrentProjectCardProps {
  project: OpenProjectInfo;
  /** Saving or opening is under way: Save waits. */
  busy: boolean;
  /** Saves where the project saves to (project.destination). */
  onSave: () => void;
  /** To the Active project section; absent while it is shown. */
  onShowDetails?: () => void;
  /** Back to the editor. */
  onOpenInWorkspace: () => void;
  /** What its ⋮ menu offers: New project, and the other ways to another project. */
  menu: readonly MenuAction[];
}

const DESTINATION_LABEL: Record<SaveDestination, string> = { local: 'this computer', github: 'GitHub' };

/**
 * The project open in the workspace, on top of every section (issue #44): its name,
 * whether it has unsaved changes, where Save writes it, and the way back to the editor.
 */
export function CurrentProjectCard({ project, busy, onSave, onShowDetails, onOpenInWorkspace, menu }: CurrentProjectCardProps) {
  const canSave = !busy && (project.unsaved || !savedAtDestinationYet(project));
  return (
    <section className="wb-projects-current" aria-label="Active project">
      <span className="wb-projects-current__tile" aria-hidden="true">
        <ProjectIcon />
      </span>
      <div className="wb-projects-current__text">
        <span className="wb-projects__eyebrow">Active project</span>
        <span className="wb-projects-current__name">
          <strong>{project.name || 'Untitled project'}</strong>
          {project.unsaved && <UnsavedChip />}
        </span>
        <SaveDestinationLine project={project} />
      </div>
      <div className="wb-projects-current__actions">
        {onShowDetails && (
          <button type="button" className="wb-projects__btn" onClick={onShowDetails}>
            <InfoIcon aria-hidden="true" />
            Project details
          </button>
        )}
        <button type="button" className="wb-projects__btn" onClick={onSave} disabled={!canSave}>
          {project.destination === 'github' ? <CloudUploadIcon aria-hidden="true" /> : <SaveIcon aria-hidden="true" />}
          Save to {DESTINATION_LABEL[project.destination]}
        </button>
        <button type="button" className="wb-projects__btn is-primary" onClick={onOpenInWorkspace} title="Back to the editor (Esc)">
          <OpenInIcon aria-hidden="true" />
          Open in workspace
        </button>
        <CardMenu actions={menu} />
      </div>
    </section>
  );
}

function CardMenu({ actions }: { actions: readonly MenuAction[] }) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const close = useCallback(() => setAnchor(null), []);
  return (
    <>
      <button type="button" className="wb-projects__icon-btn is-boxed" onClick={(event) => setAnchor(event.currentTarget)} aria-haspopup="menu" aria-label="More: new project, open another">
        <MoreIcon aria-hidden="true" />
      </button>
      {anchor && <ProjectMenu anchor={anchor} actions={actions} onClose={close} />}
    </>
  );
}

/** A project not saved where it saves to can be saved even with no changes: the Default project, say. */
function savedAtDestinationYet(project: OpenProjectInfo): boolean {
  return project.destination === 'github' ? project.syncState !== 'not-on-github' : project.onComputer;
}

/** "Saves to this computer: C:\…\Counter.hdlboard.json", so Save never surprises. */
function SaveDestinationLine({ project }: { project: OpenProjectInfo }) {
  const github = project.destination === 'github';
  return (
    <span className="wb-projects-current__destination">
      {github ? <GitHubIcon aria-hidden="true" /> : <LaptopIcon aria-hidden="true" />}
      <span>
        Saves to {DESTINATION_LABEL[project.destination]}
        {': '}
        <DestinationPlace project={project} />
      </span>
    </span>
  );
}

/** The project file's path when there is one; otherwise, in words, where it will go. */
function DestinationPlace({ project }: { project: OpenProjectInfo }) {
  if (project.destination === 'github') return <>a secret gist on your account</>;
  if (!project.onComputer) return <>not saved here yet</>;
  return (
    <span className="wb-projects__mono" title={project.location}>
      {project.location}
    </span>
  );
}
