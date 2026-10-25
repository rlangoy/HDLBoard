// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import type { AnchorHTMLAttributes } from 'react';

/**
 * A link that leaves the app: a new tab in the browser, the system browser in the
 * desktop app (which opens every `target="_blank"` link there). One place for it, so
 * every external link behaves the same.
 */
export function ExternalLink({ children, ...anchor }: Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'target' | 'rel'>) {
  return (
    <a {...anchor} target="_blank" rel="noopener noreferrer">
      {children}
    </a>
  );
}
