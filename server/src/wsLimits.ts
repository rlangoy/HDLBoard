// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * The WebSocket abuse limits (docs/HOSTING.md § 3.1) and the budget each connection
 * spends its frames from. Pure: the clock is a parameter.
 */

import { TokenBucket } from './rateLimit.js';
import { BUSY_LOG_PREFIX } from './sessionLimit.js';
import {
  WS_BYTES_PER_SECOND,
  WS_MESSAGES_PER_SECOND,
  WS_OUTGOING_BYTES,
  WS_SEND_TIMEOUT_MS,
  WS_UPGRADES_PER_MINUTE,
  WS_WORK_PER_MINUTE,
  readIntSetting,
  type IntSetting,
} from './settings.js';

export interface WsLimits {
  readonly upgradesPerMinute: number;
  readonly messagesPerSecond: number;
  readonly bytesPerSecond: number;
  readonly workPerMinute: number;
  readonly outgoingBytes: number;
  readonly sendTimeoutMs: number;
}

const SETTINGS: { readonly [limit in keyof WsLimits]: IntSetting } = {
  upgradesPerMinute: WS_UPGRADES_PER_MINUTE,
  messagesPerSecond: WS_MESSAGES_PER_SECOND,
  bytesPerSecond: WS_BYTES_PER_SECOND,
  workPerMinute: WS_WORK_PER_MINUTE,
  outgoingBytes: WS_OUTGOING_BYTES,
  sendTimeoutMs: WS_SEND_TIMEOUT_MS,
};

/**
 * Each limit from `overrides`, else its `HDL_WS_*` setting. Overrides come from code (tests,
 * the desktop app) and are taken as they are; settings are checked against their minimums.
 */
export function readWsLimits(overrides: Partial<WsLimits> = {}, env: NodeJS.ProcessEnv = process.env): WsLimits {
  const read = (limit: keyof WsLimits) => overrides[limit] ?? readIntSetting(SETTINGS[limit], env);
  return {
    upgradesPerMinute: read('upgradesPerMinute'),
    messagesPerSecond: read('messagesPerSecond'),
    bytesPerSecond: read('bytesPerSecond'),
    workPerMinute: read('workPerMinute'),
    outgoingBytes: read('outgoingBytes'),
    sendTimeoutMs: read('sendTimeoutMs'),
  };
}

/** Frames and bytes may come in bursts this many seconds long. */
const BURST_SECONDS = 2;
/**
 * RUN and RESET requests that may come at once (a student clicking Reset a few times), and
 * likewise waveform downloads (the page fetches one to show and one to save, per run).
 */
const WORK_BURST = 5;

/** What one connection may send: frames and bytes, RUN and RESET requests, waveform downloads. */
export class MessageBudget {
  private readonly messages: TokenBucket;
  private readonly bytes: TokenBucket;
  private readonly work: TokenBucket;
  private readonly downloads: TokenBucket;

  constructor(limits: WsLimits, now: () => number) {
    const { messagesPerSecond, bytesPerSecond, workPerMinute } = limits;
    this.messages = TokenBucket.perSecond(messagesPerSecond, messagesPerSecond * BURST_SECONDS, now);
    this.bytes = TokenBucket.perSecond(bytesPerSecond, bytesPerSecond * BURST_SECONDS, now);
    this.work = TokenBucket.perMinute(workPerMinute, Math.min(WORK_BURST, workPerMinute), now);
    // Its own bucket at the same rate: a download is not a run, but each compresses and
    // sends a waveform of up to 16 MiB, so repeating one must cost the client too.
    this.downloads = TokenBucket.perMinute(workPerMinute, Math.min(WORK_BURST, workPerMinute), now);
  }

  /** Spends one frame of `bytes`, any frame: text, binary, ping or pong. */
  takeMessage(bytes: number): boolean {
    return this.messages.take() && this.bytes.take(bytes);
  }

  /** Spends one RUN or RESET, each of which starts a compiler or a simulator. */
  takeWork(): boolean {
    return this.work.take();
  }

  /** Spends one `WAVE-GET`. */
  takeDownload(): boolean {
    return this.downloads.take();
  }
}

/** To the client over its frame or byte budget, in the `ERROR protocol` before its socket closes. */
export const TOO_MANY_MESSAGES_TEXT = 'WebSocket rate limit exceeded. Reconnect after slowing down.';

/** To the student whose RUN came over the work budget, in an `ERROR busy` that ends it. */
export const TOO_MANY_RUNS_TEXT = 'Too many runs in a short time. Wait a few seconds, then click Start again.';

/** To the student whose RESET came over the work budget, in an `ERROR protocol`: the run goes on. */
export const TOO_MANY_RESETS_TEXT =
  'Reset ignored: too many runs and resets in a short time. Wait a few seconds, then reset again.';

/** To the student whose `WAVE-GET` came over the download budget, before its `WAVE-NONE`. */
export const TOO_MANY_DOWNLOADS_TEXT =
  'Waveform not sent: too many waveform downloads in a short time. Wait a few seconds, then try again.';

/** The server log's line for a RUN refused over the work budget. */
export const TOO_MANY_RUNS_LOG_LINE = `${BUSY_LOG_PREFIX} refused a RUN, too many runs and resets from one connection in a short time`;
