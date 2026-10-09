// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * GitHub sign-in routes for the page (docs/GITHUB.md). github.com sends no CORS
 * headers on its OAuth endpoints, and the one-click web flow needs the OAuth App's
 * client secret, which must never reach the browser, so the page posts here:
 *
 *   GET  /github-auth/config        -> { clientId, webFlow: true when a client secret is set }
 *   POST /github-auth/device/code   -> https://github.com/login/device/code
 *   POST /github-auth/device/token  -> https://github.com/login/oauth/access_token (device code grant)
 *   POST /github-auth/web/token     -> https://github.com/login/oauth/access_token (code + PKCE verifier + secret)
 *
 * Stores nothing and logs nothing: the bodies hold codes and tokens. Only the
 * configured client ID is forwarded, and only the parameters each route needs.
 */

import type { IncomingMessage, ServerResponse } from 'node:http';

export const GITHUB_AUTH_PATH = '/github-auth';

/**
 * Public client ID of HDLBoard's GitHub OAuth App; not a secret. A fork or a host
 * with its own OAuth App sets GITHUB_CLIENT_ID (and GITHUB_CLIENT_SECRET for the
 * one-click sign-in) in the backend's environment instead.
 */
export const DEFAULT_GITHUB_CLIENT_ID = 'Ov23liDFfwtpvKX3SMvz';

export interface OAuthAppCredentials {
  clientId: string;
  /** Empty when only the device flow is available. */
  clientSecret: string;
}

export interface ForwardResult {
  status: number;
  body: unknown;
}

type FetchFn = (input: string, init?: RequestInit) => Promise<Response>;

interface Route {
  url: string;
  allowedParams: readonly string[];
  needsSecret: boolean;
}

const DEVICE_CODE_URL = 'https://github.com/login/device/code';
const ACCESS_TOKEN_URL = 'https://github.com/login/oauth/access_token';
const DEVICE_GRANT_TYPE = 'urn:ietf:params:oauth:grant-type:device_code';
const MAX_BODY_BYTES = 4096;
const HTTP_NO_CONTENT = 204;

const ROUTES: Readonly<Record<string, Route>> = {
  'device/code': { url: DEVICE_CODE_URL, allowedParams: ['client_id', 'scope'], needsSecret: false },
  'device/token': { url: ACCESS_TOKEN_URL, allowedParams: ['client_id', 'device_code', 'grant_type'], needsSecret: false },
  'web/token': { url: ACCESS_TOKEN_URL, allowedParams: ['client_id', 'code', 'code_verifier', 'redirect_uri'], needsSecret: true },
};

export function credentialsFromEnv(env: NodeJS.ProcessEnv): OAuthAppCredentials {
  return {
    clientId: env.GITHUB_CLIENT_ID?.trim() || DEFAULT_GITHUB_CLIENT_ID,
    clientSecret: env.GITHUB_CLIENT_SECRET?.trim() ?? '',
  };
}

/** Forwards one OAuth request to github.com for the configured OAuth App. */
export class GitHubAuthForwarder {
  constructor(
    private readonly credentials: OAuthAppCredentials,
    private readonly fetchFn: FetchFn = (input, init) => fetch(input, init),
  ) {}

  get config(): { clientId: string; webFlow: boolean } {
    return { clientId: this.credentials.clientId, webFlow: this.isWebFlowAvailable };
  }

  async forward(routeName: string, params: Record<string, unknown>): Promise<ForwardResult> {
    const route = ROUTES[routeName];
    if (route === undefined) return { status: 404, body: { error: 'not_found' } };

    const form = toForm(params, route.allowedParams);
    const refusal = this.refusalFor(routeName, route, form);
    if (refusal !== null) return refusal;
    if (route.needsSecret) form.set('client_secret', this.credentials.clientSecret);
    return this.postToGitHub(route.url, form);
  }

  private get isWebFlowAvailable(): boolean {
    return this.credentials.clientSecret !== '';
  }

  private refusalFor(routeName: string, route: Route, form: URLSearchParams): ForwardResult | null {
    if (form.get('client_id') !== this.credentials.clientId) return { status: 403, body: { error: 'client_not_allowed' } };
    if (route.needsSecret && !this.isWebFlowAvailable) return { status: 501, body: { error: 'web_flow_not_configured' } };
    if (routeName === 'device/token' && form.get('grant_type') !== DEVICE_GRANT_TYPE) {
      return { status: 400, body: { error: 'unsupported_grant_type' } };
    }
    return null;
  }

  private async postToGitHub(url: string, form: URLSearchParams): Promise<ForwardResult> {
    try {
      const response = await this.fetchFn(url, {
        method: 'POST',
        headers: { Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' },
        body: form.toString(),
      });
      return { status: response.status, body: await response.json() };
    } catch {
      return { status: 502, body: { error: 'bad_gateway', error_description: 'github.com could not be reached' } };
    }
  }
}

export function isGitHubAuthPath(path: string): boolean {
  return path.startsWith(`${GITHUB_AUTH_PATH}/`);
}

/**
 * Answers one request under GITHUB_AUTH_PATH. In development the page comes from
 * Vite on another port of the same host, so a page on the backend's own host name
 * may call these routes cross-origin; any other site may not.
 */
export async function handleGitHubAuthRequest(
  forwarder: GitHubAuthForwarder,
  request: IncomingMessage,
  response: ServerResponse,
): Promise<void> {
  const corsHeaders = corsHeadersFor(request);
  if (corsHeaders === null) return sendJson(response, { status: 403, body: { error: 'origin_not_allowed' } }, {});

  const routeName = (request.url ?? '').split('?')[0].slice(GITHUB_AUTH_PATH.length + 1);
  if (request.method === 'OPTIONS') return sendEmpty(response, corsHeaders);
  if (request.method === 'GET' && routeName === 'config') {
    return sendJson(response, { status: 200, body: forwarder.config }, corsHeaders);
  }
  if (request.method !== 'POST') return sendJson(response, { status: 405, body: { error: 'method_not_allowed' } }, corsHeaders);

  let params: Record<string, unknown>;
  try {
    params = await readJsonBody(request);
  } catch {
    return sendJson(response, { status: 400, body: { error: 'bad_request' } }, corsHeaders);
  }
  sendJson(response, await forwarder.forward(routeName, params), corsHeaders);
}

/** CORS headers for the request's Origin; {} for a same-origin request; null for a foreign site. */
function corsHeadersFor(request: IncomingMessage): Record<string, string> | null {
  const origin = request.headers.origin;
  if (origin === undefined) return {};
  if (!isSameHost(origin, request.headers.host)) return null;
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    Vary: 'Origin',
  };
}

function isSameHost(origin: string, hostHeader: string | undefined): boolean {
  if (hostHeader === undefined) return false;
  try {
    return new URL(origin).hostname === new URL(`http://${hostHeader}`).hostname;
  } catch {
    return false;
  }
}

function toForm(params: Record<string, unknown>, allowedParams: readonly string[]): URLSearchParams {
  const form = new URLSearchParams();
  for (const name of allowedParams) {
    const value = params[name];
    if (typeof value === 'string' && value !== '') form.set(name, value);
  }
  return form;
}

function readJsonBody(request: IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    request.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(new Error('Request body too large'));
        request.destroy();
      } else {
        chunks.push(chunk);
      }
    });
    request.on('end', () => {
      try {
        const value: unknown = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
        if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new Error('not a JSON object');
        resolve(value as Record<string, unknown>);
      } catch (error) {
        reject(error);
      }
    });
    request.on('error', reject);
  });
}

function sendJson(response: ServerResponse, result: ForwardResult, headers: Record<string, string>): void {
  response.writeHead(result.status, {
    ...headers,
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  response.end(JSON.stringify(result.body));
}

function sendEmpty(response: ServerResponse, headers: Record<string, string>): void {
  response.writeHead(HTTP_NO_CONTENT, headers);
  response.end();
}
