// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * A synthesis check's answer placed in the code (docs/impl_sim_only_warnings.md § 7): each
 * message on the line of hardware code it names, or said for the design as a whole when it
 * names no line HDLBoard can trust. The answer belongs to the code it checked: it applies
 * only while every file it read still reads so. Then its findings join the live check's,
 * one message per line: on a line the live check warns about too, the tool's words are a
 * detail of the live warning. Pure.
 */

import type { AdvisedDiagnostic } from '../../diagnosticAdvice';
import { locateDiagnostics } from '../../diagnosticLocation';
import type { TestbenchOverrides } from '../../tbDetect/types';
import { isWarnable, partUnitKey } from '../findings';
import { isHidden, scannedFile } from '../scan';
import type { CodePart, DesignView, SynthTool, ToolFinding } from '../types';
import type { CheckStatus, ClassifiedAnswer, PlacedMessage } from './classify';
import { EFFECT_TEXT, TOOL_NAME, TOOL_SOURCE, type UnverifiedReason } from './toolCheckText';

export interface CheckedFile {
  readonly id: string;
  readonly name: string;
  readonly content: string;
}

/** A check's answer as the page keeps it: what it found, for which code. */
export interface ToolCheckResult {
  readonly tool: SynthTool;
  readonly top: string;
  readonly topFileId: string;
  readonly status: CheckStatus;
  readonly reason?: UnverifiedReason;
  /** The files checked, as they read then: the answer holds while they still read so. */
  readonly files: readonly CheckedFile[];
  readonly findings: readonly ToolFinding[];
  /** Messages with no line HDLBoard can trust, the tool's own words. */
  readonly designMessages: readonly string[];
}

export interface PlaceInput {
  readonly tool: SynthTool;
  readonly top: string;
  readonly topFileId: string;
  readonly answer: ClassifiedAnswer;
  readonly files: readonly CheckedFile[];
  /** The project as it is now; its analysis must be of `files` for a message to be placed. */
  readonly view: DesignView;
}

type Place = { readonly kind: 'part'; readonly part: CodePart } | { readonly kind: 'hidden' } | { readonly kind: 'none' };

/** The code part a line belongs to, as synthesis reads the file; `hidden` inside translate_off / `ifndef SYNTHESIS. */
function placeOf(view: DesignView, fileId: string, line: number): Place {
  const file = view.raw.byFile.get(fileId);
  if (file === undefined) return { kind: 'none' };
  const scan = scannedFile(file);
  if (isHidden(line, scan.hidden)) return { kind: 'hidden' };
  const holds = (from: number, to: number) => scan.lineOf(from) <= line && line <= scan.lineOf(Math.max(from, to - 1));
  const unit = scan.units.find((u) => u.unit.ranges.some((r) => holds(r.from, r.to)));
  const part = unit && view.parts.get(fileId)?.find((p) => p.unitName === unit.unit.name && p.ownsUnit === unit.ownsUnit);
  return part === undefined ? { kind: 'none' } : { kind: 'part', part };
}

/** The view's analysis is of the checked text, so its lines are the tool's lines. */
export function analysedAsChecked(view: DesignView, files: readonly CheckedFile[]): boolean {
  return files.every((file) => view.raw.byFile.get(file.id)?.content === file.content);
}

function findingOf(input: PlaceInput, { diagnostic, meaning }: PlacedMessage, place: { fileId: string; line: number; part: CodePart }): ToolFinding | undefined {
  const unitRef = partUnitKey(input.view, place.part);
  if (unitRef === undefined) return undefined;
  return {
    fileId: place.fileId,
    line: place.line,
    tool: input.tool,
    effect: meaning.effect,
    ...(meaning.tier && { tier: meaning.tier }),
    unitRef,
    unitName: place.part.unitName,
    toolMessage: diagnostic.message,
    title: meaning.title,
    text: meaning.text,
    quiet: meaning.quiet,
  };
}

/**
 * The answer in the code: each placed message on its line when that line is in a code part,
 * dropped inside code hidden from synthesis (S6), and said for the design otherwise.
 */
/** One message in the code: a finding on its line, `hidden` (dropped), or undefined, to be said for the design. */
function placeMessage(input: PlaceInput, message: PlacedMessage): ToolFinding | 'hidden' | undefined {
  const located = locateDiagnostics([message.diagnostic], { files: input.files }, input.files)[0];
  if (located === undefined) return undefined;
  const place = placeOf(input.view, located.fileId, located.line);
  if (place.kind === 'hidden') return 'hidden';
  return place.kind === 'part' ? findingOf(input, message, { fileId: located.fileId, line: located.line, part: place.part }) : undefined;
}

export function placeAnswer(input: PlaceInput): ToolCheckResult {
  const { tool, top, topFileId, answer, files, view } = input;
  const base = { tool, top, topFileId, status: answer.status, ...(answer.reason && { reason: answer.reason }), files };
  if (!analysedAsChecked(view, files)) return { ...base, findings: [], designMessages: answer.unplaced };
  const findings: ToolFinding[] = [];
  const designMessages = [...answer.unplaced];
  for (const message of answer.placed) {
    const placed = placeMessage(input, message);
    if (placed === undefined) designMessages.push(message.diagnostic.message);
    else if (placed !== 'hidden') findings.push(placed);
  }
  return { ...base, findings, designMessages: [...new Set(designMessages)] };
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

/** A finding as an editor warning: HDLBoard's words, what it means for the board, and the tool's own message. */
export function toolDiagnostic(finding: ToolFinding): AdvisedDiagnostic {
  return {
    fileId: finding.fileId,
    line: finding.line,
    severity: 'warning',
    message: `${EFFECT_TEXT[finding.effect]} ${finding.text.explanation}`,
    details: [`${TOOL_NAME[finding.tool]}: ${finding.toolMessage}`],
    ...(finding.quiet && { quiet: true }),
    advice: { headline: finding.text.headline, compiler: TOOL_SOURCE[finding.tool], liveCheck: true },
  };
}

const sameLine = (a: { fileId: string; line: number }, b: { fileId: string; line: number }) => a.fileId === b.fileId && a.line === b.line;

/**
 * The live warnings with the tool's findings: one on a line the live check warns about too
 * becomes a detail of that warning, naming the tool; any other is a warning of its own.
 */
export function withToolFindings(live: readonly AdvisedDiagnostic[], findings: readonly ToolFinding[]): AdvisedDiagnostic[] {
  const merged = [...live];
  for (const finding of findings) {
    const index = merged.findIndex((d) => sameLine(d, finding) && d.advice?.compiler !== TOOL_SOURCE[finding.tool]);
    const detail = `${TOOL_SOURCE[finding.tool]}: ${finding.toolMessage}`;
    if (index !== -1 && index < live.length) {
      const warning = merged[index];
      if (!warning.details.includes(detail)) merged[index] = { ...warning, details: [...warning.details, detail] };
    } else {
      merged.push(toolDiagnostic(finding));
    }
  }
  return merged;
}
