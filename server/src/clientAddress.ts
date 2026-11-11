// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import type { IncomingMessage } from 'node:http';

/** What a connection with no address at all is filed under. */
export const UNKNOWN_ADDRESS = 'unknown';

/**
 * Where a student connects from: the first `X-Forwarded-For` entry when a proxy (nginx,
 * Render) sent one, else the socket's own peer. Only the full-server policy uses it, to see
 * one student's many tabs (sessionLimit.ts). The header is not verified: a client that forges
 * it changes nothing but whether its own idle sessions get the grace period.
 */
export function clientAddress(req: IncomingMessage): string {
  return firstForwardedFor(req.headers['x-forwarded-for']) ?? req.socket.remoteAddress ?? UNKNOWN_ADDRESS;
}

function firstForwardedFor(header: string | string[] | undefined): string | undefined {
  const joined = Array.isArray(header) ? header.join(',') : header;
  const first = joined?.split(',')[0]?.trim();
  return first ? first : undefined;
}
