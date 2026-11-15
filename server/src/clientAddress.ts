// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import type { IncomingMessage } from 'node:http';
import { BlockList, isIP } from 'node:net';

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

/**
 * How the server log names a client: `clientAddress`, and, when that ignores the
 * `X-Forwarded-For` header (`HDL_TRUSTED_PROXIES` is 0), the nearest address in it that
 * is not this machine: behind a proxy on the same machine every peer is 127.0.0.1, and
 * the entry that proxy adds may be ::1 (Render's container: `<student>, ::1`), neither of
 * which tells an operator anything. Only for logs: the header is not checked, so it is
 * labelled as what it is and never steers the full-server policy.
 */
export function loggedAddress(req: IncomingMessage, trustedProxies = 0): string {
  const address = clientAddress(req, trustedProxies);
  if (trustedProxies > 0) return address;
  const forwarded = entriesOf(req.headers['x-forwarded-for']).reverse().find((entry) => isIP(entry) && !isLoopback(entry));
  return forwarded === undefined || forwarded === address ? address : `${address} (forwarded for ${forwarded})`;
}

/** This machine in any spelling: `::1`, `0:0:0:0:0:0:0:1`, `127.x.x.x`, `::ffff:7f00:1`. */
const LOOPBACK = new BlockList();
const LOOPBACK_PREFIX = 8;
/** The bits of `::ffff:` in front of an IPv4 address mapped into IPv6. */
const MAPPED_IPV4_BITS = 96;
const MAPPED_LOOPBACK_PREFIX = MAPPED_IPV4_BITS + LOOPBACK_PREFIX;
const IPV6 = 6;
LOOPBACK.addSubnet('127.0.0.0', LOOPBACK_PREFIX, 'ipv4');
LOOPBACK.addAddress('::1', 'ipv6');
LOOPBACK.addSubnet('::ffff:127.0.0.0', MAPPED_LOOPBACK_PREFIX, 'ipv6');

/** `address` must already be an IP address (`isIP`). */
function isLoopback(address: string): boolean {
  return LOOPBACK.check(address, isIP(address) === IPV6 ? 'ipv6' : 'ipv4');
}

function entriesOf(header: string | string[] | undefined): string[] {
  const joined = Array.isArray(header) ? header.join(',') : header;
  return (joined ?? '')
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry !== '');
}

function addedByOutermostProxy(header: string | string[] | undefined, trustedProxies: number): string | undefined {
  const entries = entriesOf(header);
  if (entries.length === 0) return undefined;
  // Fewer entries than proxies: every one was added by a trusted proxy, so the first is the client.
  const entry = entries[Math.max(0, entries.length - trustedProxies)];
  return isIP(entry) ? entry : undefined;
}
