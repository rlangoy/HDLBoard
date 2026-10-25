// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import type { BoardResource } from '../../boards/types';
import { ExternalLink } from './ExternalLink';

export interface BoardResourceLinksProps {
  resources: readonly BoardResource[];
  /** Text before the links, e.g. `Board resources:`. */
  lead?: string;
  className?: string;
}

/**
 * A board's design resources as one line of links: `Board definitions ↗ · I/O examples ↗`
 * (docs/board_io_v2_spec.md § 5.2). Nothing at all when the board has none. The labels
 * are plain text and the addresses `https://`, both checked by the board parser.
 */
export function BoardResourceLinks({ resources, lead, className }: BoardResourceLinksProps) {
  if (resources.length === 0) return null;
  return (
    <p className={className}>
      {lead && <>{lead} </>}
      {resources.map((resource, index) => (
        <span key={resource.label}>
          {index > 0 && <span aria-hidden="true"> · </span>}
          <ExternalLink href={resource.url}>
            {resource.label} <span aria-hidden="true">↗</span>
          </ExternalLink>
        </span>
      ))}
    </p>
  );
}
