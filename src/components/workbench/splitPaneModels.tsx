// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import type { ReactNode } from 'react';
import type { CodeEditorProps } from './CodeEditor';
import type { PaneRun } from './EditorPaneHeader';
import { narrowView, type EditorView, type PaneRole } from './editorView';
import type { VhdlFile } from './files';
import { RoleIcon } from './RoleIcon';
import { pairOptions, unitOf } from './splitModel';
import type { SplitEditorProps, SplitPaneModel } from './SplitEditor';
import { effectiveFile } from './tbDetect';
import type { EditorPair, PaneTarget, ProjectAnalysis, TestbenchOverrides, UnitRole } from './tbDetect/types';
import { TEXT, noTestbenchFor, notInProject } from './testbenchText';
import type { EditorSplit } from './useEditorSplit';
import type { RevealRequest } from './useRevealLine';
import { ViewSwitch } from './ViewSwitch';

/**
 * What CodeEditor is given to show the testbench split (docs/impl_split_screen.md
 * § 4.1–4.6): the pane models, the partner tab, role icons and the tab strip's
 * right end. Turns the split's state into props; holds none itself.
 */

/** What the editor column shows: one pair, how, and which pane has focus (§ 6.6). */
export interface EditorDisplay {
  readonly pair: EditorPair;
  readonly view: EditorView;
  readonly focusedPane: PaneRole;
  /** The TB pane's region, 0-based; session only (D18). */
  readonly regionIndex: number;
  readonly reveals: Readonly<Record<PaneRole, RevealRequest | null>>;
}

export type EditorSplitProps = Pick<CodeEditorProps, 'split' | 'visibleTabId' | 'tabIcon' | 'stripEnd'>;

/** Everything the pane models read, and the events they raise. */
export interface ModelContext {
  readonly project: ProjectAnalysis;
  readonly overrides: TestbenchOverrides;
  readonly files: readonly VhdlFile[];
  readonly display: EditorDisplay | null;
  /** A diagnostic or console reveal; shown in the pane that shows its file. */
  readonly reveal: RevealRequest | null;
  readonly paneRun: (pane: PaneRole, target: PaneTarget) => PaneRun | null;
  readonly onSetRole: (fileId: string, role: UnitRole | undefined) => void;
  readonly onPair: (designId: string, tbId: string) => void;
  readonly onStepRegion: (step: 1 | -1) => void;
  readonly onPin: (view: EditorView) => void;
  readonly onFocusPane: (pane: PaneRole) => void;
  readonly onCreateTestbench: (designFileId: string) => void;
}

export const otherPane = (pane: PaneRole): PaneRole => (pane === 'tb' ? 'rtl' : 'tb');
export const paneFile = (d: EditorDisplay, pane: PaneRole): string | undefined => d.pair[pane]?.fileId;

export function editorPropsFor(ctx: ModelContext, split: EditorSplit, chip: ReactNode): EditorSplitProps {
  const d = ctx.display;
  const tabIcon = (id: string) => <RoleIcon role={effectiveFile(ctx.project, ctx.overrides, id)?.role} />;
  if (!d) return { tabIcon };
  const stripEnd = (
    <>
      {chip}
      <ViewSwitch view={narrowView(d.view, d.focusedPane, split.canSplit)} bothDisabled={!split.canSplit} onChange={ctx.onPin} />
    </>
  );
  const visibleTabId = d.view === 'both' ? paneFile(d, otherPane(d.focusedPane)) ?? null : null;
  // A design with no testbench, shown alone, keeps the plain editor of before the split.
  const plainDesign = d.view === 'rtl' && !d.pair.tb && d.pair.rtl !== null;
  if (plainDesign) return { tabIcon, stripEnd, visibleTabId };
  return { tabIcon, stripEnd, visibleTabId, split: splitEditorProps(ctx, d, split) };
}

function splitEditorProps(ctx: ModelContext, d: EditorDisplay, split: EditorSplit): SplitEditorProps {
  return {
    view: d.view,
    focusedPane: d.focusedPane,
    onFocusPane: ctx.onFocusPane,
    tb: paneModel(ctx, d, 'tb'),
    rtl: paneModel(ctx, d, 'rtl'),
    split,
  };
}

/** One pane's content: its file with header and reveal, or its empty state (§ 4.6). */
function paneModel(ctx: ModelContext, d: EditorDisplay, pane: PaneRole): SplitPaneModel {
  const target = d.pair[pane];
  const file = target && ctx.files.find((f) => f.id === target.fileId);
  if (!target || !file) return { kind: 'empty', empty: emptyModel(ctx, d, pane) };
  const showsFileTwice = paneFile(d, otherPane(pane)) === file.id;
  const takesDiagnosticReveal = pane === d.focusedPane || !showsFileTwice;
  return {
    kind: 'file',
    file: { id: file.id, name: file.name, content: file.content },
    reveal: latestReveal(d.reveals[pane], takesDiagnosticReveal ? ctx.reveal : null, file.id),
    note: noTestbenchLeft(ctx, d, pane, file.id),
    header: {
      unit: unitOf(ctx.project, ctx.overrides, target),
      roleOverride: ctx.overrides.roles[file.id],
      run: ctx.paneRun(pane, target),
      regions: pane === 'tb' ? regionNav(ctx, d, file.id) : null,
      onSetRole: (role) => ctx.onSetRole(file.id, role),
      pairOptions: pairOptions(ctx.project, ctx.overrides, file.id, pane),
      onPairWith: (other) => (pane === 'tb' ? ctx.onPair(other, file.id) : ctx.onPair(file.id, other)),
    },
  };
}

function regionNav(ctx: ModelContext, d: EditorDisplay, fileId: string) {
  const regions = effectiveFile(ctx.project, ctx.overrides, fileId)?.regions ?? [];
  if (regions.length === 0) return null;
  const index = Math.min(d.regionIndex, regions.length - 1);
  return { index, count: regions.length, label: regions[index].label, onStep: ctx.onStepRegion };
}

/** The newer of the pane's own reveal and a diagnostic reveal of its file. */
function latestReveal(own: RevealRequest | null, diagnostic: RevealRequest | null, fileId: string): RevealRequest | null {
  const candidate = diagnostic?.fileId === fileId ? diagnostic : null;
  if (!own) return candidate;
  return candidate && candidate.id > own.id ? candidate : own;
}

/** § 4.6: a single-file pair whose testbench code was deleted; no automatic collapse (D7). */
function noTestbenchLeft(ctx: ModelContext, d: EditorDisplay, pane: PaneRole, fileId: string): ReactNode {
  if (pane !== 'tb' || d.view !== 'both') return null;
  const file = effectiveFile(ctx.project, ctx.overrides, fileId);
  const pairedByHand = ctx.overrides.pairs[d.pair.rtl?.fileId ?? ''] === fileId;
  const hasTestbench = file?.units.some((u) => u.role === 'tb') ?? true;
  if (hasTestbench || pairedByHand) return null;
  return (
    <p className="wb-split__note" role="note">
      {TEXT.noTestbenchCodeLeft}
      <button type="button" onClick={() => ctx.onPin('rtl')}>
        {TEXT.closeSplit}
      </button>
    </p>
  );
}

function emptyModel(ctx: ModelContext, d: EditorDisplay, pane: PaneRole): Extract<SplitPaneModel, { kind: 'empty' }>['empty'] {
  const other = d.pair[otherPane(pane)];
  const otherFile = other ? ctx.files.find((f) => f.id === other.fileId) : undefined;
  const options = otherFile ? pairOptions(ctx.project, ctx.overrides, otherFile.id, otherPane(pane)) : [];
  const onShowOther = () => ctx.onPin(otherPane(pane));
  if (pane === 'tb') {
    return {
      message: noTestbenchFor(otherFile?.name ?? ''),
      onCreate: otherFile ? () => ctx.onCreateTestbench(otherFile.id) : undefined,
      pairOptions: options,
      onPairWith: (tbId) => otherFile && ctx.onPair(otherFile.id, tbId),
      onShowOther,
    };
  }
  return {
    message: d.pair.missingDut ? notInProject(d.pair.missingDut) : TEXT.noInstance,
    pairOptions: options,
    onPairWith: (designId) => otherFile && ctx.onPair(designId, otherFile.id),
    onShowOther,
  };
}
