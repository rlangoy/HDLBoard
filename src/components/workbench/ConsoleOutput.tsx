// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import { useEffect, useRef } from 'react';
import { cx } from '../board';
import { DeleteIcon } from './icons';
import './ConsoleOutput.css';

export interface ConsoleLine {
  id: number;
  time: string;
  text: string;
  tone?: 'success' | 'error';
}

/** A place in a project file that a console line names. */
export interface ConsoleLocation {
  fileId: string;
  line: number;
}

export interface ConsoleOutputProps {
  lines: ConsoleLine[];
  onClear: () => void;
  /** Resolves one line of console text to a marked place, if it names one. */
  locate?: (line: string) => ConsoleLocation | undefined;
  /** A located line was clicked. */
  onOpenLocation?: (location: ConsoleLocation) => void;
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
              <button
                type="button"
                className="wb-console__link"
                onClick={() => {
                  // Ending a text selection over the link is a copy, not a navigation.
                  if (window.getSelection()?.toString()) return;
                  onOpenLocation(target);
                }}
              >
                {part}
              </button>
            ) : (
              part
            )}
          </span>
        );
      })}
    </>
  );
}

/** The bottom "Simulator Output / Status" panel — a scrolling, clearable log. */
export function ConsoleOutput({ lines, onClear, locate, onOpenLocation }: ConsoleOutputProps) {
  const endRef = useRef<HTMLDivElement>(null);

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
        {lines.map((line) => (
          <div className={cx('wb-console__line', line.tone && `is-${line.tone}`)} key={line.id}>
            <span className="wb-console__time">[{line.time}]</span>{' '}
            <LineText text={line.text} locate={locate} onOpenLocation={onOpenLocation} />
          </div>
        ))}
        <div ref={endRef} />
      </div>
    </section>
  );
}

export default ConsoleOutput;
