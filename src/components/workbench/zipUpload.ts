// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * Uploading or dropping a .zip — such as one "Download All" saved — adds the files
 * inside it. The archive's folders are not kept: each file goes through the same rules
 * as one uploaded on its own (fileNameRules.ts, fileKinds.ts), so it lands in the folder
 * its extension picks, and one whose name is taken or starts with `tb_` is refused.
 */

import { readZip } from './zip';

export function isZipName(name: string): boolean {
  return /\.zip$/i.test(name);
}

/** The last part of an archive path: `vhdl/DE1_SoC.vhdl` → `DE1_SoC.vhdl`. */
export function baseName(path: string): string {
  return path.slice(path.replace(/\\/g, '/').lastIndexOf('/') + 1);
}

/** macOS Finder's resource forks (`__MACOSX/…`, `._x.vhd`) and other hidden files. */
function isJunk(path: string): boolean {
  return path.startsWith('__MACOSX/') || baseName(path).startsWith('.');
}

/** The files inside `archive`, named by their base name. Rejects if it is no readable ZIP. */
export async function filesInZip(archive: Blob): Promise<File[]> {
  const entries = await readZip(new Uint8Array(await archive.arrayBuffer()));
  return entries
    .filter((entry) => !isJunk(entry.path))
    .map((entry) => new File([entry.data], baseName(entry.path), { type: 'text/plain' }));
}
