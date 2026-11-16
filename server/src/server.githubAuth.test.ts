// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/** The per-address limit on GitHub sign-ins (githubAuth.ts), over real HTTP to the backend. */

import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import type { BackendOptions } from './server.js';
import { startTestBackend } from './testSupport/testBackend.js';

const TIMEOUT = { timeout: 5000 };
/**
 * A request on Render as the backend gets it once nginx has appended `::1`: the student,
 * the Cloudflare edge, Render's balancer, nginx (measured from the access log, 2026-11-16).
 * A wrong client ID is refused before github.com is called, so no test reaches it.
 */
const renderChain = (student: string) => `${student}, 162.158.223.18, 10.30.143.103, ::1`;

async function withBackend(options: Omit<BackendOptions, 'port'>, check: (post: Poster) => Promise<void>): Promise<void> {
  const backend = await startTestBackend({ now: () => 1_000_000, githubOAuthApp: { clientId: 'app', clientSecret: '' }, ...options });
  const post: Poster = (route, forwardedFor) =>
    fetch(`http://127.0.0.1:${backend.port}/github-auth/${route}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': forwardedFor },
      body: JSON.stringify({ client_id: 'not-the-app' }),
    });
  try {
    await check(post);
  } finally {
    await backend.stop();
  }
}

type Poster = (route: string, forwardedFor: string) => Promise<Response>;

describe('GitHub sign-in limit', () => {
  test('refuses an address over its sign-ins with 429, and a student behind Cloudflare keeps their own budget', TIMEOUT, async () => {
    await withBackend({ githubSignInsPerMinute: 2, trustedProxies: 2, trustedHttpProxies: 4 }, async (post) => {
      assert.equal((await post('device/code', renderChain('198.51.100.1'))).status, 403);
      assert.equal((await post('web/token', renderChain('198.51.100.1'))).status, 403);
      const refused = await post('device/code', renderChain('198.51.100.1'));
      assert.equal(refused.status, 429);
      assert.equal(refused.headers.get('retry-after'), '60');
      assert.equal(((await refused.json()) as { error: string }).error, 'too_many_requests');

      // Another student through the same Cloudflare edge and balancer is not refused.
      assert.equal((await post('device/code', renderChain('203.0.113.9'))).status, 403);
    });
  });

  test('an entry the client made up is skipped, so it buys no fresh budget', TIMEOUT, async () => {
    await withBackend({ githubSignInsPerMinute: 1, trustedProxies: 2, trustedHttpProxies: 4 }, async (post) => {
      assert.equal((await post('device/code', renderChain('198.51.100.1'))).status, 403);
      assert.equal((await post('device/code', `192.0.2.50, ${renderChain('198.51.100.1')}`)).status, 429);
    });
  });

  test('polling for the token is not counted: a sign-in polls every 5 s', TIMEOUT, async () => {
    await withBackend({ githubSignInsPerMinute: 1, trustedProxies: 2, trustedHttpProxies: 4 }, async (post) => {
      for (let poll = 0; poll < 5; poll++) assert.equal((await post('device/token', renderChain('198.51.100.1'))).status, 403);
      assert.equal((await post('device/code', renderChain('198.51.100.1'))).status, 403);
    });
  });

  test('without a separate HTTP count, plain requests use HDL_TRUSTED_PROXIES', TIMEOUT, async () => {
    await withBackend({ githubSignInsPerMinute: 1, trustedProxies: 1 }, async (post) => {
      assert.equal((await post('device/code', '192.0.2.50, 198.51.100.1')).status, 403);
      assert.equal((await post('device/code', '192.0.2.51, 198.51.100.1')).status, 429);
      assert.equal((await post('device/code', '192.0.2.50, 203.0.113.9')).status, 403);
    });
  });
});
