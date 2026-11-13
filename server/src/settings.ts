// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * The backend's settings from the environment. Each has an `HDL_*` name — the backend
 * serves GHDL and Icarus Verilog alike — and the older ones also the `GHDL_*` name they
 * had when GHDL was the only simulator, still read so existing deployments (service
 * files, `.env` files, hosting dashboards) keep working unchanged.
 */

import { MAX_BINARY_FRAME_BYTES, MAX_CLIENT_FRAME_BYTES, MAX_FRAME_HEADER_BYTES } from './frameLimits.js';

export interface IntSetting {
  readonly name: string;
  /** Only for settings that existed before Verilog. */
  readonly legacyName?: string;
  readonly fallback: number;
  /** The smallest value that still works; a smaller one falls back with a warning. Defaults to 0. */
  readonly minimum?: number;
}

export const WS_PORT: IntSetting = { name: 'HDL_WS_PORT', legacyName: 'GHDL_WS_PORT', fallback: 9010 };
export const MAX_SESSIONS: IntSetting = { name: 'HDL_MAX_SESSIONS', legacyName: 'GHDL_MAX_SESSIONS', fallback: 32 };
/**
 * On a full server, when no idle session can be closed, the oldest session open at least
 * this many minutes is closed to make room for a new one (sessionLimit.ts). 0: never —
 * nothing is closed, and the new one is refused instead.
 */
export const REPLACE_AFTER_MINUTES: IntSetting = { name: 'HDL_REPLACE_AFTER_MINUTES', fallback: 9 };
/**
 * On a full server, a session idle less than this many seconds is not closed for a new one,
 * unless its address has another session too (sessionLimit.ts).
 */
export const IDLE_GRACE_SECONDS: IntSetting = { name: 'HDL_IDLE_GRACE_SECONDS', fallback: 60 };
/**
 * How many proxies in front of the backend append to `X-Forwarded-For` (clientAddress.ts).
 * 0: the header is ignored, and each connection's address is its socket's peer.
 */
export const TRUSTED_PROXIES: IntSetting = { name: 'HDL_TRUSTED_PROXIES', fallback: 0 };

/*
 * WebSocket abuse limits (wsLimits.ts, docs/HOSTING.md § 3.1). Each has a minimum: a
 * limit of 0 would refuse everything, and one below a frame's size would refuse that frame.
 */
/** Upgrades per client address and minute, counted after the path and Origin checks. */
export const WS_UPGRADES_PER_MINUTE: IntSetting = { name: 'HDL_WS_UPGRADES_PER_MINUTE', fallback: 600, minimum: 1 };
/** Frames per connection and second, pings and pongs included. */
export const WS_MESSAGES_PER_SECOND: IntSetting = { name: 'HDL_WS_MESSAGES_PER_SECOND', fallback: 200, minimum: 1 };
/** Bytes per connection and second; at least one RUN of the largest size per second. */
export const WS_BYTES_PER_SECOND: IntSetting = {
  name: 'HDL_WS_BYTES_PER_SECOND',
  fallback: MAX_CLIENT_FRAME_BYTES,
  minimum: MAX_CLIENT_FRAME_BYTES,
};
/** RUN and RESET requests per connection and minute: each starts a compiler or a simulator. */
export const WS_WORK_PER_MINUTE: IntSetting = { name: 'HDL_WS_WORK_PER_MINUTE', fallback: 30, minimum: 1 };
/** The output a connection may have queued, 4 MiB; at least one waveform frame. */
export const WS_OUTGOING_BYTES: IntSetting = {
  name: 'HDL_WS_OUTGOING_BYTES',
  fallback: 4_194_304,
  minimum: MAX_BINARY_FRAME_BYTES + MAX_FRAME_HEADER_BYTES,
};
/** How long a queued write may take before the connection is cut. */
export const WS_SEND_TIMEOUT_MS: IntSetting = { name: 'HDL_WS_SEND_TIMEOUT_MS', fallback: 10_000, minimum: 1000 };

/** The largest waveform file a run may write, 16 MiB (docs/waveform_viewer_spec.md § 7.5, W6). */
export const MAX_WAVE_BYTES: IntSetting = { name: 'HDL_MAX_WAVE_BYTES', fallback: 16_777_216 };
/** How often the session checks the waveform file's size while a run is going. */
export const WAVE_CHECK_MS: IntSetting = { name: 'HDL_WAVE_CHECK_MS', fallback: 250 };

const WHOLE_NUMBER = /^\d+$/;

/** The setting's value: its own name first, then its legacy name, then the fallback. */
export function readIntSetting(setting: IntSetting, env: NodeJS.ProcessEnv = process.env): number {
  const raw = env[setting.name] ?? (setting.legacyName === undefined ? undefined : env[setting.legacyName]);
  if (raw === undefined) return setting.fallback;
  const problem = problemWith(raw, setting.minimum ?? 0);
  return problem === undefined ? Number(raw) : fallBack(setting, problem);
}

/**
 * Why `raw` is no usable value, or undefined when it is one. Each case must fall back, not
 * pass: a NaN compares false with everything, and Infinity is never counted down, so either
 * would quietly mean "no limit".
 */
function problemWith(raw: string, minimum: number): string | undefined {
  if (!WHOLE_NUMBER.test(raw.trim())) return `${JSON.stringify(raw)} is not a whole number`;
  const value = Number(raw);
  if (!Number.isSafeInteger(value)) return `${JSON.stringify(raw)} is too large`;
  if (value < minimum) return `${value} is below its minimum of ${minimum}`;
  return undefined;
}

function fallBack(setting: IntSetting, problem: string): number {
  console.warn(`hdl-board: ${setting.name}=${problem}; using ${setting.fallback}.`);
  return setting.fallback;
}

export type VhdlWaveFormat = 'ghw' | 'vcd';

/**
 * The waveform format of VHDL runs: GHW, which shows FSM states by name (W2). `vcd` only
 * while the GHW reader is being developed (`HDL_WAVE_VHDL_FORMAT`).
 */
export function readVhdlWaveFormat(env: NodeJS.ProcessEnv = process.env): VhdlWaveFormat {
  return env.HDL_WAVE_VHDL_FORMAT?.toLowerCase() === 'vcd' ? 'vcd' : 'ghw';
}
