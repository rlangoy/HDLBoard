// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import { useEffect, useMemo, useRef, type ReactNode } from 'react';
import { cx } from '../board';
import type { LocatedDiagnostic } from './diagnosticLocation';
import { consoleBlocks, readableSimTime, type ReportRow } from './ghdlReport';
import { DeleteIcon } from './icons';
import './ConsoleOutput.css';

export interface ConsoleLine {
  id: number;
  time: string;
  text: string;
  tone?: 'success' | 'error';
}

export interface ConsoleOutputProps {
  lines: ConsoleLine[];
  onClear: () => void;
  /** Resolves one line of console text to the message it names in a project file, if any. */
  locate?: (line: string) => LocatedDiagnostic | undefined;
  /** A located line was clicked. */
  onOpenLocation?: (diagnostic: LocatedDiagnostic) => void;
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
}: {
  text: string;
  locate?: ConsoleOutputProps['locate'];
  onOpenLocation?: ConsoleOutputProps['onOpenLocation'];
}) {
  if (!locate || !onOpenLocation) return <>{text}</>;
  return (
    <>
      {text.split('\n').map((part, i) => {
        const target = locate(part);
        return (
          <span key={i}>
            {i > 0 && '\n'}
            {target ? (
              <LocationLink target={target} onOpenLocation={onOpenLocation}>
                {part}
              </LocationLink>
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
}: { rows: readonly ReportRow[] } & Pick<ConsoleOutputProps, 'locate' | 'onOpenLocation'>) {
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
              <td>{readableSimTime(report.simTime)}</td>
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

/** The bottom "Simulator Output / Status" panel — a scrolling, clearable log. */
export function ConsoleOutput({ lines, onClear, locate, onOpenLocation }: ConsoleOutputProps) {
  const endRef = useRef<HTMLDivElement>(null);
  const blocks = useMemo(() => consoleBlocks(lines), [lines]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' });
  }, [lines.length]);

  return (
    <section className="wb-console" aria-label="Simulator output">
      <div className="wb-console__header">
        <h2 className="wb-console__title">Simulator Output / Status</h2>
        <button type="button" className="wb-console__clear" onClick={onClear}>
          <DeleteIcon className="wb-console__clear-icon" aria-hidden="true" />
          Clear
        </button>
      </div>
      <div className="wb-console__body" role="log" aria-live="polite">
        {blocks.map((block) =>
          block.kind === 'reports' ? (
            <ReportTable
              key={`reports-${block.rows[0].line.id}`}
              rows={block.rows}
              locate={locate}
              onOpenLocation={onOpenLocation}
            />
          ) : (
            <div className={cx('wb-console__line', block.line.tone && `is-${block.line.tone}`)} key={block.line.id}>
              <span className="wb-console__time">[{block.line.time}]</span>{' '}
              <LineText text={block.line.text} locate={locate} onOpenLocation={onOpenLocation} />
            </div>
          ),
        )}
        <div ref={endRef} />
      </div>
    </section>
  );
}

export default ConsoleOutput;
