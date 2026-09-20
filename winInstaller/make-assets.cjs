// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * Renders the installer's branding from src/Images/vhdl_usn_logo.svg:
 *
 *   electron/build/icon.ico            app + installer icon, 7 sizes
 *   electron/build/installerSidebar.bmp  NSIS welcome/finish panel, 164x314
 *
 * Run with Electron, not Node:
 *   winInstaller/electron/node_modules/.bin/electron winInstaller/make-assets.cjs
 *
 * Electron is already a build dependency here and is a full Chromium, so
 * it rasterises the SVG with no extra toolchain and no browser download —
 * and with the same renderer the app itself uses, so the branding cannot
 * drift from the logo HDLBoard shows in its header.
 *
 * Both containers are written by hand because both are trivial, and the
 * alternative is an image-conversion dependency for two files:
 *   - .ico  = header, one directory entry per size, then PNGs verbatim
 *             (Windows has accepted PNG-compressed entries since Vista).
 *   - .bmp  = 54-byte header then bottom-up 24-bit BGR rows. NSIS will not
 *             take a PNG here, which is why this cannot just reuse the
 *             screenshot buffer.
 */

const { app, BrowserWindow } = require('electron');
const { readFileSync, writeFileSync, mkdirSync, rmSync, mkdtempSync } = require('node:fs');
const { join, resolve } = require('node:path');
const { tmpdir } = require('node:os');
const { pathToFileURL } = require('node:url');

const here = __dirname;
const repoRoot = resolve(here, '..');
const svgPath = join(repoRoot, 'src', 'Images', 'vhdl_usn_logo.svg');
const buildDir = join(here, 'electron', 'build');
const icoPath = join(buildDir, 'icon.ico');
const bmpPath = join(buildDir, 'installerSidebar.bmp');

// Windows picks the nearest size for each context: 16 in title bars, 32 in
// the taskbar, 48 in Explorer lists, 256 for the large-icon view and the
// installer. Supplying them all means none of them is a scaled blur.
const SIZES = [16, 24, 32, 48, 64, 128, 256];
const MASTER = 1024;

// Fixed by NSIS's MUI welcome/finish page bitmap slot.
const SIDEBAR_W = 164;
const SIDEBAR_H = 314;
// Rendered at 3x and downsampled, so the text and the logo's hairline
// circuit traces stay smooth at this small a size.
const SIDEBAR_SCALE = 3;

const BRAND_DARK = '#07506A'; // the logo's own circle colour
const BRAND_LIGHT = '#0A6B8C';

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

/**
 * 24-bit uncompressed BMP from Electron's BGRA bitmap buffer. Rows are
 * stored bottom-up and padded to a 4-byte boundary — both are BMP format
 * requirements, not choices.
 */
function buildBmp(width, height, bgra) {
  const rowRaw = width * 3;
  const pad = (4 - (rowRaw % 4)) % 4;
  const rowSize = rowRaw + pad;
  const pixelBytes = rowSize * height;
  const buf = Buffer.alloc(54 + pixelBytes);

  buf.write('BM', 0);
  buf.writeUInt32LE(54 + pixelBytes, 2);
  buf.writeUInt32LE(54, 10); // pixel data offset
  buf.writeUInt32LE(40, 14); // DIB header size
  buf.writeInt32LE(width, 18);
  buf.writeInt32LE(height, 22); // positive = bottom-up
  buf.writeUInt16LE(1, 26); // planes
  buf.writeUInt16LE(24, 28); // bits per pixel
  buf.writeUInt32LE(0, 30); // BI_RGB, no compression
  buf.writeUInt32LE(pixelBytes, 34);
  buf.writeInt32LE(2835, 38); // ~72 DPI
  buf.writeInt32LE(2835, 42);

  let o = 54;
  for (let y = height - 1; y >= 0; y--) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4; // Electron gives BGRA
      buf[o++] = bgra[i];
      buf[o++] = bgra[i + 1];
      buf[o++] = bgra[i + 2];
    }
    o += pad; // padding bytes stay zero
  }
  return buf;
}

// A real file rather than a data: URL — the inlined SVG plus styling is
// large enough that Chromium refuses the data: navigation with ERR_FAILED.
// Loaded via pathToFileURL, not loadFile(): the latter left the Windows
// path's backslashes unconverted (`file:///C:\Users\...`), which is a
// malformed URL and fails the same way.
const scratch = mkdtempSync(join(tmpdir(), 'hdl-board-assets-'));

async function render(win, html, settleMs = 600) {
  const page = join(scratch, `page-${Date.now()}.html`);
  writeFileSync(page, html, 'utf8');
  await win.loadURL(pathToFileURL(page).href);
  // Offscreen rendering paints a frame shortly after load; capturing in
  // the same tick yields a blank bitmap.
  await new Promise((r) => setTimeout(r, settleMs));
  const img = await win.webContents.capturePage();
  if (img.isEmpty()) throw new Error('capturePage returned an empty image');
  return img;
}

app.disableHardwareAcceleration();

// Without this, destroying the icon window leaves zero windows open,
// which fires Electron's default `window-all-closed` handler and begins
// quitting the app — aborting the sidebar's navigation with a bare
// ERR_FAILED. This script controls its own exit.
app.on('window-all-closed', () => {});

app.whenReady().then(async () => {
  const svg = readFileSync(svgPath, 'utf8').replace(/<\?xml[^?]*\?>/, '');
  mkdirSync(buildDir, { recursive: true });

  // --- icon.ico --------------------------------------------------------
  const iconWin = new BrowserWindow({
    width: MASTER,
    height: MASTER,
    show: false,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    webPreferences: { offscreen: true },
  });

  const master = await render(
    iconWin,
    `<!doctype html><html><body style="margin:0;background:transparent">
       <div style="width:${MASTER}px;height:${MASTER}px">${svg}</div>
       <style>svg{width:${MASTER}px;height:${MASTER}px;display:block}</style>
     </body></html>`,
  );

  // One high-quality master downsampled per size, rather than re-rendering
  // the SVG small: at 16 px the hairline circuit traces alias badly when
  // rasterised directly, but survive a filtered downscale legibly.
  const pngs = SIZES.map((size) => ({
    size,
    data: master.resize({ width: size, height: size, quality: 'best' }).toPNG(),
  }));
  writeFileSync(icoPath, buildIco(pngs));
  iconWin.destroy();
  console.log(`icon.ico             (${SIZES.join(', ')} px)`);

  // --- installerSidebar.bmp --------------------------------------------
  const w = SIDEBAR_W * SIDEBAR_SCALE;
  const h = SIDEBAR_H * SIDEBAR_SCALE;
  const sidebarWin = new BrowserWindow({
    width: w,
    height: h,
    show: false,
    frame: false,
    webPreferences: { offscreen: true },
  });

  // The logo's own disc is BRAND_DARK, so it would vanish against a flat
  // brand background — the white ring behind it is what keeps the emblem
  // readable rather than decorative.
  const sidebarHtml = `<!doctype html><html><body style="margin:0">
    <div style="
      width:${w}px;height:${h}px;
      background:linear-gradient(160deg, ${BRAND_LIGHT} 0%, ${BRAND_DARK} 100%);
      display:flex;flex-direction:column;align-items:center;justify-content:center;
      font-family:'Segoe UI',Arial,sans-serif;color:#fff;">
      <div style="
        width:${86 * SIDEBAR_SCALE}px;height:${86 * SIDEBAR_SCALE}px;
        border-radius:50%;background:#fff;
        display:flex;align-items:center;justify-content:center;
        box-shadow:0 ${2 * SIDEBAR_SCALE}px ${10 * SIDEBAR_SCALE}px rgba(0,0,0,.25);">
        <div style="width:${78 * SIDEBAR_SCALE}px;height:${78 * SIDEBAR_SCALE}px">${svg}</div>
      </div>
      <div style="
        margin-top:${18 * SIDEBAR_SCALE}px;
        font-size:${13 * SIDEBAR_SCALE}px;font-weight:700;letter-spacing:.2px;
        text-align:center;line-height:1.3;">HDLBoard<br>Write VHDL and watch it run</div>
      <div style="
        margin-top:${7 * SIDEBAR_SCALE}px;
        font-size:${8 * SIDEBAR_SCALE}px;opacity:.75;text-align:center;">
        Powered by GHDL</div>
      <div style="
        position:absolute;bottom:${12 * SIDEBAR_SCALE}px;
        font-size:${7 * SIDEBAR_SCALE}px;opacity:.6;">USN &middot; PB1180</div>
    </div>
    <style>svg{width:100%;height:100%;display:block}</style>
  </body></html>`;

  const sidebar = await render(sidebarWin, sidebarHtml, 800);
  const scaled = sidebar.resize({ width: SIDEBAR_W, height: SIDEBAR_H, quality: 'best' });
  writeFileSync(bmpPath, buildBmp(SIDEBAR_W, SIDEBAR_H, scaled.toBitmap()));
  sidebarWin.destroy();
  console.log(`installerSidebar.bmp (${SIDEBAR_W}x${SIDEBAR_H})`);

  rmSync(scratch, { recursive: true, force: true });
  console.log(`-> ${buildDir}`);
  app.exit(0);
});
