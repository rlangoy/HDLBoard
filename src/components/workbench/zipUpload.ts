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

/** A file taken out of a .zip: named by its base name, with its path in the archive. */
export type ZipMember = File & { readonly zipPath: string };

/** The files inside `archive`, named by their base name. Rejects if it is no readable ZIP. */
export async function filesInZip(archive: Blob): Promise<ZipMember[]> {
  const entries = await readZip(new Uint8Array(await archive.arrayBuffer()));
  return entries
    .filter((entry) => !isJunk(entry.path))
    .map((entry) => Object.assign(new File([entry.data], baseName(entry.path), { type: 'text/plain' }), { zipPath: entry.path.replace(/\\/g, '/') }));
}

/** Where a file was in its .zip, or undefined for one that did not come from one. */
export function zipPathOf(file: File): string | undefined {
  const path = (file as Partial<ZipMember>).zipPath;
  return typeof path === 'string' ? path : undefined;
}

/**
 * The project file among a .zip's files (docs/impl_project_structure.md § 6.7): the
 * shallowest `.hdlboard.json`, so a project zipped inside a folder opens too. Undefined
 * when the archive holds none.
 */
export function projectFileInZip<T extends ZipMember>(members: readonly T[]): T | undefined {
  const depth = (member: T) => member.zipPath.split('/').length;
  return members
    .filter((member) => /\.hdlboard\.json$/i.test(member.name))
    .sort((a, b) => depth(a) - depth(b) || a.zipPath.localeCompare(b.zipPath))[0];
}

/** `path` relative to the folder `folder` of the archive ('' is its top); undefined when it is outside it. */
export function relativeInZip(folder: string, path: string): string | undefined {
  if (folder === '') return path;
  return path.toLowerCase().startsWith(`${folder.toLowerCase()}/`) ? path.slice(folder.length + 1) : undefined;
}
