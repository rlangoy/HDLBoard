// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * The bundled Icarus tree installed under a path with a space — `C:\Program Files\…`,
 * the location the installer offers when a student installs for all users. `iverilog`
 * hands its `-B` directory unquoted to `cmd.exe`, so without the backend's 8.3
 * short-path conversion every compile there failed with "'C:\Program' is not
 * recognized as an internal or external command". Windows and a bundled tree only.
 */

import assert from 'node:assert/strict';
import { cpSync } from 'node:fs';
import { join } from 'node:path';
import { after, before, describe, test } from 'node:test';
import { readFixture } from '../testSupport/fixture.js';
import { icarusForTests } from '../testSupport/icarus.js';
import { makeTempDir } from '../testSupport/sessionDir.js';
import { startTestBackend, type TestBackend } from '../testSupport/testBackend.js';
import { startRun, withSession } from '../testSupport/withSession.js';

const icarus = icarusForTests();
const skip =
  process.platform !== 'win32'
    ? 'the unquoted -B path is a Windows (cmd.exe) problem'
    : icarus.skip || (icarus.tools.bundledDir === undefined ? 'needs the bundled Icarus tree (IVERILOG_DIR)' : false);

describe('Icarus installed under a path with a space', { skip }, () => {
  const install = makeTempDir('hdlboard-install-');
  let backend: TestBackend;

  before(async () => {
    const tree = join(install.path, 'Program Files', 'HDLBoard', 'resources', 'iverilog');
    cpSync(icarus.tools.bundledDir as string, tree, { recursive: true });
    backend = await startTestBackend({ iverilogDir: tree });
  });

  after(() => {
    backend?.stop();
    install.cleanup();
  });

  test('compiles and runs the DE1-SoC top level', () =>
    withSession(backend.port, async (client) => {
      const file = { name: 'DE1_SoC.v', content: readFixture('verilog', 'DE1_SoC.v') };
      await startRun(client, [file], file.name);
      const failure = client.frames.find((frame) => frame.verb === 'ERROR');
      assert.equal(failure, undefined, failure?.verb === 'ERROR' ? failure.text : '');
    }));
});
