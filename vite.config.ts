// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import pkg from './package.json';

export default defineConfig({
  plugins: [react()],
  // Shown in the About dialog — one source of truth, this package's version.
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  base: './',
  server: { port: 5173, open: false },
});
