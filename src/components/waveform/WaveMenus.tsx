// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * The small menus of the waveform view (§ 8.6, S3): the ⋯ menu (Copy waveform, Figure
 * for a report, Download, Help), report mode's ⋯ menu (Copy to clipboard, Save SVG,
 * Save PNG – the band's own buttons, § 8.8)
 * and the right-click menu of a signal (Go to declaration, Show as, Move, Show/Remove).
 */

import { REPORT_DPI } from './figure/figureStyle';
import { SHOW_AS_LABELS, type ShowAs } from './radix';
import type { MoveStep } from './signalOrder';

/** Where a menu opens, in window coordinates. */
export interface MenuPlace {
  readonly x: number;
  readonly y: number;
}

function MenuFrame({ place, children }: { readonly place: MenuPlace; readonly children: React.ReactNode }) {
  return (
    <div className="wv-menu" role="menu" style={{ left: place.x, top: place.y }} onClick={(e) => e.stopPropagation()}>
      {children}
    </div>
  );
}

const COPY_HINT = 'Copy the waveform as it is on screen, as PNG and SVG';
const REPORT_HINT = 'Make a figure sized for print: copy it, or save it as SVG or PNG';

export interface MoreMenuProps {
  readonly place: MenuPlace;
  /** Whether there are traces on screen to copy or make a figure of. */
  readonly hasTraces: boolean;
  /** The format of the file Download saves, or undefined when there is none. */
  readonly format: string | undefined;
  readonly onCopyWaveform: () => void;
  readonly onReportFigure: () => void;
  readonly onDownload: () => void;
  readonly onHelp: () => void;
}

export function MoreMenu({ place, hasTraces, format, onCopyWaveform, onReportFigure, onDownload, onHelp }: MoreMenuProps) {
  return (
    <MenuFrame place={place}>
      <button type="button" role="menuitem" disabled={!hasTraces} title={COPY_HINT} onClick={onCopyWaveform}>
        Copy waveform
      </button>
      <button type="button" role="menuitem" disabled={!hasTraces} title={REPORT_HINT} onClick={onReportFigure}>
        Figure for a report…
      </button>
      <button type="button" role="menuitem" disabled={format === undefined} onClick={onDownload}>
        Download waveform (.{format ?? 'vcd'})
      </button>
      <button type="button" role="menuitem" onClick={onHelp}>
        Help
      </button>
    </MenuFrame>
  );
}

export interface ReportMenuProps {
  readonly place: MenuPlace;
  readonly onCopy: () => void;
  readonly onSaveSvg: () => void;
  readonly onSavePng: () => void;
}

/** Report mode's ⋯ menu: the same three actions as the band's Copy, Save SVG and Save PNG. */
export function ReportMenu({ place, onCopy, onSaveSvg, onSavePng }: ReportMenuProps) {
  return (
    <MenuFrame place={place}>
      <button type="button" role="menuitem" title="Copy the figure to the clipboard, as PNG and SVG" onClick={onCopy}>
        Copy to clipboard
      </button>
      <button type="button" role="menuitem" title="Save the figure as an SVG file, sharp at any size" onClick={onSaveSvg}>
        Save SVG
      </button>
      <button type="button" role="menuitem" title={`Save the figure as a ${REPORT_DPI} dpi PNG file`} onClick={onSavePng}>
        Save PNG
      </button>
    </MenuFrame>
  );
}

export interface SignalMenuProps {
  readonly place: MenuPlace;
  /** The current "Show as", or undefined when the signal has no choice (a bit, an enumeration). */
  readonly showAs: ShowAs | undefined;
  readonly shown: boolean;
  readonly onGoToDeclaration: () => void;
  readonly onShowAs: (showAs: ShowAs) => void;
  readonly onToggleShown: () => void;
  /** The Move items, for a shown signal that can be reordered (docs/imp_wave_rearange.md D13). */
  readonly move?: MoveChoices;
}

export interface MoveChoices {
  /** Whether the step would move the signal: not at the edge it is already at. */
  can(step: MoveStep): boolean;
  onMove(step: MoveStep): void;
}

interface MoveItem {
  readonly step: MoveStep;
  readonly label: string;
  /** The key that does the same, as shown and as `aria-keyshortcuts` names it. */
  readonly keys?: { readonly shown: string; readonly aria: string };
}

/** The Move items in their order. */
const MOVE_ITEMS: readonly MoveItem[] = [
  { step: 'up', label: 'Move up', keys: { shown: 'Alt+↑', aria: 'Alt+ArrowUp' } },
  { step: 'down', label: 'Move down', keys: { shown: 'Alt+↓', aria: 'Alt+ArrowDown' } },
  { step: 'top', label: 'Move to top' },
  { step: 'bottom', label: 'Move to bottom' },
];

function MoveGroup({ move }: { readonly move: MoveChoices }) {
  return (
    <div role="group" aria-label="Move" className="wv-menu__group">
      <span className="wv-menu__label">Move</span>
      {MOVE_ITEMS.map(({ step, label, keys }) => (
        <button key={step} type="button" role="menuitem" disabled={!move.can(step)} aria-keyshortcuts={keys?.aria} onClick={() => move.onMove(step)}>
          {label}
          {keys !== undefined && <span className="wv-menu__keys">{keys.shown}</span>}
        </button>
      ))}
    </div>
  );
}

function ShowAsGroup({ current, onShowAs }: { readonly current: ShowAs; readonly onShowAs: (showAs: ShowAs) => void }) {
  return (
    <div role="group" aria-label="Show as" className="wv-menu__group">
      <span className="wv-menu__label">Show as</span>
      {SHOW_AS_LABELS.map(([showAs, label]) => (
        <button key={showAs} type="button" role="menuitemradio" aria-checked={current === showAs} onClick={() => onShowAs(showAs)}>
          {current === showAs ? '● ' : ''}
          {label}
        </button>
      ))}
    </div>
  );
}

export function SignalMenu(props: SignalMenuProps) {
  return (
    <MenuFrame place={props.place}>
      <button type="button" role="menuitem" onClick={props.onGoToDeclaration}>
        Go to declaration
      </button>
      {props.showAs !== undefined && <ShowAsGroup current={props.showAs} onShowAs={props.onShowAs} />}
      {props.move !== undefined && <MoveGroup move={props.move} />}
      <button type="button" role="menuitem" onClick={props.onToggleShown}>
        {props.shown ? 'Remove from the shown signals' : 'Show'}
      </button>
    </MenuFrame>
  );
}
