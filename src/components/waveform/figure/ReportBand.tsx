// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * The band across the top of report mode (docs/waveform_viewer_spec.md § 8.8): what the
 * mode is, the few choices that matter – width, black and white or colour, the cursor –
 * how to insert the figure, and Close, Save SVG, Save PNG and Copy. Every choice shows
 * at once in the figure below.
 */

import type { ReactNode } from 'react';
import { WaveformIcon } from '../WaveformButton';
import { FIGURE_WIDTH_MM, REPORT_DPI, type FigureColouring, type FigureWidth, type ReportOptions } from './figureStyle';
import type { ReportMode } from './useViewFigures';

const MM_PER_CM = 10;

const WIDTH_CHOICES: ReadonlyArray<readonly [FigureWidth, string]> = [
  ['column', `One column (${FIGURE_WIDTH_MM.column} mm)`],
  ['page', `Two columns (${FIGURE_WIDTH_MM.page} mm)`],
];

const COLOURING_CHOICES: ReadonlyArray<readonly [FigureColouring, string]> = [
  ['mono', 'Black and white'],
  ['colour', 'Colour'],
];

interface ChoiceGroupProps<T extends string> {
  readonly legend: string;
  readonly name: string;
  readonly choices: ReadonlyArray<readonly [T, string]>;
  readonly value: T;
  readonly onChange: (value: T) => void;
}

function ChoiceGroup<T extends string>({ legend, name, choices, value, onChange }: ChoiceGroupProps<T>) {
  return (
    <fieldset className="wv-report-band__group">
      <legend>{legend}</legend>
      {choices.map(([choice, label]) => (
        <label key={choice}>
          <input type="radio" name={name} checked={value === choice} onChange={() => onChange(choice)} />
          {label}
        </label>
      ))}
    </fieldset>
  );
}

interface OptionsFormProps {
  readonly options: ReportOptions;
  readonly onChange: (patch: Partial<ReportOptions>) => void;
  readonly cursorField: ReactNode;
}

function ReportOptionsForm({ options, onChange, cursorField }: OptionsFormProps) {
  return (
    <>
      <ChoiceGroup legend="Width" name="wv-report-width" choices={WIDTH_CHOICES} value={options.width} onChange={(width) => onChange({ width })} />
      <ChoiceGroup
        legend="Style"
        name="wv-report-colouring"
        choices={COLOURING_CHOICES}
        value={options.colouring}
        onChange={(colouring) => onChange({ colouring })}
      />
      <fieldset className="wv-report-band__group">
        <legend>Cursor</legend>
        <label>
          <input type="checkbox" checked={options.showCursor} onChange={(event) => onChange({ showCursor: event.target.checked })} />
          Show the cursor
        </label>
        {cursorField}
      </fieldset>
    </>
  );
}

function BandButton({ primary, onClick, children }: { readonly primary?: boolean; readonly onClick: () => void; readonly children: ReactNode }) {
  return (
    <button type="button" className={primary ? 'wv-report-band__button is-primary' : 'wv-report-band__button'} onClick={onClick}>
      {children}
    </button>
  );
}

export interface ReportBandProps {
  readonly report: ReportMode;
  /** The cursor's time field, to read or type the cursor's time. */
  readonly cursorField: ReactNode;
}

export function ReportBand({ report, cursorField }: ReportBandProps) {
  const widthCm = FIGURE_WIDTH_MM[report.options.width] / MM_PER_CM;
  return (
    <section className="wv-report-band" aria-label="Figure for a report">
      <div className="wv-report-band__hero">
        <div className="wv-report-band__badge">
          <WaveformIcon />
        </div>
        <div className="wv-report-band__heading">
          <h2>Figure for a report</h2>
          <p>The traces in view, sized for print</p>
        </div>
        <div className="wv-report-band__buttons">
          <BandButton onClick={report.close}>Close</BandButton>
          <BandButton onClick={report.saveSvg}>Save SVG</BandButton>
          <BandButton onClick={report.savePng}>Save PNG</BandButton>
          <BandButton primary onClick={report.copy}>
            Copy
          </BandButton>
        </div>
      </div>
      <div className="wv-report-band__options">
        <ReportOptionsForm options={report.options} onChange={report.change} cursorField={cursorField} />
        <p className="wv-report-band__hint">
          Text is 9 pt and traces 1 pt when the figure is {widthCm} cm wide. Insert it without resizing; if your editor
          changes the size, set the width back to {widthCm} cm. SVG stays sharp at any size; PNG is {REPORT_DPI} dpi.
          Scroll to move in time and drag across the figure to zoom into that part.
        </p>
      </div>
    </section>
  );
}
