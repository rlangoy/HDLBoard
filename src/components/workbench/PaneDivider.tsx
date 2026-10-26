// SPDX-License-Identifier: GPL-2.0-only
import type { PointerEventHandler } from 'react';
import { BOARD_DEFAULT_W, BOARD_MIN_W, SIDEBAR_DEFAULT_W, SIDEBAR_MIN_W, type SidePane } from './paneLayout';
import { PANE_IDS } from './usePaneLayout';
import './ColumnDivider.css';

const KEY_STEP_PX = 16;

interface PaneDividerProps {
  pane: SidePane;
  width: number;
  maxWidth: number;
  collapsed: boolean;
  onWidth: (width: number) => void;
  onPointerDown: PointerEventHandler<HTMLDivElement>;
}

export function PaneDivider({ pane, width, maxWidth, collapsed, onWidth, onPointerDown }: PaneDividerProps) {
  const sidebar = pane === 'sidebar';
  const minimum = sidebar ? SIDEBAR_MIN_W : BOARD_MIN_W;
  return <div className={`wb-resizer hdl-column-divider${collapsed ? ' is-beside-collapsed' : ''}`}
    role="separator" aria-orientation="vertical" aria-label={sidebar ? 'Resize Explorer' : 'Resize board panel'}
    aria-controls={PANE_IDS[pane].pane} aria-valuemin={0} aria-valuemax={Math.round(maxWidth)}
    aria-valuenow={collapsed ? 0 : Math.round(width)} aria-valuetext={collapsed ? 'Collapsed' : `${Math.round(width)} pixels`}
    tabIndex={0} title="Drag to resize (double-click to reset)" onPointerDown={onPointerDown}
    onDoubleClick={() => onWidth(sidebar ? SIDEBAR_DEFAULT_W : BOARD_DEFAULT_W)}
    onKeyDown={(event) => {
      const direction = { ArrowLeft: -1, ArrowRight: 1 }[event.key];
      if (direction === undefined) return;
      event.preventDefault(); event.stopPropagation();
      const delta = direction * (sidebar ? 1 : -1) * KEY_STEP_PX;
      if (collapsed && delta < 0) return;
      onWidth(Math.max(minimum, (collapsed ? 0 : width) + delta));
    }}>
    <span className="hdl-column-divider__grip" aria-hidden="true" />
  </div>;
}
