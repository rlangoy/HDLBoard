// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import { defineConfig } from 'vitest/config';

/**
 * Unit tests for the frontend's pure modules (docs/Verilog_implementation_plan.md
 * § 7.2). Only `src/` is searched: the backend's tests live in `server/` and run
 * under Node's own runner, which vitest must not try to execute.
 */
export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
});
