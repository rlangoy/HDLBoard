// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * The signal list with its value column (docs/waveform_viewer_spec.md § 8.6, S8): names
 * on the left, the value at the cursor beside each, as text in the DOM (NFR-10). Each
 * row lines up with its trace on the canvas. A real tree (`role="tree"`): instances and
 * records fold open, a tick box shows or hides a signal.
 */

import type { KeyboardEvent, MouseEvent } from 'react';
import { cx } from '../board';
import type { Trace } from './model';
import { formatValue, isUndefinedValue, type ShowAs } from './radix';
import type { Row, SignalPath } from './signalRows';
import { unavailableHelp } from './valueHelp';
import { valueAt } from './valueAt';
import { ROW_HEIGHT } from './waveDraw';

const INDENT_PX = 14;
/** Vectors up to this width show hexadecimal and decimal in their tooltip (FR-23). */
const BOTH_RADIXES_MAX_WIDTH = 16;

export interface SignalListProps {
  readonly rows: readonly Row[];
  readonly traces: ReadonlyMap<number, Trace>;
  readonly cursor: number;
  readonly showAsOf: (path: SignalPath) => ShowAs;
  readonly selected: string | null;
  onSelect(path: string): void;
  onToggleShown(path: SignalPath): void;
  onToggleOpen(path: string): void;
  onShowAll(): void;
  onContextMenu(path: SignalPath, x: number, y: number): void;
  onGoToDeclaration(path: SignalPath): void;
}

function widthText(width: number, range: { left: number; right: number } | undefined): string {
  return range === undefined ? `${width} bit${width === 1 ? '' : 's'}` : `${width} bits (${range.left} downto ${range.right})`;
}

function Chevron({ open }: { open: boolean }) {
  return (
    <span className="wv-list__chevron" aria-hidden="true">
      {open ? '▾' : '▸'}
    </span>
  );
}

export function SignalList(props: SignalListProps) {
  const { rows, traces, cursor, showAsOf, selected } = props;

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>, row: Row) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      if (row.kind === 'signal') props.onToggleShown(row.path);
      else if (row.kind === 'scope' || row.kind === 'group') props.onToggleOpen(row.path);
      else if (row.kind === 'more') props.onShowAll();
    } else if ((event.key === 'ArrowRight' || event.key === 'ArrowLeft') && (row.kind === 'scope' || row.kind === 'group')) {
      if (row.open === (event.key === 'ArrowLeft')) props.onToggleOpen(row.path);
    } else if (event.key === 'ContextMenu' && row.kind === 'signal') {
      const box = event.currentTarget.getBoundingClientRect();
      props.onContextMenu(row.path, box.left + 40, box.bottom);
    }
  };

  const contextMenu = (event: MouseEvent, row: Row) => {
    if (row.kind !== 'signal') return;
    event.preventDefault();
    props.onContextMenu(row.path, event.clientX, event.clientY);
  };

  return (
    <div className="wv-list" role="tree" aria-label="Signals">
      {rows.map((row) => {
        const indent = { paddingLeft: 8 + row.depth * INDENT_PX, height: ROW_HEIGHT };
        const common = {
          role: 'treeitem',
          tabIndex: selected === row.path ? 0 : -1,
          onFocus: () => props.onSelect(row.path),
          onKeyDown: (e: KeyboardEvent<HTMLDivElement>) => onKeyDown(e, row),
          onContextMenu: (e: MouseEvent) => contextMenu(e, row),
        };
        switch (row.kind) {
          case 'scope':
          case 'group':
            return (
              <div
                key={row.path}
                {...common}
                aria-expanded={row.open}
                className={cx('wv-list__row', 'is-folder', selected === row.path && 'is-selected')}
                style={indent}
                onClick={() => props.onToggleOpen(row.path)}
                title={row.kind === 'group' ? `${row.signal.kind === 'record' ? 'Record' : 'Array'} – click to show its parts` : undefined}
              >
                <Chevron open={row.open} />
                <span className="wv-list__name">{row.kind === 'scope' ? row.name : row.signal.name}</span>
              </div>
            );
          case 'more':
            return (
              <div key={row.path} {...common} className={cx('wv-list__row', 'is-more', selected === row.path && 'is-selected')} style={indent} onClick={props.onShowAll}>
                <span className="wv-list__more">
                  {row.count} more signal{row.count === 1 ? '' : 's'} – <u>Show all</u>
                </span>
              </div>
            );
          case 'unavailable':
            return (
              <div key={row.path} {...common} className={cx('wv-list__row', 'is-unavailable')} style={indent} title={unavailableHelp(row.reason)}>
                <span className="wv-list__check" aria-hidden="true" />
                <span className="wv-list__name">{row.name}</span>
                <span className="wv-list__value">not recorded</span>
              </div>
            );
          case 'signal': {
            const trace = traces.get(row.signal.trace);
            const raw = trace === undefined ? undefined : valueAt(trace, cursor);
            const showAs = showAsOf(row.path);
            const text = raw === undefined ? '' : formatValue(row.signal, raw, showAs);
            const both =
              raw !== undefined && row.signal.kind === 'vector' && row.signal.width <= BOTH_RADIXES_MAX_WIDTH
                ? ` = ${formatValue(row.signal, raw, 'hex')} = ${formatValue(row.signal, raw, 'decimal')}`
                : '';
            return (
              <div
                key={row.path}
                {...common}
                aria-selected={selected === row.path}
                className={cx('wv-list__row', !row.shown && 'is-hidden', selected === row.path && 'is-selected')}
                style={indent}
                title={`${row.signal.name} – ${row.signal.enumType ? row.signal.enumType.name : widthText(row.signal.width, row.signal.range)}. Double-click to go to its declaration.`}
                onDoubleClick={() => props.onGoToDeclaration(row.path)}
              >
                <input
                  type="checkbox"
                  className="wv-list__check"
                  checked={row.shown}
                  tabIndex={-1}
                  aria-label={`Show ${row.signal.name}`}
                  onChange={() => props.onToggleShown(row.path)}
                  onClick={(e) => e.stopPropagation()}
                />
                <span className="wv-list__name">{row.signal.name}</span>
                <span
                  className={cx('wv-list__value', raw !== undefined && isUndefinedValue(row.signal, raw) && 'is-undefined')}
                  title={both ? `${row.signal.name}${both}` : undefined}
                  aria-label={`${row.signal.name} is ${text || 'not set yet'}`}
                >
                  {text}
                </span>
              </div>
            );
          }
        }
      })}
    </div>
  );
}
