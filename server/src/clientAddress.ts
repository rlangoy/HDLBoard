// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import type { IncomingMessage } from 'node:http';
import { isIP } from 'node:net';

/** What a connection with no address at all is filed under. */
export const UNKNOWN_ADDRESS = 'unknown';

/**
 * Where a student connects from. Only the full-server policy uses it, to see one student's
 * many tabs (sessionLimit.ts) — and a forged address there takes the grace period from
 * whoever really has it, so it must not come from the client.
 *
 * `trustedProxies` is how many proxies sit in front of the backend (`HDL_TRUSTED_PROXIES`),
 * each appending the address it was reached from to `X-Forwarded-For`, as nginx's
 * `$proxy_add_x_forwarded_for` does. The address is the entry the outermost of them added:
 * the `trustedProxies`-th from the right. Entries left of it are whatever the client sent.
 * With 0 (the default) the header is ignored and the socket's own peer is the address.
 */
export function clientAddress(req: IncomingMessage, trustedProxies = 0): string {
  const peer = req.socket.remoteAddress ?? UNKNOWN_ADDRESS;
  if (trustedProxies <= 0) return peer;
  return addedByOutermostProxy(req.headers['x-forwarded-for'], trustedProxies) ?? peer;
}

function addedByOutermostProxy(header: string | string[] | undefined, trustedProxies: number): string | undefined {
  const joined = Array.isArray(header) ? header.join(',') : header;
  const entries = (joined ?? '')
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry !== '');
  if (entries.length === 0) return undefined;
  // Fewer entries than proxies: every one was added by a trusted proxy, so the first is the client.
  const entry = entries[Math.max(0, entries.length - trustedProxies)];
  return isIP(entry) ? entry : undefined;
}
