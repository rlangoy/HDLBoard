// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { connect, createServer, type Server } from 'node:net';
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

  // `GET //` is no URL to `new URL`, and its throw in the upgrade handler used to end the process.
  test('answers an upgrade whose target is no URL with 404, and keeps serving', async () => {
    const reply = await new Promise<string>((resolve, reject) => {
      const socket = connect(backend.port, LOOPBACK, () =>
        socket.write(
          'GET // HTTP/1.1\r\nHost: 127.0.0.1\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n' +
            'Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\nSec-WebSocket-Version: 13\r\n\r\n',
        ),
      );
      let text = '';
      socket.on('data', (chunk) => (text += String(chunk)));
      socket.on('close', () => resolve(text));
      socket.on('error', reject);
    });
    assert.match(reply, /^HTTP\/1\.1 404/);
    assert.equal(await opens('/hdlsim'), true);
  });
});

describe('a full server (HDL_MAX_SESSIONS, HDL_IDLE_GRACE_SECONDS, HDL_REPLACE_AFTER_MINUTES)', () => {
  const SECOND = 1000;
  const MINUTE = 60 * SECOND;
  /** RFC 6455's "Try Again Later", what a busy close carries. */
  const TRY_AGAIN_LATER = 1013;
  const REFUSED = /all|only simulation session is in use/;
  const CLOSED_IDLE = /closed because it was not simulating.*HDLBoard\/releases/s;

  interface Peer {
    readonly ws: WebSocket;
    readonly texts: string[];
    readonly closed: Promise<number>;
  }

  /** An open socket on `/hdlsim` from `address`, as a proxy names it, keeping every text frame it receives. */
  const connect = (port: number, address: string) =>
    new Promise<Peer>((resolve, reject) => {
      const ws = new WebSocket(`ws://${LOOPBACK}:${port}/hdlsim`, { headers: { 'x-forwarded-for': address } });
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

  /** Whether `peer` answers HELLO, the way a session that kept its place does. */
  const welcomed = async (peer: Peer) => {
    peer.ws.send('HELLO 5');
    return (await frame(peer, 'WELCOME')) === 'WELCOME 6';
  };

  interface Scenario {
    /** Where the second connection comes from; the first is from `lab-1`. */
    readonly secondFrom: string;
    /** How long after the first the second connects. */
    readonly afterMs: number;
    readonly replaceAfterMinutes?: number;
  }

  /**
   * On a one-session backend with a 60 s grace period, an idle first connection, then a
   * second: `check` gets both while the backend is up.
   */
  const whenSecondConnects = async (scenario: Scenario, check: (first: Peer, second: Peer) => Promise<void>) => {
    const clock = { now: 1_000_000 };
    const { replaceAfterMinutes = 9 } = scenario;
    const backend = startBackend({
      port: await freePort(),
      maxSessions: 1,
      replaceAfterMinutes,
      idleGraceSeconds: 60,
      now: () => clock.now,
    });
    await backend.ready;
    try {
      const first = await connect(backend.port, 'lab-1');
      clock.now += scenario.afterMs;
      const second = await connect(backend.port, scenario.secondFrom);
      await check(first, second);
      first.ws.close();
      second.ws.close();
    } finally {
      await stopped(backend);
    }
  };

  const WITHIN_GRACE: Scenario = { secondFrom: 'lab-2', afterMs: 30 * SECOND };
  const PAST_GRACE: Scenario = { secondFrom: 'lab-2', afterMs: 60 * SECOND };
  const SAME_ADDRESS: Scenario = { secondFrom: 'lab-1', afterMs: SECOND };
  const NEVER_REPLACE: Scenario = { secondFrom: 'lab-2', afterMs: 600 * MINUTE, replaceAfterMinutes: 0 };

  test('refuses a newcomer while the idle session there is within the grace period', () =>
    whenSecondConnects(WITHIN_GRACE, async (_first, second) => {
      assert.match(await frame(second, 'ERROR busy\n'), REFUSED);
    }));

  test('closes the refused socket as Try Again Later', () =>
    whenSecondConnects(WITHIN_GRACE, async (_first, second) => {
      assert.equal(await second.closed, TRY_AGAIN_LATER);
    }));

  test('the session spared by the grace period keeps its place', () =>
    whenSecondConnects(WITHIN_GRACE, async (first) => {
      assert.equal(await welcomed(first), true);
    }));

  test('closes an idle session past the grace period, telling its student why', () =>
    whenSecondConnects(PAST_GRACE, async (first) => {
      assert.match(await frame(first, 'ERROR busy\n'), CLOSED_IDLE);
    }));

  test('the newcomer takes the place of the session closed for it', () =>
    whenSecondConnects(PAST_GRACE, async (_first, second) => {
      assert.equal(await welcomed(second), true);
    }));

  test('closes an idle session within the grace period when the newcomer shares its address', () =>
    whenSecondConnects(SAME_ADDRESS, async (first) => {
      assert.match(await frame(first, 'ERROR busy\n'), CLOSED_IDLE);
    }));

  test('never closes one with a limit of 0', () =>
    whenSecondConnects(NEVER_REPLACE, async (first, second) => {
      await frame(second, 'ERROR busy\n');
      assert.equal(first.ws.readyState, WebSocket.OPEN);
    }));

  test('logs each ERROR busy it sends', async (t) => {
    const log = t.mock.method(console, 'log', () => {});
    await whenSecondConnects(PAST_GRACE, async (first) => {
      await frame(first, 'ERROR busy\n');
    });
    const lines = log.mock.calls.map((call) => String(call.arguments[0]));
    assert.ok(lines.includes('hdl-board: ERROR busy: closed a session open 1 min (idle 1 min) to make room for a new one'));
  });
});
