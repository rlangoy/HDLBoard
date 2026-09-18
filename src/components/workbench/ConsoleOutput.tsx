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

export interface ConsoleOutputProps {
  lines: ConsoleLine[];
  onClear: () => void;
}

/** The bottom "GHDL Output / Status" panel — a scrolling, clearable log. */
export function ConsoleOutput({ lines, onClear }: ConsoleOutputProps) {
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' });
  }, [lines.length]);

  return (
    <section className="wb-console" aria-label="GHDL output">
      <div className="wb-console__header">
        <h2 className="wb-console__title">GHDL Output / Status</h2>
        <button type="button" className="wb-console__clear" onClick={onClear}>
          <DeleteIcon className="wb-console__clear-icon" aria-hidden="true" />
          Clear
        </button>
      </div>
      <div className="wb-console__body" role="log" aria-live="polite">
        {lines.map((line) => (
          <div className={cx('wb-console__line', line.tone && `is-${line.tone}`)} key={line.id}>
            <span className="wb-console__time">[{line.time}]</span> {line.text}
          </div>
        ))}
        <div ref={endRef} />
      </div>
    </section>
  );
}

export default ConsoleOutput;
