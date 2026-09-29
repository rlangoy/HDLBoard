// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import { cx } from '../board';
import './SimulationCard.css';

export type SimStatus = 'stopped' | 'compiling' | 'running';

export interface SimulationCardProps {
  status: SimStatus;
  /** Seconds since the current (or last) run started. */
  elapsedSeconds: number;
  /** The top-level entity file this run is elaborating. */
  topFile: string;
  onStart: () => void;
  onStop: () => void;
}

const STATUS_LABEL: Record<SimStatus, string> = {
  stopped: 'Stopped',
  compiling: 'Compiling…',
  running: 'Running',
};

function formatElapsed(totalSeconds: number): string {
  const clamped = Math.max(0, totalSeconds);
  const h = Math.floor(clamped / 3600);
  const m = Math.floor((clamped % 3600) / 60);
  const s = clamped % 60;
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${pad(h)}:${pad(m)}:${pad(s)}`;
}

/**
 * The "Simulation" card at the top of the left pane — Start/Stop and the
 * run status, integrated into the sidebar rather than floating over the
 * board (matches the reference Simulate-and-Files-pane mockup).
 */
export function SimulationCard({ status, elapsedSeconds, topFile, onStart, onStop }: SimulationCardProps) {
  const running = status === 'running';
  const compiling = status === 'compiling';

  return (
    <section className="wb-simcard">
      <div className="wb-simcard__header">
        <span className="wb-icon wb-icon--play-circle" aria-hidden="true" />
        <h2 className="wb-simcard__title">Simulation</h2>
        <span className={cx('wb-simcard__status', `is-${status}`)}>
          <span className="wb-simcard__dot" aria-hidden="true" />
          <span className="wb-simcard__label-text">{STATUS_LABEL[status]}</span>
        </span>
      </div>

      <button
        type="button"
        className={cx('wb-simcard__button', running ? 'is-stop' : 'is-start')}
        onClick={running ? onStop : onStart}
        disabled={compiling}
      >
        <span className={cx('wb-icon', running ? 'wb-icon--pause' : 'wb-icon--play')} aria-hidden="true" />
        {running ? 'Stop' : 'Start'}
      </button>

      <div className="wb-simcard__meta">
        <span className="wb-icon wb-icon--clock" aria-hidden="true" />
        <span className="wb-simcard__label-text">
          Elapsed: {formatElapsed(elapsedSeconds)} <span className="wb-simcard__sep">|</span> Top:{' '}
          <strong className="wb-simcard__top">{topFile}</strong>
        </span>
      </div>
    </section>
  );
}

export default SimulationCard;
