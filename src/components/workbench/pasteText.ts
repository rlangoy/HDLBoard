// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/** The words of the Review pasted architecture dialog, with `code` in backticks (CodeText). Pure. */

import type { EntityRename, ExistingArchitecture } from './pastedArchitecture';

const code = (text: string): string => `\`${text}\``;

export const PASTE_TEXT = {
  title: 'Review pasted architecture',
  renameTitle: 'Match the entity name',
  cancel: 'Cancel',
  applyAndPaste: 'Apply changes and paste',
  pasteAsCopied: 'Paste as copied',
};

/** The subtitle: one card, or more. */
export function choicesSubtitle(count: number): string {
  return count === 1 ? 'Check this before the code goes in.' : 'Check these before the code goes in.';
}

export function renameDetail({ from, to }: EntityRename): string {
  return `Change ${code(from)} to ${code(to)}. No entity named ${code(from)} exists in this project.`;
}

/** What happens instead, while the rename is unticked. */
export function renameSkipped({ from }: EntityRename): string {
  return `Left as ${code(from)}, the next Start reports an unknown entity.`;
}

export function replaceTitle(architectures: readonly ExistingArchitecture[]): string {
  return architectures.length === 1 ? 'Replace the existing architecture' : 'Replace the existing architectures';
}

function placeOf({ fileId, fileName, line, lastLine }: ExistingArchitecture, targetFileId: string): string {
  const lines = lastLine > line ? `lines ${line}–${lastLine}` : `line ${line}`;
  return fileId === targetFileId ? lines : `${fileName}, ${lines}`;
}

/** Each architecture the paste replaces, and the lines that go: the consequence, before Paste is clicked. */
export function replaceDetail(architectures: readonly ExistingArchitecture[], targetFileId: string): string {
  const each = architectures.map((a) => `${code(a.entity)} already has an architecture named ${code(a.name)} (${placeOf(a, targetFileId)}).`);
  const consequence = architectures.length === 1 ? 'Those lines are deleted, and the pasted one takes its place.' : 'Those lines are deleted, and the pasted ones take their place.';
  return `${each.join(' ')} ${consequence}`;
}

/** Why a card is greyed out: what it is about exists only under the name the rename gives. */
export function notNeededWithoutRename({ from }: EntityRename): string {
  return `Not needed while the pasted code keeps the name ${code(from)}.`;
}

export function deleteOthersTitle(architectures: readonly ExistingArchitecture[]): string {
  return architectures.length === 1 ? 'Delete the other architecture' : 'Delete the other architectures';
}

/** The other architectures of the pasted one's entity: they may stay, so the card starts unticked. */
export function deleteOthersDetail(architectures: readonly ExistingArchitecture[], targetFileId: string): string {
  const each = architectures.map((a) => `${code(a.entity)} also has the architecture ${code(a.name)} (${placeOf(a, targetFileId)}).`);
  return `${each.join(' ')} Both may stay: an entity can have several architectures, and the simulation runs the one GHDL reads last.`;
}

/** The small warning in the card: the code that ticking it deletes. */
export function deleteOthersWarning(architectures: readonly ExistingArchitecture[], targetFileId: string): string {
  return `Ticking this deletes ${architectures.map((a) => placeOf(a, targetFileId)).join(' and ')}.`;
}

/** What happens instead, while the replace is unticked. */
export function replaceSkipped(architectures: readonly ExistingArchitecture[]): string {
  const names = [...new Set(architectures.map((a) => code(a.name)))].join(', ');
  return `Both are kept, and the next Start warns that ${names} is defined twice.`;
}
