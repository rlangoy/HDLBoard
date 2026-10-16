// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * Where the shipped plugin VHDL files are (docs/plugin_batch_implementation_plan.md § 5),
 * resolved like `ghdlPath.ts` resolves GHDL: the environment (`HDLBOARD_PLUGIN_DIR`)
 * first, then the directory the packaged app passes to `startBackend()`, then
 * `../plugins/vhdl/` next to the compiled module (`server/plugins/vhdl/` in development
 * and in the Docker image). The installed files are analysed in place and never written.
 */

import { isAbsolute, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const PLUGIN_DIR_ENV = 'HDLBOARD_PLUGIN_DIR';

/** `server/plugins/vhdl/`, seen from `server/dist/pluginRoot.js`. */
const BESIDE_THE_SERVER = fileURLToPath(new URL('../plugins/vhdl/', import.meta.url));

/** A setting that is unset or empty counts as absent. */
const setting = (value: string | undefined): string | undefined => (value ? value : undefined);

/** The plugin root as an absolute path. `pluginDir` is what the packaged app passes. */
export function resolvePluginRoot(env: NodeJS.ProcessEnv, pluginDir?: string, besideTheServer: string = BESIDE_THE_SERVER): string {
  const chosen = setting(env[PLUGIN_DIR_ENV]) ?? setting(pluginDir) ?? besideTheServer;
  return isAbsolute(chosen) ? chosen : resolve(chosen);
}

let pluginRoot = resolvePluginRoot(process.env);

/** Called by `startBackend()` before any session can run. */
export function setPluginRoot(dir: string): void {
  pluginRoot = dir;
}

export function getPluginRoot(): string {
  return pluginRoot;
}
