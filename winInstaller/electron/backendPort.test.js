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

const FREE_PORT_ATTEMPTS = 20;

/** `count` free ports in a row, starting where the system finds a free one. */
async function freePortsInARow(count) {
  for (let attempt = 0; attempt < FREE_PORT_ATTEMPTS; attempt++) {
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
  throw new Error(`found no ${count} free ports in a row`);
}

/** A handle whose listen failed with `code`, as a backend's does. */
function failedHandle(port, code, onStop = () => {}) {
  const err = Object.assign(new Error(`listen ${code} ${port}`), { code });
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
    const start = (port) => (port === 2 ? { port, ready: Promise.resolve() } : failedHandle(port, 'EADDRINUSE', (p) => stoppedPorts.push(p)));

    await startOnFirstFreePort(start, [0, 1, 2]);

    assert.deepEqual(stoppedPorts, [0, 1]);
  });

  test('skips a port Windows has reserved', async () => {
    const start = (port) => (port === 2 ? { port, ready: Promise.resolve() } : failedHandle(port, 'EACCES'));

    const backend = await startOnFirstFreePort(start, [1, 2]);

    assert.equal(backend.port, 2);
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
