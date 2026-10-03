// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * The detector's glue (docs/impl_split_screen.md § 5.1, § 5.9): blank -> design
 * units -> evidence -> score -> regions, per file, cached by content. A file whose
 * content, name and folder are unchanged reuses its previous result. Pure: its
 * inputs and outputs are structured-clone friendly, so it can move to a Worker.
 */

import type { VhdlFile } from '../files';
import { languageOfName } from '../fileKinds';
import { blankSource } from './blank';
import { designUnits } from './designUnits';
import { lineIndex, keepRanges } from './lines';
import { regionsOf } from './regions';
import { RULES } from './rules';
import { confidenceOf, fileRoleOf, roleOf, summarize } from './score';
import type { AnalyzedUnit, Evidence, FileAnalysis, Language, ProjectAnalysis, UnitRole } from './types';

export type SourceFile = Pick<VhdlFile, 'id' | 'name' | 'folder' | 'content'>;

export function analyzeProject(files: readonly SourceFile[], previous?: ProjectAnalysis): ProjectAnalysis {
  const byFile = new Map<string, FileAnalysis>();
  for (const file of files) {
    const cached = previous?.byFile.get(file.id);
    const reusable = cached && cached.content === file.content && cached.name === file.name && cached.folder === file.folder;
    const analysis = reusable ? cached : analyzeFile(file);
    if (analysis) byFile.set(file.id, analysis);
  }
  return { byFile, unitIndex: indexUnits(byFile) };
}

/** One file's units, evidence and regions; `undefined` for a file of no HDL language. */
export function analyzeFile(file: SourceFile): FileAnalysis | undefined {
  const language = file.folder === 'work' ? 'vhdl' : languageOfName(file.name);
  if (language === undefined) return undefined;
  const blanked = blankSource(language, file.content);
  const lineOf = lineIndex(blanked.code);
  const units = designUnits(language, blanked.code).map((unit): AnalyzedUnit => {
    const base = Math.min(...unit.ranges.map((r) => r.from));
    const end = Math.max(...unit.ranges.map((r) => r.to));
    const slice = blanked.code.slice(base, end);
    const code = unit.ranges.length === 1 ? slice : keepRanges(slice, unit.ranges.map((r) => ({ from: r.from - base, to: r.to - base })));
    const text = { unit, code, base, lineOf, simOnlyRegions: blanked.simOnlyRegions };
    const evidence = RULES[language].flatMap((r) => r.find(text).map((line): Evidence => ({ ruleId: r.id, line })));
    const summary = summarize(evidence);
    const confidence = confidenceOf(summary);
    return { ...unit, evidence: sortEvidence(evidence), summary, confidence, role: roleOf(confidence) };
  });
  return withUnits({ fileId: file.id, name: file.name, folder: file.folder, content: file.content, language }, units);
}

const sortEvidence = (evidence: Evidence[]): Evidence[] => evidence.sort((a, b) => a.line - b.line);

/** A file analysis built from its units: the file role and the regions follow from them. */
export function withUnits(
  base: Pick<FileAnalysis, 'fileId' | 'name' | 'folder' | 'content' | 'language'>,
  units: readonly AnalyzedUnit[],
): FileAnalysis {
  return { ...base, units, role: fileRoleOf(units.map((u) => u.role)), regions: regionsOf(units) };
}

/** A role override (§ 5.7): every unit gets that role, with confidence high. */
export function withRoleOverride(file: FileAnalysis, role: UnitRole | undefined): FileAnalysis {
  if (role === undefined) return file;
  return withUnits(file, file.units.map((u) => ({ ...u, role, confidence: 'high' })));
}

/** VHDL names compare case-insensitively, Verilog's exactly. */
export const unitKey = (language: Language, name: string): string => (language === 'vhdl' ? name.toLowerCase() : name);

function indexUnits(byFile: ReadonlyMap<string, FileAnalysis>): ProjectAnalysis['unitIndex'] {
  const index = { vhdl: new Map<string, string>(), verilog: new Map<string, string>() };
  for (const file of byFile.values()) {
    for (const unit of file.units) {
      const key = unitKey(file.language, unit.name);
      if (!index[file.language].has(key)) index[file.language].set(key, file.fileId);
    }
  }
  return index;
}
