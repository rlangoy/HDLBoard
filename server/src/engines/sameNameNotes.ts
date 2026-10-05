// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * Units of the top file that other files declare too — a testbench copied to a new
 * file that kept its entity or module name, say. Each engine makes the top file's own
 * declaration the one that runs; this is how the console says so.
 */
export interface SameNameDeclarations {
  readonly unitKind: 'entity' | 'module';
  /** The top file's units that other files declare as well. */
  readonly names: readonly string[];
  readonly topFile: string;
  readonly otherFiles: readonly string[];
}

/** Which declaration the run uses and how to keep them apart; none when no other file declares one. */
export function sameNameNotes({ unitKind, names, topFile, otherFiles }: SameNameDeclarations): string[] {
  if (otherFiles.length === 0) return [];
  const declared = names.length === 1 ? `${names[0]} is` : `${names.join(', ')} are`;
  return [
    `Note: ${declared} declared in ${topFile} and in ${otherFiles.join(', ')}. ` +
      `This run uses the one in ${topFile}; give each its own ${unitKind} name to keep them apart.`,
  ];
}
