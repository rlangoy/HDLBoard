// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import { GIST_SCOPE } from './config';
import { GitHubApiError, type GitHubHttp } from './githubHttp';

export interface GitHubUser {
  login: string;
  avatarUrl: string;
}

interface UserJson {
  login: string;
  avatar_url: string;
}

/**
 * Reads the signed-in user, which also proves that the token works. A token that
 * names its scopes (OAuth and classic tokens do) must include `gist`, or saving
 * would fail later with a less helpful message. Fine-grained tokens name none.
 */
export async function getSignedInUser(http: GitHubHttp): Promise<GitHubUser> {
  const { body, headers } = await http.getJsonWithHeaders<UserJson>('/user');
  requireGistScope(headers.get('x-oauth-scopes'));
  return { login: body.login, avatarUrl: body.avatar_url };
}

function requireGistScope(scopesHeader: string | null): void {
  if (scopesHeader === null) return;
  const scopes = scopesHeader.split(',').map((scope) => scope.trim());
  if (!scopes.includes(GIST_SCOPE)) {
    throw new GitHubApiError('no-permission', 'This token cannot read or save gists. Create a token with the "gist" scope.');
  }
}
