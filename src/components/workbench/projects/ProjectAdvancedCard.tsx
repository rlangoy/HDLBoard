// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import { GearIcon } from '../icons';
import { FoldingPageCard } from '../page/PageCard';
import type { OpenProject } from '../projectFile';
import { sourceFolderOf } from '../projectLayout';

export interface ProjectAdvancedCardProps {
  project: OpenProject;
  /** Stop working in the project: Files keeps its files, in the Default project. */
  onCloseProject: () => void;
}

/** Active project › Advanced: what the project file is, as read-only facts, and Close project. */
export function ProjectAdvancedCard({ project, onCloseProject }: ProjectAdvancedCardProps) {
  return (
    <FoldingPageCard title="Advanced" icon={<GearIcon />}>
      <dl className="wb-active__facts">
        <dt>Format version</dt>
        <dd className="wb-projects__mono">{project.version}</dd>
        <dt>Project file</dt>
        <dd className="wb-projects__mono" title="Named after the project">{project.fileName}</dd>
        <dt>Source folder</dt>
        <dd className="wb-projects__mono">{sourceFolderOf(project)}</dd>
      </dl>
      <p className="wb-projects__muted">
        The project file lists the project's files, each with a description. On this computer the files are stored in the source folder next to the
        project file; a file with a URL is downloaded from it. Files you add, rename or delete in Files are added, renamed or removed here too.
      </p>
      <div className="wb-active__close">
        <button type="button" className="wb-projects__btn" onClick={onCloseProject}>
          Close project
        </button>
        <span className="wb-projects__muted">Files keeps its files, in the Default project.</span>
      </div>
    </FoldingPageCard>
  );
}
