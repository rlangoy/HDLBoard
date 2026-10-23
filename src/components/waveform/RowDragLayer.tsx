// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * What a reorder looks like (docs/imp_wave_rearange.md § 4.1, § 5.5), drawn over the
 * list and the canvas together, in list coordinates: the veil over the dragged signal's
 * rows, the insertion line across names, values and traces, the ghost that follows the
 * pointer, the hint when the pointer is over another section, and the flash on the rows
 * of a signal that has just moved. It reads the drag store only, so the list and the
 * canvas stay still while the pointer moves. It never takes the mouse.
 */

import { useSyncExternalStore, type CSSProperties } from 'react';
import { cx } from '../board';
import { IDLE, type DragStore, type DragView, type Dragged } from './dragStore';
import { blockOf, type Block, type Section } from './signalOrder';
import { AXIS_HEIGHT, ROW_HEIGHT } from './waveDraw';
import { GripIcon } from './waveIcons';

/** The ghost starts right of the insertion line's ring, so the ring stays in sight. */
const GHOST_LEFT_PX = 20;
const GHOST_RIGHT_PX = 4;

export interface RowDragLayerProps {
  readonly store: DragStore;
  /** The sections as the list is now: where a signal that has just moved landed. */
  readonly sections: readonly Section[];
  readonly namesWidth: number;
}

const band = (block: Pick<Block, 'top' | 'bottom'>): CSSProperties => ({ top: block.top, height: block.bottom - block.top });

/** How many bit rows a block has below its own: an unfolded vector's. */
const bitsOf = (block: Block): number => Math.round((block.bottom - block.top) / ROW_HEIGHT) - 1;

function Ghost({ dragged, top, refused, namesWidth }: { readonly dragged: Dragged; readonly top: number; readonly refused?: string; readonly namesWidth: number }) {
  const bits = bitsOf(dragged.block);
  const style = { top, left: GHOST_LEFT_PX, width: Math.max(0, namesWidth - GHOST_LEFT_PX - GHOST_RIGHT_PX), height: ROW_HEIGHT };
  return (
    <div className={cx('wv-drag__ghost', `tone-${dragged.section.tone}`, refused !== undefined && 'is-refused')} style={style}>
      <GripIcon className="wv-drag__ghost-grip" />
      <span className="wv-drag__ghost-name">{dragged.block.label}</span>
      {bits > 0 && <span className="wv-drag__ghost-bits">+{bits} bits</span>}
      {refused !== undefined && <span className="wv-drag__hint">Moves only within {refused}</span>}
    </div>
  );
}

/** The ghost while dragged, and while it glides back after a cancel – one element, so the glide is a transition. */
function ghostOf(view: DragView): { readonly dragged: Dragged; readonly top: number; readonly refused?: string } | null {
  if (view.kind === 'returning') return { dragged: view.dragged, top: view.dragged.block.top };
  if (view.kind !== 'dragging') return null;
  const refused = view.target.kind === 'other-section' ? view.target.label : undefined;
  return { dragged: view.dragged, top: view.ghostTop, refused };
}

function Veil({ block, namesWidth }: { readonly block: Block; readonly namesWidth: number }) {
  return (
    <div className="wv-drag__veil" style={band(block)}>
      <div className="wv-drag__veil-names" style={{ width: namesWidth }} />
    </div>
  );
}

function Landed({ view, sections, store }: { readonly view: Extract<DragView, { kind: 'landed' }>; readonly sections: readonly Section[]; readonly store: DragStore }) {
  const found = blockOf(sections, view.path);
  if (found === undefined) return null;
  const done = () => {
    if (store.get() === view) store.set(IDLE);
  };
  return <div key={view.id} className="wv-drag__flash" style={band(found.section.blocks[found.index])} onAnimationEnd={done} />;
}

export function RowDragLayer({ store, sections, namesWidth }: RowDragLayerProps) {
  const view = useSyncExternalStore(store.subscribe, store.get);
  if (view.kind === 'idle') return null;
  const ghost = ghostOf(view);
  const dragging = view.kind === 'dragging' ? view : null;
  return (
    <div className="wv-drag" style={{ top: AXIS_HEIGHT }} aria-hidden="true">
      {dragging !== null && <Veil block={dragging.dragged.block} namesWidth={namesWidth} />}
      {dragging?.target.kind === 'slot' && <div className="wv-drag__line" style={{ top: dragging.target.lineY }} />}
      {ghost !== null && <Ghost dragged={ghost.dragged} top={ghost.top} refused={ghost.refused} namesWidth={namesWidth} />}
      {view.kind === 'landed' && <Landed view={view} sections={sections} store={store} />}
    </div>
  );
}
