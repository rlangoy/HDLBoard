// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import logoSvg from '../../Images/vhdl_usn_logo.svg?raw';

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
