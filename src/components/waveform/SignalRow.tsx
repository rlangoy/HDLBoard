// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * One row of the signal list, by kind: a section's head, a shown signal (with its trace
 * on the canvas beside it), a signal not shown, a record, a folder, and a signal the
 * format could not carry. Each row lines up with the canvas: `ROW_HEIGHT` high, values
 * as text in the DOM (NFR-10), tinted in its section's colour.
 */

import { useState, type KeyboardEvent, type MouseEvent, type ReactNode } from 'react';
import { cx } from '../board';
import { ChipIcon, FlaskIcon } from '../workbench/icons';
import type { Trace } from './model';
import { formatValue, isUndefinedValue, type ShowAs } from './radix';
import type { Row, SectionRow, TraceRow } from './signalRows';
import { valueAt } from './valueAt';
import { unavailableHelp } from './valueHelp';
import { ROW_HEIGHT } from './waveDraw';

const INDENT_PX = 14;
const TIP_INSET_PX = 24;
const TIP_GAP_PX = 2;
const BASE_INDENT_PX = 8;

export interface RowCallbacks {
  onSelect(path: string): void;
  onToggleShown(path: string): void;
  onToggleOpen(path: string): void;
  onToggleExpanded(path: string): void;
  onContextMenu(path: string, x: number, y: number): void;
  onGoToDeclaration(path: string): void;
}

export interface RowContext {
  /** The cursor, while it is shown; the values beside the names are left out without it. */
  readonly cursor: number | undefined;
  readonly traces: ReadonlyMap<number, Trace>;
  readonly showAsOf: (path: string) => ShowAs;
  readonly selected: string | null;
  readonly on: RowCallbacks;
  /** The file a scope's unit is in, named in a section head's tooltip. */
  readonly fileOfScope?: (scopes: readonly string[]) => string | undefined;
}

/** The value at the cursor, or none while the cursor is hidden. */
const valueAtCursor = (trace: Trace, cursor: number | undefined): string | undefined => (cursor === undefined ? undefined : valueAt(trace, cursor));

function Chevron({ open, label, onClick }: { readonly open: boolean; readonly label: string; readonly onClick?: () => void }) {
  return (
    <button
      type="button"
      className="wv-list__chevron"
      tabIndex={-1}
      aria-label={label}
      // With its own action it keeps the click from the row; without, the row's click folds it.
      onClick={(e) => {
        if (onClick === undefined) return;
        e.stopPropagation();
        onClick();
      }}
    >
      {open ? '▾' : '▸'}
    </button>
  );
}

/** A value at the cursor, red when it holds U, X or W. */
function Value({ text, undefinedValue, title }: { readonly text: string; readonly undefinedValue: boolean; readonly title?: string }) {
  return (
    <span className={cx('wv-list__value', undefinedValue && 'is-undefined')} title={title}>
      {text}
    </span>
  );
}

function ShowBox({ path, name, shown, on }: { readonly path: string; readonly name: string; readonly shown: boolean; readonly on: RowCallbacks }) {
  return (
    <input
      type="checkbox"
      className="wv-list__check"
      checked={shown}
      tabIndex={-1}
      title={shown ? 'Shown – untick to hide the trace' : 'Not shown – tick to show the trace'}
      aria-label={`Show ${name}`}
      onChange={() => on.onToggleShown(path)}
      onClick={(e) => e.stopPropagation()}
    />
  );
}

/** The row frame every kind shares: the tree item, its indent, colour, selection and keys. */
function RowFrame(props: {
  readonly row: Row;
  readonly context: RowContext;
  readonly gapAbove?: number;
  /** The row's box when the mouse comes onto it, null when it leaves. */
  readonly onHover?: (box: DOMRect | null) => void;
  readonly className?: string;
  readonly title?: string;
  readonly expanded?: boolean;
  readonly onActivate?: () => void;
  readonly children: ReactNode;
}) {
  const { row, context, className, title, expanded, onActivate, gapAbove, onHover, children } = props;
  const selected = context.selected === row.path;
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => keyOnRow(event, row, context.on);
  const onContextMenu = (event: MouseEvent) => {
    if (row.kind !== 'trace' && row.kind !== 'hidden') return;
    event.preventDefault();
    context.on.onContextMenu(row.path, event.clientX, event.clientY);
  };
  return (
    <div
      role="treeitem"
      aria-selected={selected}
      aria-expanded={expanded}
      tabIndex={selected ? 0 : -1}
      className={cx('wv-list__row', `tone-${row.tone}`, className, selected && 'is-selected')}
      style={{ paddingLeft: BASE_INDENT_PX + row.depth * INDENT_PX, height: ROW_HEIGHT, marginTop: gapAbove }}
      title={title}
      onFocus={() => context.on.onSelect(row.path)}
      onClick={onActivate}
      onKeyDown={onKeyDown}
      onContextMenu={onContextMenu}
      onMouseEnter={onHover && ((event) => onHover(event.currentTarget.getBoundingClientRect()))}
      onMouseLeave={onHover && (() => onHover(null))}
    >
      {children}
    </div>
  );
}

/** What Enter or Space does on a row: show or hide a signal, fold or unfold a folder. */
function toggleFor(row: Row, on: RowCallbacks): (() => void) | undefined {
  if (row.kind === 'hidden' || (row.kind === 'trace' && row.parent === undefined)) return () => on.onToggleShown(row.path);
  if (row.kind === 'section' || row.kind === 'folder' || row.kind === 'group') return () => on.onToggleOpen(row.path);
  return undefined;
}

/** Enter/Space toggle a row, the context-menu key opens the menu (NFR-10). */
function keyOnRow(event: KeyboardEvent<HTMLDivElement>, row: Row, on: RowCallbacks): void {
  if (event.key === 'ContextMenu') {
    const box = event.currentTarget.getBoundingClientRect();
    on.onContextMenu(row.path, box.left, box.bottom);
    return;
  }
  const toggle = event.key === 'Enter' || event.key === ' ' ? toggleFor(row, on) : undefined;
  if (toggle === undefined) return;
  event.preventDefault();
  toggle();
}

function TraceRowView({ row, context }: { readonly row: TraceRow; readonly context: RowContext }) {
  const raw = valueAtCursor(row.trace, context.cursor);
  const text = raw === undefined ? '' : formatValue(row.signal, raw, context.showAsOf(row.path));
  const isBit = row.parent !== undefined;
  return (
    <RowFrame row={row} context={context} className={cx('is-shown', isBit && 'is-bit')} expanded={row.expandable ? row.expanded : undefined}
      title={`${row.label}. Double-click to go to its declaration.`}>
      {isBit ? <span className="wv-list__spacer" /> : <ShowBox path={row.path} name={row.label} shown on={context.on} />}
      {row.expandable ? (
        <Chevron open={row.expanded} label={row.expanded ? 'Fold the bits' : 'Show every bit'} onClick={() => context.on.onToggleExpanded(row.path)} />
      ) : (
        <span className="wv-list__chevron-space" />
      )}
      <span className="wv-list__name" onDoubleClick={() => context.on.onGoToDeclaration(row.parent ?? row.path)}>
        {row.label}
      </span>
      <Value text={text} undefinedValue={raw !== undefined && isUndefinedValue(row.signal, raw)} />
    </RowFrame>
  );
}

function HiddenRowView({ row, context }: { readonly row: Extract<Row, { kind: 'hidden' }>; readonly context: RowContext }) {
  const trace = context.traces.get(row.signal.trace);
  const raw = trace === undefined ? undefined : valueAtCursor(trace, context.cursor);
  return (
    <RowFrame row={row} context={context} className="is-hidden" title={`${row.signal.name} – tick to show its trace. Double-click to go to its declaration.`}>
      <ShowBox path={row.path} name={row.signal.name} shown={false} on={context.on} />
      <span className="wv-list__name" onDoubleClick={() => context.on.onGoToDeclaration(row.path)}>
        {row.signal.name}
      </span>
      <Value text={raw === undefined ? '' : formatValue(row.signal, raw, context.showAsOf(row.path))} undefinedValue={false} />
    </RowFrame>
  );
}

function FolderRowView({ row, context }: { readonly row: Extract<Row, { kind: 'folder' | 'group' }>; readonly context: RowContext }) {
  const label = row.kind === 'folder' ? row.label : row.signal.name;
  const note = row.kind === 'folder' ? `${row.count} not shown` : undefined;
  return (
    <RowFrame row={row} context={context} className="is-folder" expanded={row.open} onActivate={() => context.on.onToggleOpen(row.path)}
      title={row.kind === 'folder' ? `${label}: signals not shown – unfold to tick them` : 'Unfold to show its parts'}>
      <Chevron open={row.open} label={row.open ? `Fold ${label}` : `Unfold ${label}`} />
      <span className="wv-list__name">{label}</span>
      {note !== undefined && <span className="wv-list__count">{note}</span>}
    </RowFrame>
  );
}

/** A section head's tooltip: the file in bold, `– the design instance dut`, then what a click does. */
function SectionTip({ row, file, at }: { readonly row: SectionRow; readonly file: string | undefined; readonly at: { readonly x: number; readonly y: number } }) {
  const name = row.scopes[row.scopes.length - 1];
  const what = row.tone === 'testbench' ? `the testbench ${name}` : `the design instance ${name}`;
  return (
    <div className="wv-sectiontip" role="tooltip" style={{ left: at.x, top: at.y }}>
      <div>
        {file !== undefined && <strong>{file}</strong>}
        {file !== undefined ? ` – ${what}` : what}
      </div>
      <div className="wv-sectiontip__hint">{row.open ? 'Click to hide the signals not shown.' : 'Click to show the signals not shown, to tick them.'}</div>
    </div>
  );
}

/** A section's head: its chevron shows or hides the signals that are not shown. */
function SectionRowView({ row, context, gapAbove }: { readonly row: SectionRow; readonly context: RowContext; readonly gapAbove?: number }) {
  const note = row.count === 0 ? 'all shown' : `${row.count} not shown`;
  // Under the head while the mouse is on it; fixed, so the list's scrolling box does not clip it.
  const [tipAt, setTipAt] = useState<{ x: number; y: number } | null>(null);
  const onHover = (box: DOMRect | null) => setTipAt(box === null ? null : { x: box.left + TIP_INSET_PX, y: box.bottom + TIP_GAP_PX });
  return (
    <RowFrame row={row} context={context} gapAbove={gapAbove} onHover={onHover} className="is-section" expanded={row.open}
      onActivate={() => context.on.onToggleOpen(row.path)}>
      <Chevron open={row.open} label={`${row.open ? 'Hide' : 'Show'} the signals not shown`} />
      {/* The editor's role icons: the flask for the testbench, the chip for a design. */}
      {row.tone === 'testbench' ? <FlaskIcon className="wv-list__section-icon" aria-hidden="true" /> : <ChipIcon className="wv-list__section-icon" aria-hidden="true" />}
      <span className="wv-list__name">{row.label}</span>
      <span className="wv-list__count">{note}</span>
      {tipAt !== null && <SectionTip row={row} file={context.fileOfScope?.(row.scopes)} at={tipAt} />}
    </RowFrame>
  );
}

function UnavailableRowView({ row, context }: { readonly row: Extract<Row, { kind: 'unavailable' }>; readonly context: RowContext }) {
  return (
    <RowFrame row={row} context={context} className="is-unavailable" title={unavailableHelp(row.reason)}>
      <span className="wv-list__spacer" />
      <span className="wv-list__name">{row.name}</span>
      <span className="wv-list__value">not recorded</span>
    </RowFrame>
  );
}

export function SignalRow({ row, context, gapAbove }: { readonly row: Row; readonly context: RowContext; readonly gapAbove?: number }) {
  switch (row.kind) {
    case 'section':
      return <SectionRowView row={row} context={context} gapAbove={gapAbove} />;
    case 'trace':
      return <TraceRowView row={row} context={context} />;
    case 'hidden':
      return <HiddenRowView row={row} context={context} />;
    case 'unavailable':
      return <UnavailableRowView row={row} context={context} />;
    default:
      return <FolderRowView row={row} context={context} />;
  }
}
