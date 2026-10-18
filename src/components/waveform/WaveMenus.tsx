// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * The two small menus of the waveform view (§ 8.6, S3): the ⋯ menu (Copy waveform,
 * Figure for a report, Download, Help)
 * and the right-click menu of a signal (Go to declaration, Show as, Show/Remove).
 */

import { SHOW_AS_LABELS, type ShowAs } from './radix';

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
      <button type="button" role="menuitem" disabled={!hasTraces} title="Copy the waveform as it is on screen, as PNG and SVG" onClick={onCopyWaveform}>
        Copy waveform
      </button>
      <button type="button" role="menuitem" disabled={!hasTraces} title="Make a figure sized for print: copy it, or save it as SVG or PNG" onClick={onReportFigure}>
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

export interface SignalMenuProps {
  readonly place: MenuPlace;
  /** The current "Show as", or undefined when the signal has no choice (a bit, an enumeration). */
  readonly showAs: ShowAs | undefined;
  readonly shown: boolean;
  readonly onGoToDeclaration: () => void;
  readonly onShowAs: (showAs: ShowAs) => void;
  readonly onToggleShown: () => void;
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
      <button type="button" role="menuitem" onClick={props.onToggleShown}>
        {props.shown ? 'Remove from the shown signals' : 'Show'}
      </button>
    </MenuFrame>
  );
}
