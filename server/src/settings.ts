// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * The backend's settings from the environment. Each has an `HDL_*` name — the backend
 * serves GHDL and Icarus Verilog alike — and the older ones also the `GHDL_*` name they
 * had when GHDL was the only simulator, still read so existing deployments (service
 * files, `.env` files, hosting dashboards) keep working unchanged.
 */

export interface IntSetting {
  readonly name: string;
  /** Only for settings that existed before Verilog. */
  readonly legacyName?: string;
  readonly fallback: number;
}

export const WS_PORT: IntSetting = { name: 'HDL_WS_PORT', legacyName: 'GHDL_WS_PORT', fallback: 9010 };
export const MAX_SESSIONS: IntSetting = { name: 'HDL_MAX_SESSIONS', legacyName: 'GHDL_MAX_SESSIONS', fallback: 32 };

/** The largest waveform file a run may write, 16 MiB (docs/waveform_viewer_spec.md § 7.5, W6). */
export const MAX_WAVE_BYTES: IntSetting = { name: 'HDL_MAX_WAVE_BYTES', fallback: 16_777_216 };
/** How often the session checks the waveform file's size while a run is going. */
export const WAVE_CHECK_MS: IntSetting = { name: 'HDL_WAVE_CHECK_MS', fallback: 250 };

/** The setting's value: its own name first, then its legacy name, then the fallback. */
export function readIntSetting(setting: IntSetting, env: NodeJS.ProcessEnv = process.env): number {
  const raw = env[setting.name] ?? (setting.legacyName === undefined ? undefined : env[setting.legacyName]);
  return raw === undefined ? setting.fallback : parseInt(raw, 10);
}

export type VhdlWaveFormat = 'ghw' | 'vcd';

/**
 * The waveform format of VHDL runs: GHW, which shows FSM states by name (W2). `vcd` only
 * while the GHW reader is being developed (`HDL_WAVE_VHDL_FORMAT`).
 */
export function readVhdlWaveFormat(env: NodeJS.ProcessEnv = process.env): VhdlWaveFormat {
  return env.HDL_WAVE_VHDL_FORMAT?.toLowerCase() === 'vcd' ? 'vcd' : 'ghw';
}
