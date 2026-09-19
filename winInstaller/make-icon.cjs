// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * Renders src/Images/vhdl_usn_logo.svg into electron/build/icon.ico.
 *
 * Run with Electron, not Node:
 *   winInstaller/electron/node_modules/.bin/electron winInstaller/make-icon.js
 *
 * Electron is already a build dependency here and is a full Chromium, so
 * it rasterises the SVG with no extra toolchain and no browser download —
 * and with the same renderer the app itself uses, so the icon cannot
 * drift from the logo the Workbench shows in its header.
 *
 * The .ico is written by hand because it is a trivial container: a header,
 * one directory entry per size, then the PNG payloads verbatim. Windows
 * has accepted PNG-compressed .ico entries since Vista.
 */

const { app, BrowserWindow, nativeImage } = require('electron');
const { readFileSync, writeFileSync, mkdirSync } = require('node:fs');
const { dirname, join, resolve } = require('node:path');

const here = __dirname;
const repoRoot = resolve(here, '..');
const svgPath = join(repoRoot, 'src', 'Images', 'vhdl_usn_logo.svg');
const outPath = join(here, 'electron', 'build', 'icon.ico');

// Windows picks the nearest size for each context: 16 in title bars, 32 in
// the taskbar, 48 in Explorer lists, 256 for the large-icon view and the
// installer. Supplying them all means none of them is a scaled blur.
const SIZES = [16, 24, 32, 48, 64, 128, 256];
const MASTER = 1024;

function buildIco(pngs) {
  const HEADER = 6;
  const ENTRY = 16;

  const header = Buffer.alloc(HEADER);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // 1 = icon (2 would be cursor)
  header.writeUInt16LE(pngs.length, 4);

  let offset = HEADER + ENTRY * pngs.length;
  const entries = [];
  for (const { size, data } of pngs) {
    const e = Buffer.alloc(ENTRY);
    // 0 encodes 256 — the field is a single byte, so 256 does not fit.
    e.writeUInt8(size >= 256 ? 0 : size, 0); // width
    e.writeUInt8(size >= 256 ? 0 : size, 1); // height
    e.writeUInt8(0, 2); // palette size (0 = truecolour)
    e.writeUInt8(0, 3); // reserved
    e.writeUInt16LE(1, 4); // colour planes
    e.writeUInt16LE(32, 6); // bits per pixel
    e.writeUInt32LE(data.length, 8);
    e.writeUInt32LE(offset, 12);
    entries.push(e);
    offset += data.length;
  }

  return Buffer.concat([header, ...entries, ...pngs.map((p) => p.data)]);
}

app.disableHardwareAcceleration();

app.whenReady().then(async () => {
  const svg = readFileSync(svgPath, 'utf8').replace(/<\?xml[^?]*\?>/, '');

  const win = new BrowserWindow({
    width: MASTER,
    height: MASTER,
    show: false,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    webPreferences: { offscreen: true },
  });

  const html = `<!doctype html><html><body style="margin:0;background:transparent">
    <div style="width:${MASTER}px;height:${MASTER}px">${svg}</div>
    <style>svg{width:${MASTER}px;height:${MASTER}px;display:block}</style>
  </body></html>`;

  await win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));
  // Offscreen rendering paints a frame shortly after load; capturing in the
  // same tick yields a blank bitmap.
  await new Promise((r) => setTimeout(r, 600));

  const master = await win.webContents.capturePage();
  if (master.isEmpty()) {
    console.error('capturePage returned an empty image');
    app.exit(1);
    return;
  }

  // One high-quality master downsampled per size, rather than re-rendering
  // the SVG small: at 16 px the hairline circuit traces alias badly when
  // rasterised directly, but survive a filtered downscale legibly.
  const pngs = SIZES.map((size) => ({
    size,
    data: master.resize({ width: size, height: size, quality: 'best' }).toPNG(),
  }));

  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, buildIco(pngs));

  console.log(`icon.ico written (${SIZES.join(', ')} px) -> ${outPath}`);
  app.exit(0);
});
