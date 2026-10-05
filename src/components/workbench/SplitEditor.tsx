// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import type { CSSProperties, ReactNode } from 'react';
import { cx } from '../board';
import type { DiagnosticsByFile, LineDiagnostic } from './diagnosticStore';
import { EditorSurface, type EditorTab } from './EditorSurface';
import { narrowView, type EditorView, type PaneRole } from './editorView';
import { clampFraction } from './editorSplit';
import { TestbenchEmptyState, type TestbenchEmptyStateProps } from './TestbenchEmptyState';
import { TEXT, rtlPaneLabel, tbPaneLabel } from './testbenchText';
import type { EditorSplit } from './useEditorSplit';
import type { RevealRequest } from './useRevealLine';
import './SplitEditor.css';

const TB_PANE_ID = 'wb-split-tb';
const RTL_PANE_ID = 'wb-split-rtl';
const NO_LINES: readonly LineDiagnostic[] = [];

/** What one pane shows under its header (docs/cleanup_file_tabs.md F3): a file, or an empty state. */
export type SplitPaneModel =
  | {
      readonly kind: 'file';
      readonly file: EditorTab;
      readonly header: ReactNode;
      readonly reveal: RevealRequest | null;
      /** A line above the code, e.g. "No testbench code left in this file." */
      readonly note?: ReactNode;
    }
  | { readonly kind: 'empty'; readonly header: ReactNode; readonly empty: Omit<TestbenchEmptyStateProps, 'pane'> };

export interface SplitEditorProps {
  /** The resolved view, before narrowing to one pane in a narrow column. */
  view: EditorView;
  focusedPane: PaneRole;
  onFocusPane: (pane: PaneRole) => void;
  tb: SplitPaneModel;
  rtl: SplitPaneModel;
  split: EditorSplit;
}

interface SharedProps {
  diagnostics: DiagnosticsByFile;
  onChange: (id: string, content: string) => void;
  onDismissDiagnostics?: (fileId: string) => void;
}

/**
 * The editor column as one or two panes (docs/impl_split_screen.md § 4.1, § 6.5),
 * each under its own header (docs/cleanup_file_tabs.md F3):
 * TB left, RTL right, the divider between. Exposes its state as
 * `data-editor-view` / `data-focused-pane` for CSS and the e2e scripts.
 */
export function SplitEditor({ view, focusedPane, onFocusPane, tb, rtl, split, ...shared }: SplitEditorProps & SharedProps) {
  const shown = narrowView(view, focusedPane, split.canSplit);
  const both = shown === 'both';
  // A fraction stored for a wider column (or older, smaller minimums) still keeps each pane at its minimum.
  const fraction = clampFraction(split.prefs.tbFraction, split.bounds);
  const columns = split.dragCollapsed === 'tb' ? [0, 1] : split.dragCollapsed === 'rtl' ? [1, 0] : [fraction, 1 - fraction];
  const style = { '--wb-split-tb': `${columns[0]}fr`, '--wb-split-rtl': `${columns[1]}fr` } as CSSProperties;
  const pane = (role: PaneRole, model: SplitPaneModel) => (
    <SplitPane role={role} model={model} focused={focusedPane === role} onFocus={() => onFocusPane(role)} hidden={split.dragCollapsed === role} {...shared} />
  );
  return (
    <div
      className={cx('wb-split', `is-${shown}`)}
      data-editor-view={shown}
      data-focused-pane={focusedPane}
      style={style}
      ref={split.columnRef}
    >
      {shown !== 'rtl' && pane('tb', tb)}
      {both && (
        <div
          className="wb-resizer wb-split__divider"
          role="separator"
          tabIndex={0}
          aria-orientation="vertical"
          aria-label={TEXT.resizeTestbenchEditor}
          aria-controls={TB_PANE_ID}
          aria-valuenow={Math.round(fraction * 100)}
          aria-valuemin={Math.round(split.bounds.min * 100)}
          aria-valuemax={Math.round(split.bounds.max * 100)}
          onPointerDown={split.onDividerPointerDown}
          onKeyDown={split.onDividerKeyDown}
          onDoubleClick={split.resetFraction}
        />
      )}
      {shown !== 'tb' && pane('rtl', rtl)}
    </div>
  );
}

function SplitPane({
  role,
  model,
  focused,
  onFocus,
  hidden,
  diagnostics,
  onChange,
  onDismissDiagnostics,
}: { role: PaneRole; model: SplitPaneModel; focused: boolean; onFocus: () => void; hidden: boolean } & SharedProps) {
  const label = model.kind === 'file' ? (role === 'tb' ? tbPaneLabel : rtlPaneLabel)(model.file.name) : role === 'tb' ? TEXT.tbTooltip : TEXT.rtlTooltip;
  return (
    <section
      id={role === 'tb' ? TB_PANE_ID : RTL_PANE_ID}
      className={cx('wb-split__pane', `is-${role}`, focused && 'is-focused', hidden && 'is-drag-hidden')}
      aria-label={label}
    >
      {model.header}
      {model.kind === 'empty' ? (
        <TestbenchEmptyState pane={role} {...model.empty} />
      ) : (
        <>
          {model.note}
          <EditorSurface
            file={model.file}
            diagnostics={diagnostics[model.file.id] ?? NO_LINES}
            onChange={onChange}
            onDismissDiagnostics={onDismissDiagnostics}
            reveal={model.reveal}
            label={label}
            announces={focused}
            onFocusWithin={onFocus}
          />
        </>
      )}
    </section>
  );
}
