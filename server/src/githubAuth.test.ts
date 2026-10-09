// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { after, before, describe, test } from 'node:test';
import {
  DEFAULT_GITHUB_CLIENT_ID,
  GitHubAuthForwarder,
  credentialsFromEnv,
  handleGitHubAuthRequest,
  type OAuthAppCredentials,
} from './githubAuth.js';

const CLIENT_ID = 'client-123';
const WITH_SECRET: OAuthAppCredentials = { clientId: CLIENT_ID, clientSecret: 'shh' };
const WITHOUT_SECRET: OAuthAppCredentials = { clientId: CLIENT_ID, clientSecret: '' };

interface SentRequest {
  url: string;
  form: URLSearchParams;
}

/** A github.com that records what was posted to it and answers with `answer`. */
function fakeGitHub(answer: unknown = { access_token: 'tok' }) {
  const sent: SentRequest[] = [];
  const fetchFn = async (url: string, init?: RequestInit) => {
    sent.push({ url, form: new URLSearchParams(String(init?.body ?? '')) });
    return new Response(JSON.stringify(answer), { status: 200 });
  };
  return { sent, fetchFn };
}

describe('GitHubAuthForwarder', () => {
  test('forwards a device code request with only the client ID and scope', async () => {
    const github = fakeGitHub();
    await new GitHubAuthForwarder(WITHOUT_SECRET, github.fetchFn).forward('device/code', {
      client_id: CLIENT_ID,
      scope: 'gist',
      extra: 'dropped',
    });
    assert.equal(github.sent[0].url, 'https://github.com/login/device/code');
    assert.deepEqual([...github.sent[0].form.keys()], ['client_id', 'scope']);
  });

  test('adds the client secret to the web flow code exchange', async () => {
    const github = fakeGitHub();
    await new GitHubAuthForwarder(WITH_SECRET, github.fetchFn).forward('web/token', {
      client_id: CLIENT_ID,
      code: 'c',
      code_verifier: 'v',
      redirect_uri: 'http://localhost/github-callback.html',
    });
    assert.equal(github.sent[0].form.get('client_secret'), 'shh');
  });

  test('never sends the client secret with the device flow', async () => {
    const github = fakeGitHub();
    await new GitHubAuthForwarder(WITH_SECRET, github.fetchFn).forward('device/token', {
      client_id: CLIENT_ID,
      device_code: 'd',
      grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
    });
    assert.equal(github.sent[0].form.get('client_secret'), null);
  });

  test('refuses another OAuth App', async () => {
    const github = fakeGitHub();
    const result = await new GitHubAuthForwarder(WITH_SECRET, github.fetchFn).forward('device/code', { client_id: 'other' });
    assert.equal(result.status, 403);
    assert.equal(github.sent.length, 0);
  });

  test('refuses the web flow without a client secret', async () => {
    const result = await new GitHubAuthForwarder(WITHOUT_SECRET, fakeGitHub().fetchFn).forward('web/token', { client_id: CLIENT_ID });
    assert.deepEqual(result, { status: 501, body: { error: 'web_flow_not_configured' } });
  });

  test('refuses another grant type on the device token route', async () => {
    const result = await new GitHubAuthForwarder(WITHOUT_SECRET, fakeGitHub().fetchFn).forward('device/token', {
      client_id: CLIENT_ID,
      grant_type: 'password',
    });
    assert.equal(result.status, 400);
  });

  test('reports an unreachable github.com as a bad gateway', async () => {
    const offline = async () => {
      throw new TypeError('fetch failed');
    };
    const result = await new GitHubAuthForwarder(WITHOUT_SECRET, offline).forward('device/code', { client_id: CLIENT_ID });
    assert.equal(result.status, 502);
  });

  test('tells the page its client ID and whether one-click sign-in is possible', () => {
    assert.deepEqual(new GitHubAuthForwarder(WITH_SECRET).config, { clientId: CLIENT_ID, webFlow: true });
    assert.deepEqual(new GitHubAuthForwarder(WITHOUT_SECRET).config, { clientId: CLIENT_ID, webFlow: false });
  });
});

describe('credentialsFromEnv', () => {
  test("defaults to HDLBoard's own OAuth App without a secret", () => {
    assert.deepEqual(credentialsFromEnv({}), { clientId: DEFAULT_GITHUB_CLIENT_ID, clientSecret: '' });
  });

  test('reads a fork’s own OAuth App from the environment', () => {
    assert.deepEqual(credentialsFromEnv({ GITHUB_CLIENT_ID: 'mine', GITHUB_CLIENT_SECRET: 's' }), { clientId: 'mine', clientSecret: 's' });
  });
});

describe('the /github-auth routes over HTTP', () => {
  let server: Server;
  let base: string;

  before(async () => {
    const forwarder = new GitHubAuthForwarder(WITHOUT_SECRET, fakeGitHub({ user_code: 'ABCD-1234' }).fetchFn);
    server = createServer((req, res) => void handleGitHubAuthRequest(forwarder, req, res));
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  after(() => new Promise<void>((resolve) => server.close(() => resolve())));

  test('answers the config of a same-origin page', async () => {
    const response = await fetch(`${base}/github-auth/config`);
    assert.deepEqual(await response.json(), { clientId: CLIENT_ID, webFlow: false });
  });

  test('lets a page on another port of the same host call it (Vite in development)', async () => {
    const response = await fetch(`${base}/github-auth/device/code`, {
      method: 'POST',
      headers: { Origin: 'http://127.0.0.1:5173', 'Content-Type': 'application/json' },
      body: JSON.stringify({ client_id: CLIENT_ID, scope: 'gist' }),
    });
    assert.equal(response.headers.get('access-control-allow-origin'), 'http://127.0.0.1:5173');
    assert.deepEqual(await response.json(), { user_code: 'ABCD-1234' });
  });

  test('answers the CORS preflight', async () => {
    const response = await fetch(`${base}/github-auth/device/code`, { method: 'OPTIONS', headers: { Origin: 'http://127.0.0.1:5173' } });
    assert.equal(response.status, 204);
  });

  test('refuses a page on another site', async () => {
    const response = await fetch(`${base}/github-auth/config`, { headers: { Origin: 'https://evil.example' } });
    assert.equal(response.status, 403);
    assert.equal(response.headers.get('access-control-allow-origin'), null);
  });

  test('refuses a body that is not JSON', async () => {
    const response = await fetch(`${base}/github-auth/device/code`, { method: 'POST', body: 'client_id=x' });
    assert.equal(response.status, 400);
  });
});
