// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * GHDL's synthesis answer placed in the code (docs/impl_sim_only_warnings.md § 7): each
 * message on the line of hardware code it names, or said for the design as a whole when it
 * names no line HDLBoard can trust. The answer belongs to the code it checked: it applies
 * only while every file it read still reads so. Then its findings join the live check's,
 * one message per line: on a line the live check warns about too, GHDL's words are a
 * detail of the live warning. Pure.
 */

import type { AdvisedDiagnostic } from '../../diagnosticAdvice';
import { locateDiagnostics } from '../../diagnosticLocation';
import type { TestbenchOverrides } from '../../tbDetect/types';
import { isWarnable, partUnitKey } from '../findings';
import { isHidden, scannedFile } from '../scan';
import type { CodePart, DesignView, ToolFinding } from '../types';
import type { CheckStatus, ClassifiedAnswer, PlacedMessage } from './classify';
import { EFFECT_TEXT, GHDL_SOURCE, type UnverifiedReason } from './toolCheckText';

export interface CheckedFile {
  readonly id: string;
  readonly name: string;
  readonly content: string;
}

/** A check's answer as the page keeps it: what it found, for which code. */
export interface ToolCheckResult {
  /** The unit checked. */
  readonly top: string;
  readonly status: CheckStatus;
  readonly reason?: UnverifiedReason;
  /** The files checked, as they read then: the answer holds while they still read so. */
  readonly files: readonly CheckedFile[];
  readonly findings: readonly ToolFinding[];
  /** Messages with no line HDLBoard can trust, GHDL's own words. */
  readonly designMessages: readonly string[];
}

export interface PlaceInput {
  readonly top: string;
  readonly answer: ClassifiedAnswer;
  readonly files: readonly CheckedFile[];
  /** The project as it is now; its analysis must be of `files` for a message to be placed. */
  readonly view: DesignView;
}

/** Where a message lands: a finding, nowhere (hidden from synthesis), or the design as a whole. */
type Landing = ToolFinding | 'hidden' | 'design';

/** The view's analysis is of the checked text, so its lines are GHDL's lines. */
export function analysedAsChecked(view: DesignView, files: readonly CheckedFile[]): boolean {
  return files.every((file) => view.raw.byFile.get(file.id)?.content === file.content);
}

/** The code part a line belongs to, as synthesis reads the file; `hidden` inside translate_off. */
function partAt(view: DesignView, fileId: string, line: number): CodePart | 'hidden' | undefined {
  const file = view.raw.byFile.get(fileId);
  if (file === undefined) return undefined;
  const scan = scannedFile(file);
  if (isHidden(line, scan.hidden)) return 'hidden';
  const holds = (from: number, to: number) => scan.lineOf(from) <= line && line <= scan.lineOf(Math.max(from, to - 1));
  const unit = scan.units.find((u) => u.unit.ranges.some((r) => holds(r.from, r.to)));
  return unit && view.parts.get(fileId)?.find((p) => p.unitName === unit.unit.name && p.ownsUnit === unit.ownsUnit);
}

function landingOf({ files, view }: PlaceInput, { diagnostic, meaning }: PlacedMessage): Landing {
  const [located] = locateDiagnostics([diagnostic], { files }, files);
  if (located === undefined) return 'design';
  const part = partAt(view, located.fileId, located.line);
  if (part === 'hidden') return 'hidden';
  const unitRef = part && partUnitKey(view, part);
  if (part === undefined || unitRef === undefined) return 'design';
  const { effect, tier, title, text } = meaning;
  return { fileId: located.fileId, line: located.line, effect, ...(tier && { tier }), unitRef, unitName: part.unitName, toolMessage: diagnostic.message, title, text };
}

/**
 * The answer in the code: each placed message on its line when that line is in a code part,
 * dropped inside code hidden from synthesis (S6), and said for the design otherwise.
 */
export function placeAnswer(input: PlaceInput): ToolCheckResult {
  const { top, answer, files, view } = input;
  const base = { top, status: answer.status, ...(answer.reason && { reason: answer.reason }), files };
  if (!analysedAsChecked(view, files)) return { ...base, findings: [], designMessages: answer.unplaced };
  const landings = answer.placed.map((message) => ({ message, landing: landingOf(input, message) }));
  const findings = landings.flatMap(({ landing }) => (typeof landing === 'object' ? [landing] : []));
  const elsewhere = landings.filter(({ landing }) => landing === 'design').map(({ message }) => message.diagnostic.message);
  return { ...base, findings, designMessages: [...new Set([...answer.unplaced, ...elsewhere])] };
}

/** Whether the answer still fits the code: every file it read reads as it did. */
export function fitsFiles(result: ToolCheckResult, files: readonly { readonly id: string; readonly content: string }[]): boolean {
  const now = new Map(files.map((file) => [file.id, file.content]));
  return result.files.every((file) => now.get(file.id) === file.content);
}

/** A finding still about hardware code: the student may have marked the file *Treat as testbench* since. */
export function isHardwareFinding(view: DesignView, finding: ToolFinding): boolean {
  return view.hardware.hardware.has(finding.unitRef) && !view.hardware.testbenchFiles.has(finding.fileId);
}

/** The findings to show now: in hardware code, outside a *Simulation model*. */
export function shownFindings(findings: readonly ToolFinding[], view: DesignView, overrides: TestbenchOverrides): ToolFinding[] {
  return findings.filter((f) => isHardwareFinding(view, f) && isWarnable(f, overrides));
}

/** A finding as an editor warning: HDLBoard's words, what it means for the board, and GHDL's own message. */
export function toolDiagnostic(finding: ToolFinding): AdvisedDiagnostic {
  return {
    fileId: finding.fileId,
    line: finding.line,
    severity: 'warning',
    message: `${EFFECT_TEXT[finding.effect]} ${finding.text.explanation}`,
    details: [`GHDL: ${finding.toolMessage}`],
    advice: { headline: finding.text.headline, compiler: GHDL_SOURCE, liveCheck: true },
  };
}

const sameLine = (a: { fileId: string; line: number }, b: { fileId: string; line: number }) => a.fileId === b.fileId && a.line === b.line;

/** A live warning with GHDL's message on its line as one more detail, naming its source. */
function confirmedBy(warning: AdvisedDiagnostic, findings: readonly ToolFinding[]): AdvisedDiagnostic {
  const details = findings.filter((f) => sameLine(f, warning)).map((f) => `${GHDL_SOURCE}: ${f.toolMessage}`);
  return details.length === 0 ? warning : { ...warning, details: [...warning.details, ...details] };
}

/**
 * The live warnings with GHDL's findings: one on a line the live check warns about becomes a
 * detail of the first warning there; any other is a warning of its own.
 */
export function withToolFindings(live: readonly AdvisedDiagnostic[], findings: readonly ToolFinding[]): AdvisedDiagnostic[] {
  const isFirstOnItsLine = (warning: AdvisedDiagnostic, index: number) => live.findIndex((other) => sameLine(other, warning)) === index;
  const merged = live.map((warning, index) => (isFirstOnItsLine(warning, index) ? confirmedBy(warning, findings) : warning));
  const onOtherLines = findings.filter((f) => live.every((warning) => !sameLine(warning, f)));
  return [...merged, ...onOtherLines.map(toolDiagnostic)];
}
