// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import { useEffect, useMemo, useRef, type ReactNode } from 'react';
import { cx } from '../board';
import type { LocatedDiagnostic } from './diagnosticLocation';
import { consoleBlocks, readableSimTime, type ReportRow } from './ghdlReport';
import { DeleteIcon } from './icons';
import { icarusLineTime } from '../waveform/consoleTimes';
import { parseSimTime } from '../waveform/timeAxis';
import './ConsoleOutput.css';

export interface ConsoleLine {
  id: number;
  time: string;
  text: string;
  tone?: 'success' | 'error';
  /** A line the frontend adds that ends in a link: "✓ Testbench finished – Open waveform" (FR-25). */
  action?: 'open-waveform';
}

export interface ConsoleOutputProps {
  lines: ConsoleLine[];
  onClear: () => void;
  /** Resolves one line of console text to the message it names in a project file, if any. */
  locate?: (line: string) => LocatedDiagnostic | undefined;
  /** A located line was clicked. */
  onOpenLocation?: (diagnostic: LocatedDiagnostic) => void;
  /** The Waveform button, left of Clear (docs/waveform_viewer_spec.md FR-24). */
  waveButton?: ReactNode;
  /** A simulated time was clicked (FR-16): open the waveform there. Omitted, times are plain text. */
  onOpenTime?: (fs: number) => void;
  /** The "Open waveform" link of a finished testbench run was clicked (FR-25). */
  onOpenWaveform?: () => void;
}

/** A simulated time as a link that opens the waveform at it (FR-16). */
function TimeLink({ fs, onOpenTime, children }: { fs: number; onOpenTime: (fs: number) => void; children: ReactNode }) {
  return (
    <button type="button" className="wb-console__link wb-console__time-link" title="Open the waveform at this time" onClick={() => onOpenTime(fs)}>
      {children}
    </button>
  );
}

/** A link to the marked place a console line names, around `children`. */
function LocationLink({
  target,
  onOpenLocation,
  children,
}: {
  target: LocatedDiagnostic;
  onOpenLocation: (diagnostic: LocatedDiagnostic) => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      className="wb-console__link"
      onClick={() => {
        // Ending a text selection over the link is a copy, not a navigation.
        if (window.getSelection()?.toString()) return;
        onOpenLocation(target);
      }}
    >
      {children}
    </button>
  );
}

/**
 * The text of one console entry, where each line that names a marked place is a
 * link to it. Newlines are kept: the body is `white-space: pre-wrap`.
 */
function LineText({
  text,
  locate,
  onOpenLocation,
  onOpenTime,
}: {
  text: string;
  locate?: ConsoleOutputProps['locate'];
  onOpenLocation?: ConsoleOutputProps['onOpenLocation'];
  onOpenTime?: ConsoleOutputProps['onOpenTime'];
}) {
  if ((!locate || !onOpenLocation) && !onOpenTime) return <>{text}</>;
  return (
    <>
      {text.split('\n').map((part, i) => {
        const target = locate && onOpenLocation ? locate(part) : undefined;
        // Icarus's `Time: 45000  Scope: tb` line after an $error (waveform spec Q9).
        const time = onOpenTime && !target ? icarusLineTime(part) : undefined;
        return (
          <span key={i}>
            {i > 0 && '\n'}
            {target && onOpenLocation ? (
              <LocationLink target={target} onOpenLocation={onOpenLocation}>
                {part}
              </LocationLink>
            ) : time && onOpenTime ? (
              <>
                {time.parts[0]}
                <TimeLink fs={time.fs} onOpenTime={onOpenTime}>
                  {time.parts[1]}
                </TimeLink>
                {time.parts[2]}
              </>
            ) : (
              part
            )}
          </span>
        );
      })}
    </>
  );
}

/**
 * A run of GHDL `report` / `assert` messages (ghdlReport.ts) as one table, so the
 * messages line up instead of each repeating `file:line:col:@time:(report note):`.
 */
function ReportTable({
  rows,
  locate,
  onOpenLocation,
  onOpenTime,
}: { rows: readonly ReportRow[] } & Pick<ConsoleOutputProps, 'locate' | 'onOpenLocation' | 'onOpenTime'>) {
  return (
    <table className="wb-console__reports">
      <thead>
        <tr>
          <th scope="col">Time</th>
          <th scope="col">Filename</th>
          <th scope="col">Timestamp</th>
          <th scope="col">Report Text</th>
        </tr>
      </thead>
      <tbody>
        {rows.map(({ line, report }) => {
          const target = locate?.(line.text);
          const fileName = (
            <>
              {report.file}
              <span className="wb-console__report-line">:{report.line}</span>
            </>
          );
          return (
            <tr key={line.id} className={cx(`is-${report.severity}`)}>
              <td className="wb-console__time">{line.time}</td>
              <td>
                {target && onOpenLocation ? (
                  <LocationLink target={target} onOpenLocation={onOpenLocation}>
                    {fileName}
                  </LocationLink>
                ) : (
                  fileName
                )}
              </td>
              <td>
                <ReportTime simTime={report.simTime} onOpenTime={onOpenTime} />
              </td>
              <td className="wb-console__report-text">
                {report.severity !== 'note' && (
                  <span className="wb-console__severity">{`${report.kind} ${report.severity}`}</span>
                )}
                {report.text}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

/** A report's time, a link into the waveform when there is one (FR-16). */
function ReportTime({ simTime, onOpenTime }: { simTime: string; onOpenTime?: (fs: number) => void }) {
  const fs = onOpenTime ? parseSimTime(simTime) : undefined;
  if (fs === undefined || !onOpenTime) return <>{readableSimTime(simTime)}</>;
  return (
    <TimeLink fs={fs} onOpenTime={onOpenTime}>
      {readableSimTime(simTime)}
    </TimeLink>
  );
}

/** "✓ Testbench finished – Open waveform": the way to the first waveform, until one has been opened (S2). */
function OpenWaveformLine({ text, onOpenWaveform }: { text: string; onOpenWaveform?: () => void }) {
  return (
    <>
      {text}
      {onOpenWaveform && (
        <button type="button" className="wb-console__link wb-console__wave-link" onClick={onOpenWaveform}>
          Open waveform
        </button>
      )}
    </>
  );
}

/** The bottom "Simulator Output / Status" panel — a scrolling, clearable log. */
export function ConsoleOutput({ lines, onClear, locate, onOpenLocation, waveButton, onOpenTime, onOpenWaveform }: ConsoleOutputProps) {
  const endRef = useRef<HTMLDivElement>(null);
  const blocks = useMemo(() => consoleBlocks(lines), [lines]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' });
  }, [lines.length]);

  return (
    <section className="wb-console" aria-label="Simulator output">
      <div className="wb-console__header">
        <h2 className="wb-console__title">Simulator Output / Status</h2>
        <div className="wb-console__actions">
          {waveButton}
          <button type="button" className="wb-console__clear" onClick={onClear}>
            <DeleteIcon className="wb-console__clear-icon" aria-hidden="true" />
            Clear
          </button>
        </div>
      </div>
      <div className="wb-console__body" role="log" aria-live="polite">
        {blocks.map((block) =>
          block.kind === 'reports' ? (
            <ReportTable
              key={`reports-${block.rows[0].line.id}`}
              rows={block.rows}
              locate={locate}
              onOpenLocation={onOpenLocation}
              onOpenTime={onOpenTime}
            />
          ) : (
            <div className={cx('wb-console__line', block.line.tone && `is-${block.line.tone}`)} key={block.line.id}>
              <span className="wb-console__time">[{block.line.time}]</span>{' '}
              {block.line.action === 'open-waveform' ? (
                <OpenWaveformLine text={block.line.text} onOpenWaveform={onOpenWaveform} />
              ) : (
                <LineText text={block.line.text} locate={locate} onOpenLocation={onOpenLocation} onOpenTime={onOpenTime} />
              )}
            </div>
          ),
        )}
        <div ref={endRef} />
      </div>
    </section>
  );
}

export default ConsoleOutput;
