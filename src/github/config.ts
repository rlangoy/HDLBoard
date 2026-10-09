// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * GitHub constants (docs/GITHUB.md). The OAuth App's client ID is not here: the
 * backend's sign-in routes tell the page which app they forward for
 * (server/src/githubAuth.ts), so a fork changes it in one place.
 */

/** Read, create, change, delete and list the user's gists, and nothing else (no repositories). */
export const GIST_SCOPE = 'gist';
export const GITHUB_API_URL = 'https://api.github.com';
export const GITHUB_API_VERSION = '2022-11-28';

/** The backend's sign-in routes (server/src/githubAuth.ts). */
export const GITHUB_AUTH_PATH = '/github-auth';

/** The page GitHub returns to after "Authorize" in the one-click sign-in (public/github-callback.html). */
export const SIGN_IN_CALLBACK_PAGE = 'github-callback.html';
export const SIGN_IN_CHANNEL = 'hdlboard-github-sign-in';

/** Creates a classic personal access token with only the gist scope, named HDLBoard. */
export const NEW_TOKEN_URL = 'https://github.com/settings/tokens/new?scopes=gist&description=HDLBoard';
/** Where a user takes HDLBoard's access away again. */
export const AUTHORIZED_APPS_URL = 'https://github.com/settings/applications';
