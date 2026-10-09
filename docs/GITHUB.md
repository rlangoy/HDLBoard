# GitHub: save, open and sync projects

HDLBoard can keep projects on the student's own GitHub account, so a project made in the lab opens again at home. Each project is stored as a **secret gist**, and a list of the projects is kept in one more gist. Students need a free GitHub account; nothing else is set up on their side.

The data formats follow § 5 of the RemoteGitRepoApp test app's `docs/hdlboard-repo-demo-spec.md`, and the project file is the one described in [`PROJECTS.md`](PROJECTS.md). The code is ported from the RemoteGitRepoApp test app and reviewed against [Clean Code](https://gist.github.com/wojteklu/73c6914cc446146b8b533c0988cf8d29).

---

## For students

### Sign in

1. Click **GitHub** at the top right.
2. Click **Sign in with GitHub**. A GitHub page opens, and HDLBoard shows a code such as `AA73-0A23` (already copied).
3. On the GitHub page: sign in to GitHub if it asks, paste the code (Ctrl+V), click **Continue**, then **Authorize**. GitHub asks for the authorization only the first time.
4. HDLBoard shows your name at the top right.

HDLBoard asks GitHub for the **`gist` permission only**: it can list, read, save and delete your gists, and nothing else, so never your repositories.

| | Stays signed in |
|---|---|
| Windows app | Until **Sign out**. The sign-in is stored encrypted for your Windows user (Windows DPAPI). |
| Browser | Until the tab is closed. |

**Other ways:** under *Sign in with a personal access token instead*, the dialog links to GitHub's token page with the `gist` scope already ticked. Create the token, paste it, and click **Sign in**. A token that lacks the `gist` scope is refused at once with a clear message.

**Sign out** forgets the sign-in on this computer. To take HDLBoard's access away completely, use **Manage access on GitHub** (GitHub → Settings → Applications).

### Save a project to GitHub

Open or make a project (**New File → Project**), then on the project page, in the **GitHub** card, click **Save to GitHub**. If you are not signed in yet, the sign-in comes first and the project is saved right after.

- The first save makes a new secret gist holding the project file and **every file of the project**. A file that came from its own URL (a teacher's gist, say) is saved as your copy, and the saved project file lists it as stored in the gist, so your edits to it are kept and the gist opens to exactly what you saved. Only a file that could not be loaded keeps its URL.
- Later saves change only what changed: edited files are updated, new files are added, and files taken out of the project are deleted from the gist. Files on the gist that never belonged to the project (a README added on github.com) are left alone.
- The status chip shows **Saved on GitHub**, **Changes not saved to GitHub**, or **Not on GitHub yet**.
- **Copy share link** copies a `?project=` link that opens the project in HDLBoard for anyone who has it.

### Open a project from GitHub

Click **GitHub** at the top right: the dialog lists your projects, newest first. Click **Open**: the project's files open in the editor (the project page shows only when a file could not be loaded). The icon beside it shows the gist on github.com, and the bin deletes the project from GitHub (after a question; the files open in HDLBoard are kept).

Open Project (the link icon in Files) with a gist address also works. Signed in, it reads the gist through GitHub, so the project is linked for **Save to GitHub**.

### Two computers: get the GitHub version

**Get the GitHub version** (project page) opens the project as it is on GitHub, for example after working on it on another computer. If you have changes that are not saved to GitHub, HDLBoard asks first.

If you click **Save to GitHub** and the project on GitHub was changed after you opened it, HDLBoard stops and asks:

- **Use the GitHub version**: opens the project as it is on GitHub. Your changes here are lost.
- **Keep mine, replace GitHub's**: saves your version. The changes made on GitHub are lost.

Nothing is overwritten before you choose.

### A teacher's project

A project opened from someone else's gist (a teacher's exercise link) shows **Save a copy to my GitHub**: it makes a new gist of your own, and from then on Save to GitHub saves there.

---

## For whoever hosts HDLBoard

github.com sends no CORS headers on its sign-in endpoints, so the page signs in through **HDLBoard's own backend**, which forwards the requests to github.com (`server/src/githubAuth.ts`):

| Route | Forwards to | Notes |
|---|---|---|
| `GET /github-auth/config` | (none) | `{ clientId, webFlow }` |
| `POST /github-auth/device/code` | `https://github.com/login/device/code` | Only `client_id` and `scope` |
| `POST /github-auth/device/token` | `https://github.com/login/oauth/access_token` | Only the device-code grant |
| `POST /github-auth/web/token` | `https://github.com/login/oauth/access_token` | Adds the client secret; 501 without one |

Only the configured client ID is forwarded, unknown parameters are dropped, and nothing is stored or logged. The page reaches the routes where it reaches the simulator, `<page host>:<backend port>`. A page on another port of the same host name may call them, as Vite does in development, while a page on another site is refused. Gist API calls go straight from the browser to `api.github.com`, which allows CORS, and the token is sent nowhere else.

| Setup | What to do |
|---|---|
| Development (`npm run dev` + `server`) | Nothing |
| Windows app | Nothing: the backend serves the page and the routes on one port |
| Docker | Nothing: `docker/nginx.conf` proxies `/github-auth/` to the backend |
| A reverse proxy of your own | Proxy `/github-auth/` to the backend like `/hdlsim` |
| A static host without the backend (GitHub Pages) | Code sign-in is unavailable; the personal access token still works |

### Backend environment

| Variable | Default | Meaning |
|---|---|---|
| `GITHUB_CLIENT_ID` | `Ov23liDFfwtpvKX3SMvz` (HDLBoard's OAuth App) | The OAuth App the routes forward for. A fork sets its own |
| `GITHUB_CLIENT_SECRET` | empty | Turns on the **one-click sign-in** (web flow + PKCE) in browsers. Never sent to the page |

Without a secret, students use the code sign-in (device flow), which needs only the client ID and works everywhere. With a secret, a browser opens one GitHub window where the student clicks **Authorize**. The window closes by itself, and after the first time it shows nothing at all. It returns to `github-callback.html` next to the page, so the OAuth App's **Authorization callback URL** must be the page's address, e.g. `https://hdlboard.example.org/`. An OAuth App has one callback URL, so use one app per published address. The Windows app always uses the code sign-in, because it cannot hold a secret.

### Registering your own OAuth App (forks)

1. <https://github.com/settings/developers> → **OAuth Apps** → **New OAuth App**.
2. Homepage URL and **Authorization callback URL**: the address HDLBoard is served from.
3. Tick **Enable Device Flow** (needed for the code sign-in) and save.
4. Set `GITHUB_CLIENT_ID` on the backend. Generate a client secret and set `GITHUB_CLIENT_SECRET` if you want one-click sign-in.

---

## What is stored where

| What | Where |
|---|---|
| A project | One secret gist, description `HDLBoard project: <name>`: the project file `<name>.hdlboard.json` and the files stored next to it |
| The project list | `Repo.HDLBoard.json` in a secret gist with the description `HDLBoard project index` (spec § 5.1). Entries also carry `updatedAt`, the last save from HDLBoard. Older indexes without it still load |
| Which gist an open project belongs to | With the project in HDLBoard (and in the Windows app's saved workspace): gist id, owner, project file name, the gist's `updated_at` when last opened or saved, and a checksum of the files then |
| The sign-in | Browser: `sessionStorage` of the tab. Windows app: `<userData>/github-token.bin`, encrypted with Electron `safeStorage` (DPAPI), only when encryption is available |

**Secret gists are not private**: anyone with the link can read them. Never put passwords or other secrets in a project.

### Rules

- GitHub cannot store an empty file, and an empty file in an update would delete it, so Save to GitHub refuses a project with an empty file and names it.
- The gist API has no "only if unchanged" write. HDLBoard reads the gist right before saving and compares its `updated_at` with the one it opened, which narrows the window a lot but cannot close it. The project list is likewise read again right before every write.
- A gist with no `.hdlboard.json` file, or with several, is refused with a message. Use Open Project with the file's own address for the second case.

---

## Code layout

Dependencies point inwards: `components/workbench (React) → github → project`.

```text
server/src/githubAuth.ts        the backend's /github-auth routes (forwarder + HTTP handler)
src/github/                     plain TypeScript, no React
  config.ts                     scope, API URL and version, sign-in page and channel names
  githubHttp.ts                 GitHubHttp: authorized JSON requests, errors per status (GitHubApiError)
  githubUser.ts                 GET /user, and the check that the token has the gist scope
  gistClient.ts                 the Gist endpoints: list, get, create, update, delete
  projectIndex.ts               Repo.HDLBoard.json: parse, write, add, remove, sort (pure)
  gistProjectIndex.ts           the index gist: find, create, register, unregister
  gistSavePlan.ts               which gist files to add, update or delete; the files' checksum (pure)
  projectGists.ts               use cases: list, open, publish, save (with the changed-on-GitHub check), remove
  authProxy.ts, deviceFlow.ts,  sign-in: the backend routes, the device flow, the web flow with PKCE
  webFlow.ts, pkce.ts, signInError.ts
  session.ts                    a signed-in session, wired once per sign-in
  tokenStore.ts                 where the token is kept: the tab (sessionStorage) or the Windows app
src/components/workbench/
  gistLink.ts, projectGitHub.ts an open project and its gist: snapshot, status, links (pure)
  useGitHub.ts                  the sign-in state
  useGitHubProjects.ts          the project actions, for the dialog and the project page
  GitHubDialog.tsx, ProjectGitHubCard.tsx, GitHubConflictDialog.tsx, GitHubStatus.tsx, GitHub.css
  gitHubWindow.ts               the GitHub window and the web flow's callback channel
public/github-callback.html     where GitHub returns after "Authorize" (web flow)
winInstaller/electron/          main.js + preload.js: the encrypted token file
```

Tests: `src/github/*.test.ts` run every use case against `testSupport/fakeGitHub.ts`, an in-memory api.github.com, so they need no network. `src/components/workbench/projectGitHub.test.ts` covers the snapshot and status, and `server/src/githubAuth.test.ts` covers the forwarder over real HTTP.

How the Clean Code rules are applied, beyond what the test app did:

- **Small functions, one level of abstraction**: `ProjectGists.save` reads as *check owner, check unchanged, write changes*, and the details live in `readOwnGist`, `writeChanges` and `removableFiles`. The new backend file is under the repository's lint gate (`server/eslint.config.js`: ≤ 40 lines, ≤ 3 parameters, complexity ≤ 8).
- **No flag arguments**: `save` and `saveReplacingChanges` instead of `save(…, overwrite)`. `useGitHubProjects` takes one options object.
- **Exceptions with a meaning**: `GistChangedError` (ask which version to keep), `ProjectGistError` with a `kind`, `GitHubApiError`, `SignInError`. The messages are written for students.
- **Dependency injection**: `fetch`, the clock and the token store are passed in. The Windows app's bridge reaches the GitHub layer only as the small `DesktopTokenBridge` interface.
- **Pure where possible**: plans, checksums, the index and the project snapshot have no I/O and are tested directly.
- **Fixes to the test app's code**: magic numbers named (device flow defaults, HTTP 204), `any` removed from the fake, the Vite-only proxy replaced by a plain `http` handler that any server can mount, and the client ID moved to one place (the backend), which tells the page.

### Differences from the test app

- The local folder is not the source of truth. In HDLBoard the project is what is open in the editor, so sync is **Save to GitHub** (HDLBoard → gist) plus **Get the GitHub version** (gist → HDLBoard), with the changed-on-GitHub check between them, instead of the test app's folder scan and `.hdlboard-gist.json`.
- Projects can be **deleted** (gist and index entry).
- The client ID comes from the backend (`GET /github-auth/config`), not from the page's code.
