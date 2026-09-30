// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * The backend's numeric settings from the environment. Each has an `HDL_*` name —
 * the backend serves GHDL and Icarus Verilog alike — and the `GHDL_*` name it had
 * when GHDL was the only simulator, still read so existing deployments (service
 * files, `.env` files, hosting dashboards) keep working unchanged.
 */

export interface IntSetting {
  readonly name: string;
  readonly legacyName: string;
  readonly fallback: number;
}

export const WS_PORT: IntSetting = { name: 'HDL_WS_PORT', legacyName: 'GHDL_WS_PORT', fallback: 9010 };
export const MAX_SESSIONS: IntSetting = { name: 'HDL_MAX_SESSIONS', legacyName: 'GHDL_MAX_SESSIONS', fallback: 32 };

/** The setting's value: its own name first, then its legacy name, then the fallback. */
export function readIntSetting(setting: IntSetting, env: NodeJS.ProcessEnv = process.env): number {
  const raw = env[setting.name] ?? env[setting.legacyName];
  return raw === undefined ? setting.fallback : parseInt(raw, 10);
}
