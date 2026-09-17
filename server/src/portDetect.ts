/**
 * Finds the top entity among a multi-file VHDL project and the set of
 * board ports it actually declares — ../../ghdl_implementation_plan.md
 * § 7.3. Adapted from the reference implementation's detectEntityName()/
 * detectPorts() (../../../vhdlsim/tapec.uv.es/pardo/hdlsim/server/server.js),
 * retargeted at this board's port names (§ 3.2) and generalized to scan
 * every submitted file rather than assume one.
 *
 * This is text analysis for the backend's own purposes only — comments
 * are stripped from the copy used here, never from the source actually
 * handed to GHDL.
 */

import type { VhdlFileInput } from './protocol.js';

/** The DE1-SoC board ports this backend knows how to wire up (§ 3.2). */
export const BOARD_PORTS = [
  'clock_50',
  'sw',
  'key',
  'ledr',
  'hex0',
  'hex1',
  'hex2',
  'hex3',
  'hex4',
  'hex5',
  // Legacy tolerance (§ 3.2): older files may declare `rst`, wired from
  // `not key(0)` in the generated testbench when both are present.
  'rst',
] as const;

function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/--[^\n]*/g, '');
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

/**
 * The named entity's own port clause, as a lowercase name set. A
 * balanced-paren scan bounded to that entity's own declaration, so it
 * does not spill into a later entity in the same file.
 */
function detectPorts(src: string, entityName: string): Set<string> {
  const stripped = stripComments(src);
  const escaped = entityName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const entityRe = new RegExp(`entity\\s+${escaped}\\s+is`, 'i');
  const m = entityRe.exec(stripped);
  if (!m) return new Set();
  const bodyStart = m.index + m[0].length;

  let depth = 0;
  const depthAt: number[] = [];
  for (let i = bodyStart; i < stripped.length; i++) {
    if (stripped[i] === '(') depth++;
    else if (stripped[i] === ')') depth--;
    depthAt[i] = depth;
  }

  // The entity declaration ends at the first "end" keyword at paren depth 0.
  const endRe = /\bend\b/gi;
  endRe.lastIndex = bodyStart;
  let endIdx = stripped.length;
  let em: RegExpExecArray | null;
  while ((em = endRe.exec(stripped))) {
    if ((depthAt[em.index] ?? 0) === 0) {
      endIdx = em.index;
      break;
    }
  }

  const entityBody = stripped.slice(bodyStart, endIdx);
  const portMatch = /port\s*\(/i.exec(entityBody);
  if (!portMatch) return new Set();
  const openParenIdx = entityBody.indexOf('(', portMatch.index);
  let d = 0;
  let closeIdx = entityBody.length;
  for (let i = openParenIdx; i < entityBody.length; i++) {
    if (entityBody[i] === '(') d++;
    else if (entityBody[i] === ')') {
      d--;
      if (d === 0) {
        closeIdx = i;
        break;
      }
    }
  }
  const clause = entityBody.slice(openParenIdx + 1, closeIdx);

  const names = new Set<string>();
  let dd = 0;
  let tokenStart = 0;
  const decls: string[] = [];
  for (let j = 0; j < clause.length; j++) {
    const c = clause[j];
    if (c === '(') dd++;
    else if (c === ')') dd--;
    else if (c === ';' && dd === 0) {
      decls.push(clause.slice(tokenStart, j));
      tokenStart = j + 1;
    }
  }
  decls.push(clause.slice(tokenStart));
  for (const decl of decls) {
    const colon = decl.indexOf(':');
    if (colon < 0) continue;
    for (const n of decl.slice(0, colon).split(',')) {
      const nm = n.trim().toLowerCase();
      if (nm) names.add(nm);
    }
  }
  return names;
}

export interface TopEntity {
  name: string;
  ports: Set<string>;
}

export interface TopEntityError {
  message: string;
}

/**
 * Scans every submitted file for entity declarations and picks the one
 * whose ports best match the board's own names (§ 3.2) — the top entity
 * is identified by its interface, not by filename or file order, since
 * `RUN`'s files are not guaranteed to arrive top-entity-last (§ 6.3).
 */
export function findTopEntity(files: VhdlFileInput[]): TopEntity | TopEntityError {
  const candidates: TopEntity[] = [];
  for (const file of files) {
    for (const name of findEntityNames(file.content)) {
      const ports = detectPorts(file.content, name);
      candidates.push({ name, ports });
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
