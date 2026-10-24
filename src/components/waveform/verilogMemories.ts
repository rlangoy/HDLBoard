// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * Verilog memories – `reg [7:0] mem [0:3];` – which Icarus leaves out of a VCD without a
 * word. They are listed, greyed out, with the reason (FR-11, W9), found in the
 * testbench's own source because the file does not mention them. Pure.
 */

import type { WaveformData } from './model';
import type { VerilogModule } from './verilogModules';

/** `reg [7:0] mem [0:3];`, `reg [7:0] a, mem [0:3];`, `logic [3:0] m [4];` */
const MEMORY_DECLARATION = /\b(?:reg|wire|logic|integer)\b(?:\s*signed)?\s*(?:\[[^\]]*\])?\s*([^;]*);/g;
const UNPACKED_NAME = /^\s*(\w+)\s*\[[^\]]*\]/;

/** The memories a module declares. */
export function memoryNames(module: VerilogModule): string[] {
  return [...module.text.matchAll(MEMORY_DECLARATION)]
    .flatMap((declaration) => declaration[1].split(','))
    .map((part) => UNPACKED_NAME.exec(part)?.[1])
    .filter((name): name is string => name !== undefined);
}

/** The waveform with the testbench's memories listed as unavailable in its top scope. */
export function withVerilogMemories(data: WaveformData, modules: readonly VerilogModule[]): WaveformData {
  const [top] = data.root.scopes;
  if (top === undefined) return data;
  const recorded = new Set(top.signals.map((s) => s.name));
  const declared = modules.filter((module) => module.name === top.name).flatMap(memoryNames);
  const memories = [...new Set(declared)].filter((name) => !recorded.has(name));
  if (memories.length === 0) return data;
  const unavailable = [...top.unavailable, ...memories.map((name) => ({ name, reason: 'memory' as const }))];
  return { ...data, root: { ...data.root, scopes: [{ ...top, unavailable }, ...data.root.scopes.slice(1)] } };
}
