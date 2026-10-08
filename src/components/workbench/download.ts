// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import type { VhdlFile } from './files';
import { createZip, type ZipEntry } from './zip';

/* ------------------------------------------------------------------ *
 * Saving files out of the workbench. Everything is already in memory
 * (`VhdlFile.content`), so a download is a Blob plus an <a download>
 * click — no backend round trip. In the desktop app Electron shows its
 * native "Save As" dialog for the same click, with no extra wiring.
 * ------------------------------------------------------------------ */

/** Hands a Blob to the browser as a download named `name`. */
export function downloadBlob(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.style.display = 'none';
  // Firefox ignores clicks on anchors that aren't in the document.
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Revoking synchronously can cancel the download before the browser
  // has started reading the Blob (seen in Firefox and Safari).
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Downloads one source file exactly as it reads in the editor. */
export function downloadSourceFile(file: Pick<VhdlFile, 'name' | 'content'>): void {
  downloadBlob(new Blob([file.content], { type: 'text/plain;charset=utf-8' }), file.name);
}

/**
 * The archive layout mirrors the Files panel: `vhdl/…`, `verilog/…`,
 * `work/…`. Two files can share a name in one folder (nothing here
 * stops it), and a ZIP with duplicate paths extracts only one of them,
 * so later duplicates get a ` (2)`, ` (3)` … suffix before the extension.
 */
export function projectZipEntries(files: Pick<VhdlFile, 'name' | 'folder' | 'content'>[]): ZipEntry[] {
  const used = new Set<string>();
  return files.map((f) => {
    const dot = f.name.lastIndexOf('.');
    const stem = dot > 0 ? f.name.slice(0, dot) : f.name;
    const ext = dot > 0 ? f.name.slice(dot) : '';
    let path = `${f.folder}/${f.name}`;
    for (let n = 2; used.has(path.toLowerCase()); n++) path = `${f.folder}/${stem} (${n})${ext}`;
    used.add(path.toLowerCase());
    return { path, data: f.content };
  });
}

/** e.g. `HDLBoard-project-2026-09-27.zip` — dated so repeated exports don't collide. */
export function projectZipName(now: Date = new Date()): string {
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `HDLBoard-project-${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}.zip`;
}

/**
 * Downloads every file in the project as one ZIP. An open project's file goes in at the
 * top, and names the archive, so uploading the .zip opens the project again.
 */
export function downloadProjectZip(
  files: Pick<VhdlFile, 'name' | 'folder' | 'content'>[],
  projectFile?: { name: string; text: string },
): void {
  const now = new Date();
  const entries = projectZipEntries(files);
  if (projectFile) entries.unshift({ path: projectFile.name, data: projectFile.text });
  const zip = createZip(entries, now);
  const name = projectFile ? `${projectFile.name.replace(/\.hdlboard\.json$/i, '')}.zip` : projectZipName(now);
  downloadBlob(new Blob([zip], { type: 'application/zip' }), name);
}
