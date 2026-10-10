// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import { useEffect, useRef, type CSSProperties, type ReactNode } from 'react';
import { cx } from '../board';
import type { DiagnosticsByFile, LineDiagnostic } from './diagnosticStore';
import { EditorSurface, type EditorTab } from './EditorSurface';
import { narrowView, type EditorView, type PaneRole } from './editorView';
import { clampFraction } from './editorSplit';
import { FindBar } from './find/FindBar';
import { FindContext } from './find/FindContext';
import { useFind, type FindController } from './find/useFind';
import { TestbenchEmptyState, type TestbenchEmptyStateProps } from './TestbenchEmptyState';
import { TEXT, rtlPaneLabel, tbPaneLabel } from './testbenchText';
import type { FileSymbols } from './symbols/fileSymbols';
import type { HdlSymbol, Occurrence } from './symbols/types';
import { useFileSymbols } from './symbols/useFileSymbols';
import { useLinkedHighlight } from './symbols/useLinkedHighlight';
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
 * With both panes showing, a symbol highlighted in one also lights the names
 * wired to it in the other (symbols/useLinkedHighlight.ts).
 * Each pane has its own search (docs/impl_search.md S1, D4), kept here so a pane
 * hidden for a while keeps its query.
 */
export function SplitEditor({ view, focusedPane, onFocusPane, tb, rtl, split, ...shared }: SplitEditorProps & SharedProps) {
  const shown = narrowView(view, focusedPane, split.canSplit);
  const both = shown === 'both';
  const symbols = {
    tb: useFileSymbols(tb.kind === 'file' ? tb.file : undefined),
    rtl: useFileSymbols(rtl.kind === 'file' ? rtl.file : undefined),
  };
  const link = useLinkedHighlight(both, symbols);
  const find = {
    tb: useFind(tb.kind === 'file' ? tb.file : undefined),
    rtl: useFind(rtl.kind === 'file' ? rtl.file : undefined),
  };
  useFindShortcuts(find, shown, focusedPane, { tb: tb.kind === 'file', rtl: rtl.kind === 'file' });
  // A fraction stored for a wider column (or older, smaller minimums) still keeps each pane at its minimum.
  const fraction = clampFraction(split.prefs.tbFraction, split.bounds);
  const tracks =
    split.dragCollapsed === 'tb'
      ? ['0px', '1fr']
      : split.dragCollapsed === 'rtl'
        ? ['1fr', '0px']
        : [`${fraction}fr`, `${1 - fraction}fr`];
  const style = { '--wb-split-tb': tracks[0], '--wb-split-rtl': tracks[1] } as CSSProperties;
  const pane = (role: PaneRole, model: SplitPaneModel) => (
    <SplitPane
      role={role}
      model={model}
      focused={focusedPane === role}
      onFocus={() => onFocusPane(role)}
      hidden={split.dragCollapsed === role}
      symbols={symbols[role]}
      linkedOccurrences={link.linked[role]}
      onHighlightChange={link.onHighlightChange[role]}
      highlightsCursor={!both || focusedPane === role}
      find={find[role]}
      {...shared}
    />
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

interface PaneProps {
  role: PaneRole;
  model: SplitPaneModel;
  focused: boolean;
  onFocus: () => void;
  hidden: boolean;
  /** The analysis of the pane's file; undefined when the pane is empty. */
  symbols: FileSymbols | undefined;
  linkedOccurrences: ReadonlyMap<number, readonly Occurrence[]> | undefined;
  onHighlightChange: (symbol: HdlSymbol | undefined) => void;
  /** With both panes showing, only the focused one highlights the symbol at its cursor. */
  highlightsCursor: boolean;
  /** This pane's own search (docs/impl_search.md S1). */
  find: FindController;
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
  symbols,
  linkedOccurrences,
  onHighlightChange,
  highlightsCursor,
  find,
}: PaneProps & SharedProps) {
  const label = model.kind === 'file' ? (role === 'tb' ? tbPaneLabel : rtlPaneLabel)(model.file.name) : role === 'tb' ? TEXT.tbTooltip : TEXT.rtlTooltip;
  return (
    <section
      id={role === 'tb' ? TB_PANE_ID : RTL_PANE_ID}
      className={cx('wb-split__pane', `is-${role}`, focused && 'is-focused', hidden && 'is-drag-hidden')}
      aria-label={label}
      data-find-pane={role}
    >
      <FindContext.Provider value={model.kind === 'file' ? find : null}>
      {model.header}
      {model.kind === 'empty' ? (
        <TestbenchEmptyState pane={role} {...model.empty} />
      ) : (
        symbols && (
          <>
            <div className="wb-split__findslot" onFocus={onFocus}>
              <FindBar fileName={model.file.name} />
            </div>
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
              symbols={symbols}
              linkedOccurrences={linkedOccurrences}
              onHighlightChange={onHighlightChange}
              highlightsCursor={highlightsCursor}
              findDecor={find.decor}
              findAttach={find.attach}
              onFindEscape={() => {
                if (!find.open) return false;
                find.close();
                return true;
              }}
            />
          </>
        )
      )}
      </FindContext.Provider>
    </section>
  );
}

/**
 * Ctrl/Cmd+F and Ctrl/Cmd+H (docs/impl_search.md D10, D11): open the Find bar of
 * the pane with the text cursor, taking its one-line selection as the query.
 * Pressed inside a pane's Find bar, they act on that pane. Not while a modal
 * dialog is open.
 */
function useFindShortcuts(
  find: Readonly<Record<PaneRole, FindController>>,
  shown: EditorView,
  focusedPane: PaneRole,
  hasFile: Readonly<Record<PaneRole, boolean>>,
) {
  const latest = useRef({ find, shown, focusedPane, hasFile });
  latest.current = { find, shown, focusedPane, hasFile };
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase();
      if (!(e.ctrlKey || e.metaKey) || e.altKey || e.shiftKey || (key !== 'f' && key !== 'h')) return;
      if (document.querySelector('[role="dialog"][aria-modal="true"]')) return;
      const pane = shortcutPane(latest.current, e.target);
      if (!pane) return;
      e.preventDefault();
      latest.current.find[pane].openBar({ seedFromSelection: true, replace: key === 'h' });
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);
}

function shortcutPane(
  { shown, focusedPane, hasFile }: { shown: EditorView; focusedPane: PaneRole; hasFile: Readonly<Record<PaneRole, boolean>> },
  target: EventTarget | null,
): PaneRole | null {
  const inPane = target instanceof Element ? target.closest('[data-find-pane]')?.getAttribute('data-find-pane') : null;
  const visible = (pane: PaneRole) => (shown === 'both' || shown === pane) && hasFile[pane];
  if ((inPane === 'tb' || inPane === 'rtl') && visible(inPane)) return inPane;
  if (visible(focusedPane)) return focusedPane;
  const other: PaneRole = focusedPane === 'tb' ? 'rtl' : 'tb';
  return visible(other) ? other : null;
}
