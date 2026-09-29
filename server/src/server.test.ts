// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { createServer, type Server } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, describe, test } from 'node:test';
import { startBackend, type BackendHandle } from './server.js';

const LOOPBACK = '127.0.0.1';

/** A loopback port something is already listening on. */
function occupiedPort(): Promise<{ blocker: Server; port: number }> {
  return new Promise((resolve, reject) => {
    const blocker = createServer();
    blocker.once('error', reject);
    blocker.listen(0, LOOPBACK, () => {
      const address = blocker.address();
      resolve({ blocker, port: typeof address === 'object' && address ? address.port : 0 });
    });
  });
}

async function freePort(): Promise<number> {
  const { blocker, port } = await occupiedPort();
  await new Promise((resolve) => blocker.close(resolve));
  return port;
}

const stopped = (handle: BackendHandle) => new Promise<void>((resolve) => handle.stop(resolve));

describe('the desktop-mode static server', () => {
  let serveDir: string;
  let backend: BackendHandle;
  let base: string;

  before(async () => {
    serveDir = mkdtempSync(join(tmpdir(), 'hdl-board-serve-'));
    writeFileSync(join(serveDir, 'index.html'), '<p>ok</p>');
    backend = startBackend({ port: await freePort(), serveDir });
    await backend.ready;
    base = `http://${LOOPBACK}:${backend.port}`;
  });

  after(async () => {
    await stopped(backend);
    rmSync(serveDir, { recursive: true, force: true });
  });

  test('answers a malformed percent-escape with 400 instead of failing the request', async () => {
    const response = await fetch(`${base}/%E0%A4%A`);
    assert.equal(response.status, 400);
  });

  test('keeps serving after a malformed request', async () => {
    await fetch(`${base}/%E0%A4%A`);
    const response = await fetch(`${base}/`);
    assert.equal(response.status, 200);
    assert.equal(await response.text(), '<p>ok</p>');
  });
});

describe('startBackend on a port that is already taken', () => {
  test('rejects ready with EADDRINUSE instead of throwing an uncaught error', async () => {
    const { blocker, port } = await occupiedPort();
    const backend = startBackend({ port, serveDir: tmpdir() });
    try {
      await assert.rejects(backend.ready, { code: 'EADDRINUSE' });
    } finally {
      await stopped(backend);
      await new Promise((resolve) => blocker.close(resolve));
    }
  });
});
