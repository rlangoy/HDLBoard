// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * Starts the real backend in-process on a free loopback port, for integration tests
 * (docs/Verilog_implementation_plan.md § 7.2).
 */

import { createServer, connect } from 'node:net';
import { tmpdir } from 'node:os';
import { startBackend, type BackendOptions } from '../server.js';

const LOOPBACK = '127.0.0.1';
const CONNECT_RETRY_MS = 25;
const READY_TIMEOUT_MS = 5_000;

export interface TestBackend {
  readonly port: number;
  stop(): Promise<void>;
}

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const probe = createServer();
    probe.once('error', reject);
    probe.listen(0, LOOPBACK, () => {
      const address = probe.address();
      const port = typeof address === 'object' && address ? address.port : 0;
      probe.close(() => resolve(port));
    });
  });
}

function accepts(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = connect(port, LOOPBACK);
    socket.once('connect', () => socket.end(() => resolve(true)));
    socket.once('error', () => resolve(false));
  });
}

async function waitUntilAccepting(port: number): Promise<void> {
  const deadline = Date.now() + READY_TIMEOUT_MS;
  while (!(await accepts(port))) {
    if (Date.now() > deadline) throw new Error(`backend did not start listening on port ${port}`);
    await new Promise((resolve) => setTimeout(resolve, CONNECT_RETRY_MS));
  }
}

export async function startTestBackend(options: Omit<BackendOptions, 'port'> = {}): Promise<TestBackend> {
  const port = await freePort();
  // `serveDir` is what makes the backend bind loopback only (desktop mode); without
  // it a test run would listen on every interface and could trigger a firewall
  // prompt. The directory is never requested.
  const handle = startBackend({ serveDir: tmpdir(), ...options, port });
  await waitUntilAccepting(port);
  return { port, stop: () => new Promise<void>((resolve) => handle.stop(resolve)) };
}
