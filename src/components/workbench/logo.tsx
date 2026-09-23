// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import logoSvg from '../../Images/hdlboard_logo.svg?raw';

/**
 * `?raw` pulls the SVG in as a plain string at build time — not a
 * separate asset file — so it ends up inlined in the JS bundle rather
 * than emitted to `dist/assets/`. That matters here specifically:
 * `tools/bundle.mjs` (`npm run demo`) asserts the built page references
 * no external asset paths at all, and a normal `import logo from
 * '...svg'` (a URL import) would fail that check. A data URI, computed
 * once here and reused for both the header logo (`Header.tsx`) and the
 * favicon (`main.tsx`), keeps the single source of truth in the actual
 * file rather than a second hand-transcribed copy.
 */
export const LOGO_DATA_URI = `data:image/svg+xml;base64,${btoa(logoSvg)}`;

/**
 * The header's two-tone rendering of the same mark: a solid white
 * chip-and-pins silhouette with the "H" cutout filled in black, rather
 * than left as a hole showing the dark header band through it. The two
 * subpaths are the same path data as `hdlboard_logo.svg`, split apart —
 * there the "H" is a real hole (opposite winding direction, one
 * compound path), which only reads correctly against a light backdrop.
 */
export function HeaderLogo() {
  return (
    <svg viewBox="0 0 32 32" className="wb-header__logo" aria-hidden="true">
      <path
        fill="#ffffff"
        d="M8 4h16a4 4 0 0 1 4 4v16a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4V8a4 4 0 0 1 4-4zM8 5V1a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v4zM20 5V1a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v4zM12 27v4a1 1 0 0 1-1 1H9a1 1 0 0 1-1-1v-4zM24 27v4a1 1 0 0 1-1 1h-2a1 1 0 0 1-1-1v-4zM5 12H1a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1h4zM5 24H1a1 1 0 0 1-1-1v-2a1 1 0 0 1 1-1h4zM27 8h4a1 1 0 0 1 1 1v2a1 1 0 0 1-1 1h-4zM27 20h4a1 1 0 0 1 1 1v2a1 1 0 0 1-1 1h-4z"
      />
      <path fill="#000000" d="M8 8v16h4v-6h8v6h4V8h-4v6h-8V8z" />
    </svg>
  );
}
