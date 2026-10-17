// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * Verilog memories – `reg [7:0] mem [0:3];` – which Icarus leaves out of a VCD without a
 * word. They are listed, greyed out, with the reason (FR-11, W9), found in the
 * testbench's own source because the file does not mention them. Pure.
 */

import type { WaveformData } from './model';

const COMMENTS = /\/\/[^\n]*|\/\*[\s\S]*?\*\//g;
const MODULE = /\bmodule\s+(\w+)[\s\S]*?\bendmodule\b/g;
/** `reg [7:0] mem [0:3];`, `reg [7:0] a, mem [0:3];`, `logic [3:0] m [4];` */
const MEMORY_DECLARATION = /\b(?:reg|wire|logic|integer)\b(?:\s*signed)?\s*(?:\[[^\]]*\])?\s*([^;]*);/g;
const UNPACKED_NAME = /^\s*(\w+)\s*\[[^\]]*\]/;

/** The memories `moduleName` declares in `source`. */
export function memoryNames(source: string, moduleName: string): string[] {
  const code = source.replace(COMMENTS, '');
  for (const module of code.matchAll(MODULE)) {
    if (module[1] !== moduleName) continue;
    const names: string[] = [];
    for (const declaration of module[0].matchAll(MEMORY_DECLARATION)) {
      for (const part of declaration[1].split(',')) {
        const name = UNPACKED_NAME.exec(part)?.[1];
        if (name !== undefined) names.push(name);
      }
    }
    return names;
  }
  return [];
}

/** The waveform with the testbench's memories listed as unavailable in its top scope. */
export function withVerilogMemories(data: WaveformData, sources: readonly string[]): WaveformData {
  const [top] = data.root.scopes;
  if (top === undefined) return data;
  const recorded = new Set(top.signals.map((s) => s.name));
  const memories = [...new Set(sources.flatMap((source) => memoryNames(source, top.name)))].filter((name) => !recorded.has(name));
  if (memories.length === 0) return data;
  const unavailable = [...top.unavailable, ...memories.map((name) => ({ name, reason: 'memory' as const }))];
  return { ...data, root: { ...data.root, scopes: [{ ...top, unavailable }, ...data.root.scopes.slice(1)] } };
}
