// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/** PKCE (RFC 7636) with the S256 method, the only one GitHub accepts. */

export function randomUrlSafeString(byteCount = 32): string {
  return toBase64Url(crypto.getRandomValues(new Uint8Array(byteCount)));
}

export async function codeChallengeFor(codeVerifier: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(codeVerifier));
  return toBase64Url(new Uint8Array(digest));
}

function toBase64Url(bytes: Uint8Array): string {
  const binary = Array.from(bytes, (byte) => String.fromCharCode(byte)).join('');
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
