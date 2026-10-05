// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import { cx } from '../board';
import { problemCountText } from './diagnosticText';
import type { FileRow, ProblemCounts } from './fileRows';
import { RoleIcon } from './RoleIcon';
import './FileRowLabel.css';

/**
 * A file as the Files panel and the file menu draw it (docs/cleanup_file_tabs.md
 * § 5.5): its role icon, its name and its problem mark.
 */
export function FileRowLabel({ row }: { row: FileRow }) {
  return (
    <span className="wb-filerow">
      <RoleIcon role={row.role} />
      <span className="wb-filerow__name">{row.name}</span>
      <ProblemMark problems={row.problems} />
    </span>
  );
}

/** A red dot for errors, an amber ring for warnings only; the counts in its tooltip and for screen readers. */
export function ProblemMark({ problems }: { problems: ProblemCounts }) {
  const text = problemCountText(problems);
  if (text === '') return null;
  return (
    <span className={cx('wb-problemmark', problems.errors > 0 ? 'is-error' : 'is-warning')} title={text}>
      <span className="wb-sr-only">, {text}</span>
    </span>
  );
}
