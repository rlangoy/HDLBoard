// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * Finds the top entity among a multi-file VHDL project and the set of
 * board ports it actually declares — ../../docs/ghdl_implementation_plan.md
 * § 7.3. Adapted from the reference implementation's detectEntityName()/
 * detectPorts() (../../../vhdlsim/tapec.uv.es/pardo/hdlsim/server/server.js),
 * retargeted at this board's port names (§ 3.2) and generalized to scan
 * every submitted file rather than assume one.
 *
 * This is text analysis for the backend's own purposes only — comments
 * are stripped from the copy used here, never from the source actually
 * handed to GHDL.
 */

import { BOARD_PORTS } from './engines/boardPorts.js';
import { portDeclarations } from './engines/vhdlPorts.js';
import type { VhdlFileInput } from './protocol.js';

function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/--[^\n]*/g, '');
}

/**
 * `RUN <file> @<unit>` (docs/impl_split_screen.md D20): exactly that entity of that
 * file; board / batch mode then follows from its own ports, as for any top.
 */
function namedEntity(files: VhdlFileInput[], fileName: string, unit: string): TopEntity | TopEntityError {
  const file = files.find((f) => f.name === fileName);
  const name = file && findEntityNames(file.content).find((n) => n.toLowerCase() === unit.toLowerCase());
  if (!file || name === undefined) return { message: `${fileName} declares no entity ${unit}.` };
  return { name, ports: detectPorts(file.content, name), fileName };
}

function findEntityNames(src: string): string[] {
  const stripped = stripComments(src);
  const names: string[] = [];
  const re = /\bentity\s+(\w+)\s+is\b/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(stripped))) {
    names.push(m[1]);
  }
  return names;
}

/** The named entity's own ports, as a lower-case name set. */
function detectPorts(src: string, entityName: string): Set<string> {
  return new Set(portDeclarations(src, entityName).map((port) => port.name.toLowerCase()));
}

export interface TopEntity {
  name: string;
  ports: Set<string>;
  /** The file that declares it. */
  fileName: string;
}

export interface TopEntityError {
  message: string;
}

/**
 * Scans every submitted file for entity declarations and picks the one
 * whose ports best match the board's own names (§ 3.2) — the top entity
 * is identified by its interface, not by filename or file order, since
 * `RUN`'s files are not guaranteed to arrive top-entity-last (§ 6.3).
 *
 * `preferredFileName`, when given (a "set as top" click in the Files
 * panel — `RUN`'s optional inline arg), skips the scoring entirely and
 * elaborates whichever entity that specific file declares — a student's
 * explicit choice overrides the auto-detect heuristic, not the other way
 * round. Falls through to auto-detect only if that file wasn't actually
 * submitted (deleted client-side after being marked top, say), never
 * silently for a file that exists but scores 0 — an explicit choice that
 * doesn't match any board port is still the student's entity to see fail
 * at elaboration with a real GHDL error, not quietly swapped out.
 */
export function findTopEntity(
  files: VhdlFileInput[],
  preferredFileName?: string,
  runTarget?: string,
): TopEntity | TopEntityError {
  if (preferredFileName && runTarget) return namedEntity(files, preferredFileName, runTarget);
  if (preferredFileName) {
    const preferred = files.find((f) => f.name === preferredFileName);
    if (preferred) {
      const names = findEntityNames(preferred.content);
      if (names.length === 0) {
        return {
          message: `${preferredFileName} is marked as the top file, but no 'entity ... is' declaration was found in it.`,
        };
      }
      // A file conventionally declares one entity; the first declared is
      // its own, primary one — a later declaration in the same file (rare,
      // but legal VHDL) is more likely a locally-scoped helper.
      const name = names[0];
      return { name, ports: detectPorts(preferred.content, name), fileName: preferred.name };
    }
  }

  const candidates: TopEntity[] = [];
  for (const file of files) {
    for (const name of findEntityNames(file.content)) {
      const ports = detectPorts(file.content, name);
      candidates.push({ name, ports, fileName: file.name });
    }
  }

  if (candidates.length === 0) {
    return { message: "No 'entity ... is' declaration found in the submitted project." };
  }

  const scored = candidates
    .map((c) => ({
      c,
      score: [...c.ports].filter((p) => (BOARD_PORTS as readonly string[]).includes(p)).length,
    }))
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score);

  if (scored.length === 0) {
    const names = candidates.map((c) => c.name).join(', ');
    return {
      message:
        `None of the declared entities (${names}) has a port matching the board interface ` +
        `(${BOARD_PORTS.join(', ')}). Check the spelling of your entity's port names.`,
    };
  }

  return scored[0].c;
}
