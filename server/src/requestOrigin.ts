// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * Who may talk to this backend. A browser lets any page open a WebSocket to any host,
 * so without a check a site the student visits could open `ws://127.0.0.1:9010/hdlsim`
 * and run its own VHDL, whose textio can write files anywhere the student can. The page
 * HDLBoard serves always reaches the backend on its own hostname (`hdlBackendUrl` in the
 * frontend), so a browser request must come from that same hostname. In desktop mode the
 * backend listens on loopback only, and the Host must say so too: that stops a site that
 * points its own name at 127.0.0.1 (DNS rebinding). Pure.
 */

import type { IncomingMessage } from 'node:http';

const LOOPBACK_HOSTNAMES: readonly string[] = ['127.0.0.1', 'localhost', '[::1]'];

/** The hostname of a `Host` header (`127.0.0.1:9010` → `127.0.0.1`), or undefined when it is not one. */
function hostnameOf(hostHeader: string | undefined): string | undefined {
  if (hostHeader === undefined) return undefined;
  try {
    return new URL(`http://${hostHeader}`).hostname;
  } catch {
    return undefined;
  }
}

/** Whether a page at `origin` is on the host the request was sent to; the port may differ (Vite, Docker). */
export function isSameHost(origin: string, hostHeader: string | undefined): boolean {
  const hostname = hostnameOf(hostHeader);
  if (hostname === undefined) return false;
  try {
    return new URL(origin).hostname === hostname;
  } catch {
    return false;
  }
}

export function isLoopbackHost(hostHeader: string | undefined): boolean {
  const hostname = hostnameOf(hostHeader);
  return hostname !== undefined && LOOPBACK_HOSTNAMES.includes(hostname);
}

/**
 * Whether a WebSocket upgrade may become a session: from the page's own host (or from
 * a client that is no browser and sends no Origin, as the tests do), and on a loopback
 * Host when `loopbackOnly`.
 */
export function socketRequestAllowed(request: IncomingMessage, { loopbackOnly }: { loopbackOnly: boolean }): boolean {
  const host = request.headers.host;
  if (loopbackOnly && !isLoopbackHost(host)) return false;
  const origin = request.headers.origin;
  return origin === undefined || isSameHost(origin, host);
}
