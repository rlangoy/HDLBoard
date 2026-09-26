// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * Runs the compiled tests: `unit` is every `*.test.js` under dist/ except
 * dist/integration/, `integration` is only dist/integration/.
 *
 * Why a script and not `node --test dist/`: Node 20's runner cannot exclude a
 * directory, and unit tests must stay runnable without GHDL or Icarus installed.
 * A script also behaves the same under cmd.exe and a POSIX shell, where a `find`
 * or glob in an npm script would not.
 */

import { spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { join, sep } from 'node:path';

const DIST_DIR = 'dist';
const INTEGRATION_DIR = join(DIST_DIR, 'integration');
const TEST_FILE_SUFFIX = '.test.js';
const USAGE_EXIT_CODE = 2;

function* filesUnder(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) yield* filesUnder(path);
    else yield path;
  }
}

function isIntegrationTest(path) {
  return path.startsWith(INTEGRATION_DIR + sep);
}

function selectTests(kind) {
  const wantIntegration = kind === 'integration';
  return [...filesUnder(DIST_DIR)]
    .filter((path) => path.endsWith(TEST_FILE_SUFFIX))
    .filter((path) => isIntegrationTest(path) === wantIntegration);
}

function main(kind) {
  if (kind !== 'unit' && kind !== 'integration') {
    console.error('usage: node scripts/run-tests.mjs unit|integration');
    return USAGE_EXIT_CODE;
  }
  const files = selectTests(kind);
  if (files.length === 0) {
    console.log(`No ${kind} tests found under ${DIST_DIR}/.`);
    return 0;
  }
  return spawnSync(process.execPath, ['--test', ...files], { stdio: 'inherit' }).status ?? 1;
}

process.exit(main(process.argv[2]));
