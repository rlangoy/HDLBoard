// SPDX-License-Identifier: GPL-2.0-only
/** Parses the theme profile files for tests (docs/HDLBoard_Black_Theme_Spec.md T0.3). */

export const DARK_PREFIX = ":root[data-theme='dark']";

/** Selector → (property → value). */
export type ThemeBlocks = ReadonlyMap<string, ReadonlyMap<string, string>>;

const COMMENT = /\/\*[\s\S]*?\*\//g;
const BLOCK = /([^{}]+)\{([^{}]*)\}/g;
const DECLARATION = /([\w-]+)\s*:\s*([^;]+);/g;

export function parseThemeBlocks(css: string, prefix = ''): ThemeBlocks {
  const blocks = new Map<string, ReadonlyMap<string, string>>();
  for (const [, selector, body] of css.replace(COMMENT, '').matchAll(BLOCK)) {
    blocks.set(normaliseSelector(selector, prefix), parseDeclarations(body));
  }
  return blocks;
}

export function findValue(blocks: ThemeBlocks, name: string): string | undefined {
  for (const declarations of blocks.values()) {
    const value = declarations.get(name);
    if (value !== undefined) return value;
  }
  return undefined;
}

/** The value a variant block sets, else the one it inherits from the first block that sets it. */
export function findValueIn(blocks: ThemeBlocks, selector: string, name: string): string | undefined {
  return blocks.get(selector)?.get(name) ?? findValue(blocks, name);
}

function normaliseSelector(selector: string, prefix: string): string {
  return selector.split(',').map((part) => stripPrefix(part.trim(), prefix)).sort().join(', ');
}

function stripPrefix(part: string, prefix: string): string {
  if (prefix === '') return part;
  if (!part.startsWith(prefix)) throw new Error(`Selector "${part}" must start with ${prefix}`);
  return part.slice(prefix.length).trim() || ':root';
}

function parseDeclarations(body: string): ReadonlyMap<string, string> {
  return new Map([...body.matchAll(DECLARATION)].map(([, name, value]) => [name, value.trim()]));
}
