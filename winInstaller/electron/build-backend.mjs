// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * Bundles the compiled backend and its one runtime dependency (`ws`) into
 * a single `resources/backend.mjs`.
 *
 * Why bundle at all: `extraResources` lands *outside* `app.asar`, so a
 * backend shipped there resolves `import ... from 'ws'` relative to
 * `resources/`, walks up, and never sees the copy inside the archive.
 * Inlining `ws` removes the lookup entirely (plan finding F3).
 *
 * Why ESM and not CJS: the source is ESM and uses `import.meta.url` to
 * decide whether it was invoked as a script. A CJS build has no
 * `import.meta`, so that check — and with it `node dist/server.js` —
 * would have to be rewritten to suit the packaging step. The bundle is
 * outside the asar, where `import.meta.url` resolves normally anyway.
 */

import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..', '..');

await build({
  entryPoints: [join(repoRoot, 'server', 'dist', 'server.js')],
  outfile: join(here, 'resources', 'backend.mjs'),
  bundle: true,
  platform: 'node',
  target: 'node20',
  format: 'esm',
  // `ws` is CommonJS, so esbuild emits its modules behind a `require`
  // shim — and ESM has no `require` to give it. Without this banner the
  // bundle dies on the first `require('events')` at import time.
  banner: {
    js: [
      "import { createRequire as __createRequire } from 'node:module';",
      'const require = __createRequire(import.meta.url);',
    ].join('\n'),
  },
  external: [
    'electron',
    // `ws`'s optional native accelerators. It already require()s them in
    // a try/catch and works fine without them; listing them here stops
    // esbuild failing the build over modules that were never installed.
    'bufferutil',
    'utf-8-validate',
  ],
});

console.log('bundled -> resources/backend.mjs');
