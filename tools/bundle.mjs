// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * Inline a Vite build into ONE self-contained .html file.
 *
 *   npm run build
 *   node tools/bundle.mjs Examples/board_demo.html
 *
 * The result has no external references at all — no server, no assets
 * folder — so it can be opened straight from disk, mailed to a student,
 * or dropped into Canvas. See Examples/README.md.
 */
import { readFileSync, writeFileSync, readdirSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';

const out = process.argv[2] ?? 'Examples/demo.html';
const dist = process.argv[3] ?? 'dist';

const assets = readdirSync(join(dist, 'assets'));
const pick = (ext) => {
  const hit = assets.find((f) => f.endsWith(ext));
  if (!hit) throw new Error(`no ${ext} in ${dist}/assets — run \`npm run build\` first`);
  return readFileSync(join(dist, 'assets', hit), 'utf8');
};

let html = readFileSync(join(dist, 'index.html'), 'utf8');
html = html.replace(
  /<link[^>]*rel="stylesheet"[^>]*>/,
  () => `<style>\n${pick('.css')}\n</style>`,
);
html = html.replace(
  /<script[^>]*src="[^"]*"[^>]*><\/script>/,
  () => `<script type="module">\n${pick('.js')}\n</script>`,
);

if (/src="|href="\.?\/?assets/.test(html)) {
  throw new Error('bundle still references external assets');
}

mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, html);
console.log(`wrote ${out} (${(html.length / 1024).toFixed(0)} kB, self-contained)`);
