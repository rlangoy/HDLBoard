// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

// Run with `npm test` in this folder (node's own test runner, no Electron needed).

const { describe, test, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const net = require('node:net');
const { BACKEND_PORTS, startOnFirstFreePort } = require('./backendPort');

const LOOPBACK = '127.0.0.1';

/** A stand-in for startBackend: a real socket on loopback, with the same handle shape. */
function startListener(port) {
  const server = net.createServer();
  const handle = {
    port,
    stop: (onClosed) => server.close(() => onClosed?.()),
  };
  handle.ready = new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, LOOPBACK, () => {
      handle.port = server.address().port;
      resolve();
    });
  });
  return handle;
}

async function listening(port) {
  const handle = startListener(port);
  await handle.ready;
  return handle;
}

function closed(handle) {
  return new Promise((resolve) => handle.stop(resolve));
}

/** `count` free ports in a row, starting where the system finds a free one. */
async function freePortsInARow(count) {
  for (;;) {
    const probe = await listening(0);
    await closed(probe);
    const ports = Array.from({ length: count }, (_, i) => probe.port + i);
    const held = [];
    try {
      for (const port of ports) held.push(await listening(port));
      return ports;
    } catch {
      // One of them is taken: try somewhere else.
    } finally {
      await Promise.all(held.map(closed));
    }
  }
}

/** A handle that fails the way a backend on a taken port does. */
function portInUseHandle(port, onStop) {
  const err = Object.assign(new Error(`listen EADDRINUSE ${port}`), { code: 'EADDRINUSE' });
  return { port, ready: Promise.reject(err), stop: (onClosed) => (onStop(port), onClosed()) };
}

describe('startOnFirstFreePort', () => {
  const open = [];
  const keep = (handle) => (open.push(handle), handle);

  afterEach(async () => {
    await Promise.all(open.splice(0).map(closed));
  });

  test('takes the first port when it is free', async () => {
    const ports = await freePortsInARow(3);

    const backend = keep(await startOnFirstFreePort(startListener, ports));

    assert.equal(backend.port, ports[0]);
  });

  test('moves on to the next port when another copy holds the first', async () => {
    const ports = await freePortsInARow(3);
    keep(await listening(ports[0]));

    const backend = keep(await startOnFirstFreePort(startListener, ports));

    assert.equal(backend.port, ports[1]);
  });

  test('rejects with EADDRINUSE when every port is taken', async () => {
    const ports = await freePortsInARow(2);
    for (const port of ports) keep(await listening(port));

    await assert.rejects(startOnFirstFreePort(startListener, ports), { code: 'EADDRINUSE' });
  });

  test('stops each backend that could not get its port', async () => {
    const stoppedPorts = [];
    const start = (port) => (port === 2 ? { port, ready: Promise.resolve() } : portInUseHandle(port, (p) => stoppedPorts.push(p)));

    await startOnFirstFreePort(start, [0, 1, 2]);

    assert.deepEqual(stoppedPorts, [0, 1]);
  });

  test('gives up at once on any other startup error', async () => {
    const tried = [];
    const start = (port) => {
      tried.push(port);
      return { port, ready: Promise.reject(new Error('backend bundle missing')), stop: (onClosed) => onClosed() };
    };

    await assert.rejects(startOnFirstFreePort(start, [1, 2]), /backend bundle missing/);
    assert.deepEqual(tried, [1]);
  });
});

describe('BACKEND_PORTS', () => {
  test('starts at 9010, the port every earlier version used', () => {
    assert.equal(BACKEND_PORTS[0], 9010);
  });
});
