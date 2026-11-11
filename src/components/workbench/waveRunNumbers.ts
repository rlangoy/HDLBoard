// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * The page's own waveform run numbers (docs/waveform_viewer_spec.md W10). The server
 * numbers a session's runs from 1, and the client closes its session when a run ends, so
 * the server's numbers repeat; the waveform view tells runs apart by number. Each offered
 * waveform gets a page-wide number here, translated back for `WAVE-GET`.
 */
export class WaveRunNumbers {
  private last = 0;
  // The current session's runs: the server's number to the page's.
  private readonly ofSession = new Map<number, number>();

  /** A new socket, so a new session: the old one's runs are gone. */
  newSession(): void {
    this.ofSession.clear();
  }

  /** The page's number for a run the server offers (`WAVE-READY`). */
  offered(serverRun: number): number {
    this.last += 1;
    this.ofSession.set(serverRun, this.last);
    return this.last;
  }

  /** The page's number for one of this session's runs, or undefined for a run it never offered. */
  pageRun(serverRun: number): number | undefined {
    return this.ofSession.get(serverRun);
  }

  /** The server's number for a page run, or undefined when its session is gone. */
  serverRun(pageRun: number): number | undefined {
    for (const [serverRun, run] of this.ofSession) {
      if (run === pageRun) return serverRun;
    }
    return undefined;
  }
}
