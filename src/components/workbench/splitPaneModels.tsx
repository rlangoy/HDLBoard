// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import type { ReactNode } from 'react';
import { EmptyPaneHeader, PlainPaneHeader, RolePaneHeader, type PaneRun } from './EditorPaneHeader';
import { narrowView, withCurrentUnit, type EditorView, type PaneRole } from './editorView';
import { FileNameButton, type FileMenuProps } from './FileMenu';
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
 * What CodeEditor is given to show its panes (docs/impl_split_screen.md § 4.1–4.6;
 * docs/cleanup_file_tabs.md § 5.2, § 5.3): each pane's header and content, and the
 * view switch at the right end of the rightmost header. Turns the split's state
 * into props; holds none itself.
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
  /** The project's files for the header's file menu. */
  readonly fileMenu: FileMenuProps;
}

export const otherPane = (pane: PaneRole): PaneRole => (pane === 'tb' ? 'rtl' : 'tb');
export const paneFile = (d: EditorDisplay, pane: PaneRole): string | undefined => d.pair[pane]?.fileId;

/** The panes for what is shown, or none while nothing is (an empty project). */
export function editorPropsFor(ctx: ModelContext, split: EditorSplit, chip: ReactNode): SplitEditorProps | undefined {
  const d = ctx.display;
  if (!d) return undefined;
  const shown = narrowView(d.view, d.focusedPane, split.canSplit);
  const end = (
    <>
      {chip}
      <ViewSwitch view={shown} bothDisabled={!split.canSplit} onChange={ctx.onPin} />
    </>
  );
  const rightmost: PaneRole = shown === 'tb' ? 'tb' : 'rtl';
  const endOf = (pane: PaneRole) => (pane === rightmost ? end : null);
  return {
    view: d.view,
    focusedPane: d.focusedPane,
    onFocusPane: ctx.onFocusPane,
    tb: paneModel(ctx, d, 'tb', endOf('tb')),
    rtl: paneModel(ctx, d, 'rtl', endOf('rtl')),
    split,
  };
}

/** One pane's header and content: its file, or its empty state (§ 4.6). */
function paneModel(ctx: ModelContext, d: EditorDisplay, pane: PaneRole, end: ReactNode): SplitPaneModel {
  const shownTarget = d.pair[pane];
  const file = shownTarget && ctx.files.find((f) => f.id === shownTarget.fileId);
  if (!shownTarget || !file) return { kind: 'empty', header: <EmptyPaneHeader pane={pane} end={end} />, empty: emptyModel(ctx, d, pane) };
  // The badge, Play / Stop and a run follow a unit renamed since the pair was shown.
  const target = withCurrentUnit(shownTarget, effectiveFile(ctx.project, ctx.overrides, file.id), pane);
  const showsFileTwice = paneFile(d, otherPane(pane)) === file.id;
  const takesDiagnosticReveal = pane === d.focusedPane || !showsFileTwice;
  return {
    kind: 'file',
    file: { id: file.id, name: file.name, content: file.content },
    reveal: latestReveal(d.reveals[pane], takesDiagnosticReveal ? ctx.reveal : null, file.id),
    note: noTestbenchLeft(ctx, d, pane, file.id),
    header: isPlainDesign(d) ? plainHeader(ctx, { pane, target, file, end }) : roleHeader(ctx, d, { pane, target, file, end }),
  };
}

/** A pane showing a file, as its header needs it. */
interface ShownFile {
  readonly pane: PaneRole;
  readonly target: PaneTarget;
  readonly file: VhdlFile;
  /** The chip and view switch, in the rightmost pane only. */
  readonly end: ReactNode;
}

/** A design with no testbench, shown alone: the plain header (cleanup_file_tabs.md § 5.2). */
const isPlainDesign = (d: EditorDisplay): boolean => d.view === 'rtl' && !d.pair.tb && d.pair.rtl !== null;

function plainHeader(ctx: ModelContext, { pane, target, file, end }: ShownFile): ReactNode {
  const role = effectiveFile(ctx.project, ctx.overrides, file.id)?.role;
  const nameButton = fileNameButton(ctx, file, <RoleIcon role={role} />);
  return <PlainPaneHeader fileName={file.name} nameButton={nameButton} code={file.content} run={ctx.paneRun(pane, target)} end={end} />;
}

function roleHeader(ctx: ModelContext, d: EditorDisplay, { pane, target, file, end }: ShownFile): ReactNode {
  return (
    <RolePaneHeader
      pane={pane}
      fileName={file.name}
      nameButton={fileNameButton(ctx, file)}
      code={file.content}
      run={ctx.paneRun(pane, target)}
      end={end}
      unit={unitOf(ctx.project, ctx.overrides, target)}
      roleOverride={ctx.overrides.roles[file.id]}
      regions={pane === 'tb' ? regionNav(ctx, d, file.id) : null}
      onSetRole={(role) => ctx.onSetRole(file.id, role)}
      pairOptions={pairOptions(ctx.project, ctx.overrides, file.id, pane)}
      onPairWith={(other) => (pane === 'tb' ? ctx.onPair(other, file.id) : ctx.onPair(file.id, other))}
    />
  );
}

/** The file's name as the button that opens the file menu; plain text if its row is missing. */
function fileNameButton(ctx: ModelContext, file: VhdlFile, icon?: ReactNode): ReactNode {
  const row = ctx.fileMenu.rows.find((r) => r.id === file.id);
  if (!row) return <span className="wb-filename__text">{file.name}</span>;
  return <FileNameButton row={row} icon={icon} menu={ctx.fileMenu} />;
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
