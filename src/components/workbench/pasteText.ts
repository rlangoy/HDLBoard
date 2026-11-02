// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/** The words of the Paste architecture dialog, with `code` in backticks (CodeText). Pure. */

import type { EntityRename, ExistingArchitecture } from './pastedArchitecture';

export const PASTE_TEXT = {
  title: 'Paste architecture',
  subtitle: 'The pasted code needs a change to fit this project.',
  paste: 'Paste',
  cancel: 'Cancel',
};

export function renameChoice({ from, to }: EntityRename): string {
  return `Change \`${from}\` to \`${to}\` — no file in the project declares an entity named \`${from}\`.`;
}

function placeOf(architecture: ExistingArchitecture, targetFileId: string): string {
  const inFile = architecture.fileId === targetFileId ? '' : ` in ${architecture.fileName}`;
  return `\`${architecture.name}\` of \`${architecture.entity}\`${inFile} (line ${architecture.line})`;
}

export function replaceChoice(architectures: readonly ExistingArchitecture[], targetFileId: string): string {
  const noun = architectures.length === 1 ? 'architecture' : 'architectures';
  const places = architectures.map((a) => placeOf(a, targetFileId)).join(', ');
  return `Replace the existing ${noun} ${places} — two architectures of one entity cannot share a name.`;
}
