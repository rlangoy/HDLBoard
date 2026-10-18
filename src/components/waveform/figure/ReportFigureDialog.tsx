// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * Figure for a report (docs/waveform_viewer_spec.md § 8.8): a preview at the printed
 * size, the few choices that matter – width, black and white or colour, the cursor –
 * and Copy, Save SVG and Save PNG. The choices are remembered in this browser.
 */

import { useMemo, useState, type ReactNode } from 'react';
import { Dialog } from '../../workbench/Dialog';
import { useStatusLine } from '../useStatusLine';
import { loadReportOptions, saveReportOptions } from '../wavePrefs';
import { WaveformIcon } from '../WaveformButton';
import type { FigureContent } from './figureContent';
import { COPY_MESSAGES, copyFigure, measureText, saveFigurePng, saveFigureSvg } from './figureOutput';
import { FIGURE_WIDTH_MM, REPORT_DPI, reportLook, type FigureColouring, type FigureWidth, type ReportOptions } from './figureStyle';
import { waveformFigure, type Figure } from './figureSvg';

export interface ReportFigureDialogProps {
  readonly content: FigureContent;
  /** The saved files' name without extension: `counter_tb_waveform`. */
  readonly baseName: string;
  readonly onClose: () => void;
}

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
    <fieldset className="wv-figure__group">
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

/** The options, remembered each time one changes. */
function useReportOptions(): [ReportOptions, (change: Partial<ReportOptions>) => void] {
  const [options, setOptions] = useState(loadReportOptions);
  const change = (patch: Partial<ReportOptions>) => {
    const next = { ...options, ...patch };
    setOptions(next);
    saveReportOptions(next);
  };
  return [options, change];
}

function FooterButton({ primary, onClick, children }: { readonly primary?: boolean; readonly onClick: () => void; readonly children: ReactNode }) {
  return (
    <button type="button" className={primary ? 'wb-dialog__close' : 'wb-newfile__cancel'} onClick={onClick}>
      {children}
    </button>
  );
}

interface ButtonsProps {
  readonly figure: Figure;
  readonly baseName: string;
  readonly onStatus: (message: string) => void;
  readonly onClose: () => void;
}

function ReportFigureButtons({ figure, baseName, onStatus, onClose }: ButtonsProps) {
  return (
    <div className="wb-newfile__buttons">
      <FooterButton onClick={onClose}>Close</FooterButton>
      <FooterButton onClick={() => saveFigureSvg(figure, baseName)}>Save SVG</FooterButton>
      <FooterButton onClick={() => void saveFigurePng(figure, baseName, REPORT_DPI)}>Save PNG</FooterButton>
      <FooterButton primary onClick={() => void copyFigure(figure).then((result) => onStatus(COPY_MESSAGES[result]))}>
        Copy
      </FooterButton>
    </div>
  );
}

function ReportOptionsForm({ options, onChange }: { readonly options: ReportOptions; readonly onChange: (change: Partial<ReportOptions>) => void }) {
  return (
    <div className="wv-figure__options">
      <ChoiceGroup legend="Width" name="wv-figure-width" choices={WIDTH_CHOICES} value={options.width} onChange={(width) => onChange({ width })} />
      <ChoiceGroup legend="Style" name="wv-figure-colouring" choices={COLOURING_CHOICES} value={options.colouring} onChange={(colouring) => onChange({ colouring })} />
      <label className="wv-figure__check">
        <input type="checkbox" checked={options.showCursor} onChange={(event) => onChange({ showCursor: event.target.checked })} />
        Show the cursor
      </label>
    </div>
  );
}

export function ReportFigureDialog({ content, baseName, onClose }: ReportFigureDialogProps) {
  const [options, change] = useReportOptions();
  const [status, setStatus] = useStatusLine();
  const figure = useMemo(() => waveformFigure(content, reportLook(options), measureText), [content, options]);
  const preview = useMemo(() => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(figure.svg)}`, [figure]);
  const widthCm = FIGURE_WIDTH_MM[options.width] / MM_PER_CM;
  const footer = <ReportFigureButtons figure={figure} baseName={baseName} onStatus={setStatus} onClose={onClose} />;
  return (
    <Dialog open onClose={onClose} title="Figure for a report" subtitle="The traces in view, sized for print" icon={<WaveformIcon />} size="wide" footer={footer}>
      <div className="wv-figure">
        <div className="wv-figure__preview">
          <img src={preview} alt="Preview of the figure at its printed size" />
        </div>
        <ReportOptionsForm options={options} onChange={change} />
        <p className="wv-figure__hint">
          Text is 9 pt and traces 1 pt when the figure is {widthCm} cm wide. Insert it without resizing; if your editor changes the size, set
          the width back to {widthCm} cm. SVG stays sharp at any size; PNG is {REPORT_DPI} dpi.
        </p>
        <p className="wv-figure__status" role="status">
          {status}
        </p>
      </div>
    </Dialog>
  );
}
