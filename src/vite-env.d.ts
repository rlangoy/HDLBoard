// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Port of the simulation backend's WebSocket, baked into the page at build time. */
  readonly VITE_HDL_WS_PORT?: string;
  /** Older name of VITE_HDL_WS_PORT, still read when that one is unset. */
  readonly VITE_GHDL_WS_PORT?: string;
}

/** This package's version, injected by vite.config.ts (`define`). */
declare const __APP_VERSION__: string;
