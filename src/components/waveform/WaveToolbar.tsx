// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * The waveform's toolbar (docs/waveform_viewer_spec.md § 8.6, S3): the title, the
 * time at the cursor as a field to read or type in, and few controls – Zoom out, Zoom in, Fit, ⋯
 * and Close – as round icon buttons, each with a tooltip that says what it does and
 * its key (docs/images/head_moc1.png).
 */

import type { ComponentType, MouseEvent, ReactNode, SVGProps } from 'react';
import { CloseIcon, FitIcon, MoreIcon, ZoomInIcon, ZoomOutIcon } from './waveIcons';

export interface WaveToolbarProps {
  readonly title: string;
  readonly hasWaveform: boolean;
  /** The cursor's time field; none while there is no waveform, or while report mode shows it in its band. */
  readonly cursorField: ReactNode;
  readonly onZoomOut: () => void;
  readonly onZoomIn: () => void;
  readonly onFit: () => void;
  readonly onMore: (anchor: DOMRect) => void;
  readonly onClose: () => void;
}

interface ToolButtonProps {
  readonly icon: ComponentType<SVGProps<SVGSVGElement>>;
  readonly label: string;
  readonly hint: string;
  readonly disabled?: boolean;
  readonly onClick: (event: MouseEvent<HTMLButtonElement>) => void;
  readonly popup?: boolean;
  /** The close button stands out from the others (docs/images/head_moc1.png). */
  readonly emphasis?: boolean;
}

function ToolButton({ icon: IconComponent, label, hint, disabled, onClick, popup, emphasis }: ToolButtonProps) {
  return (
    <button
      type="button"
      className={emphasis ? 'wv-tool wv-tool--close' : 'wv-tool'}
      aria-label={label}
      aria-haspopup={popup ? 'menu' : undefined}
      title={hint}
      disabled={disabled}
      onClick={onClick}
    >
      <IconComponent className="wv-tool__icon" />
    </button>
  );
}

export function WaveToolbar(props: WaveToolbarProps) {
  const noWaveform = !props.hasWaveform;
  return (
    <header className="wv-toolbar">
      <h2 className="wv-toolbar__title">Waveform – {props.title}</h2>
      {props.cursorField !== null && (
        <span className="wv-toolbar__time">
          Cursor {props.cursorField}
        </span>
      )}
      <div className="wv-toolbar__buttons">
        <ToolButton icon={ZoomOutIcon} label="Zoom out" hint="Zoom out (−)" disabled={noWaveform} onClick={props.onZoomOut} />
        <ToolButton icon={ZoomInIcon} label="Zoom in" hint="Zoom in (+). Or drag across the waveform to zoom into that part." disabled={noWaveform} onClick={props.onZoomIn} />
        <ToolButton icon={FitIcon} label="Fit" hint="Show the whole run (F)" disabled={noWaveform} onClick={props.onFit} />
        <ToolButton
          icon={MoreIcon}
          label="More"
          hint="More: copy the waveform, figure for a report, download the waveform file, help"
          popup
          onClick={(event) => {
            event.stopPropagation();
            props.onMore(event.currentTarget.getBoundingClientRect());
          }}
        />
        <ToolButton icon={CloseIcon} label="Close the waveform" hint="Close the waveform and show the code again (Esc)" emphasis onClick={props.onClose} />
      </div>
    </header>
  );
}
