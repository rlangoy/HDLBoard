// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import { GistClient } from './gistClient';
import { GistProjectIndex } from './gistProjectIndex';
import { browserFetch, GitHubHttp, type FetchFn } from './githubHttp';
import { getSignedInUser, type GitHubUser } from './githubUser';
import { ProjectGists } from './projectGists';

/** Everything that needs a signed-in user, wired together once per sign-in. */
export interface GitHubSession {
  user: GitHubUser;
  projects: ProjectGists;
}

/** Checks the token with GitHub (it must allow gists) and opens a session with it. */
export async function openGitHubSession(accessToken: string, fetchFn: FetchFn = browserFetch): Promise<GitHubSession> {
  const http = new GitHubHttp(accessToken, fetchFn);
  const user = await getSignedInUser(http);
  const gists = new GistClient(http);
  return { user, projects: new ProjectGists(gists, new GistProjectIndex(gists), user) };
}
