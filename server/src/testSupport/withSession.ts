// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * The two steps nearly every integration test starts with: open a session on the
 * backend, and start a board run and wait for it to be ready.
 */

import type { VhdlFileInput } from '../protocol.js';
import { WsTestClient } from './WsTestClient.js';

/** Connects, says HELLO, runs `body`, and always closes the connection afterwards. */
export async function withSession(port: number, body: (client: WsTestClient) => Promise<void>): Promise<void> {
  const client = await WsTestClient.connect(port);
  try {
    await client.hello();
    await body(client);
  } finally {
    await client.close();
  }
}

/** Sends RUN and waits for READY; throws (with the frames seen) if it never comes. */
export async function startRun(client: WsTestClient, files: VhdlFileInput[], topFile: string): Promise<void> {
  client.run(files, topFile);
  await client.until((frame) => frame.verb === 'READY');
}
