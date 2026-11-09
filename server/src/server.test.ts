// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { createServer, type Server } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, describe, test } from 'node:test';
import { WebSocket } from 'ws';
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
    backend = startBackend({ port: await freePort(), serveDir, githubOAuthApp: { clientId: 'test-app', clientSecret: '' } });
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

  test('answers the GitHub sign-in routes ahead of the page files (the Windows app)', async () => {
    const response = await fetch(`${base}/github-auth/config`);
    assert.deepEqual(await response.json(), { clientId: 'test-app', webFlow: false });
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

describe('the WebSocket endpoint path', () => {
  let backend: BackendHandle;

  before(async () => {
    backend = startBackend({ port: await freePort() });
    await backend.ready;
  });

  after(() => stopped(backend));

  test('answers the GitHub sign-in routes in server mode too', async () => {
    const response = await fetch(`http://${LOOPBACK}:${backend.port}/github-auth/config`);
    assert.equal(response.status, 200);
  });

  /**
   * Whether a WebSocket upgrade on `path` opens (true) or is refused (false). The `ws`
   * package rather than Node's global WebSocket, which Node 18 and 20 do not have.
   */
  const opens = (path: string, origin?: string) =>
    new Promise<boolean>((resolve) => {
      const ws = new WebSocket(`ws://${LOOPBACK}:${backend.port}${path}`, origin === undefined ? {} : { origin });
      ws.once('open', () => {
        ws.close();
        resolve(true);
      });
      ws.once('error', () => resolve(false));
    });

  test('accepts /hdlsim', async () => assert.equal(await opens('/hdlsim'), true));
  test('still accepts the legacy /ghdlsim', async () => assert.equal(await opens('/ghdlsim'), true));
  test('refuses any other path', async () => assert.equal(await opens('/other'), false));

  // Another site must not run VHDL here: its textio could write files anywhere (requestOrigin.ts).
  test('refuses a page from another site', async () => assert.equal(await opens('/hdlsim', 'https://evil.example'), false));
  test("accepts the page's own host on another port (Vite, Docker)", async () =>
    assert.equal(await opens('/hdlsim', `http://${LOOPBACK}:5173`), true));
});

describe('a full server (HDL_MAX_SESSIONS, HDL_REPLACE_AFTER_MINUTES)', () => {
  const MINUTE = 60_000;
  /** RFC 6455's "Try Again Later", what a busy close carries. */
  const TRY_AGAIN_LATER = 1013;

  interface Peer {
    readonly ws: WebSocket;
    readonly texts: string[];
    readonly closed: Promise<number>;
  }

  /** An open socket on `/hdlsim`, keeping every text frame it receives. */
  const connect = (port: number) =>
    new Promise<Peer>((resolve, reject) => {
      const ws = new WebSocket(`ws://${LOOPBACK}:${port}/hdlsim`);
      const texts: string[] = [];
      ws.on('message', (data) => texts.push(String(data)));
      const closed = new Promise<number>((done) => ws.once('close', (code) => done(code)));
      ws.once('open', () => resolve({ ws, texts, closed }));
      ws.once('error', reject);
    });

  /** The first frame that answers `prefix`, waiting for it. */
  const frame = async (peer: Peer, prefix: string) => {
    for (let tries = 0; tries < 100; tries++) {
      const found = peer.texts.find((t) => t.startsWith(prefix));
      if (found !== undefined) return found;
      await new Promise((r) => setTimeout(r, 20));
    }
    throw new Error(`no ${prefix} frame; got ${JSON.stringify(peer.texts)}`);
  };

  /** A one-session backend on a clock the test moves. */
  const fullBackend = async (replaceAfterMinutes: number) => {
    const clock = { now: 1_000_000 };
    const backend = startBackend({ port: await freePort(), maxSessions: 1, replaceAfterMinutes, now: () => clock.now });
    await backend.ready;
    return { backend, clock };
  };

  test('refuses a new session while the one there is younger than the limit', async () => {
    const { backend, clock } = await fullBackend(9);
    try {
      const first = await connect(backend.port);
      clock.now += 8 * MINUTE;
      const second = await connect(backend.port);
      assert.match(await frame(second, 'ERROR busy\n'), /all|only simulation session is in use/);
      assert.equal(await second.closed, TRY_AGAIN_LATER);
      // The first keeps its place.
      first.ws.send('HELLO 5');
      assert.equal(await frame(first, 'WELCOME'), 'WELCOME 6');
      assert.equal(first.texts.filter((t) => t.startsWith('ERROR')).length, 0);
      first.ws.close();
    } finally {
      await stopped(backend);
    }
  });

  test('closes a session open past the limit and takes the new one', async () => {
    const { backend, clock } = await fullBackend(9);
    try {
      const first = await connect(backend.port);
      clock.now += 9 * MINUTE;
      const second = await connect(backend.port);
      assert.match(await frame(first, 'ERROR busy\n'), /closed because the server is under heavy load.*HDLBoard\/releases/s);
      assert.equal(await first.closed, TRY_AGAIN_LATER);
      second.ws.send('HELLO 5');
      assert.equal(await frame(second, 'WELCOME'), 'WELCOME 6');
      assert.equal(second.texts.filter((t) => t.startsWith('ERROR')).length, 0);
      second.ws.close();
    } finally {
      await stopped(backend);
    }
  });

  test('never closes one with a limit of 0', async () => {
    const { backend, clock } = await fullBackend(0);
    try {
      const first = await connect(backend.port);
      clock.now += 600 * MINUTE;
      const second = await connect(backend.port);
      await frame(second, 'ERROR busy\n');
      assert.equal(await second.closed, TRY_AGAIN_LATER);
      assert.equal(first.ws.readyState, WebSocket.OPEN);
      first.ws.close();
    } finally {
      await stopped(backend);
    }
  });
});
