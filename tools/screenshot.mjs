// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * Visual check against DesignResources/*.png.
 *
 *   npm run build && npx vite preview --port 4173
 *   node tools/screenshot.mjs .pb-panel out.png
 *
 * Renders the first element matching `selector` at 2x and writes a PNG,
 * so a new component can be eyeballed next to its reference render
 * before it is called done. See Design_Description.md § Workflow.
 */
import { chromium } from 'playwright';

const selector = process.argv[2] ?? '.pb-panel';
const out = process.argv[3] ?? 'screenshot.png';
const url = process.env.PB_URL ?? 'http://localhost:4173/';

const browser = await chromium.launch();
const page = await browser.newPage({
  deviceScaleFactor: 2,
  viewport: { width: 1400, height: 900 },
});
await page.goto(url, { waitUntil: 'networkidle' });
await page.waitForTimeout(300);
await page.locator(selector).first().screenshot({ path: out });
await browser.close();
console.log(`wrote ${out} (${selector})`);
