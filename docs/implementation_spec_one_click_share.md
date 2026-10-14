<!-- SPDX-License-Identifier: GPL-2.0-only -->
<!-- Copyright (C) 2026 Rune Langøy -->

# One-click save & share — implementation spec

How to build the **GitHub split button** shown in
[`github_split_button_mockup.html`](github_split_button_mockup.html) into the workbench.
The mockup is the visual reference; this document is the technical one. Behaviour that
already exists (saving, signing in, conflicts) is reused, not rewritten — see
[`GITHUB.md`](GITHUB.md).

---

## 1. Goal

Today **Save to GitHub** lives only in the GitHub card on the project page
(`ProjectGitHubCard.tsx`), and **Copy share link** only appears once the project has a gist
(card address line, and the ⋮ menu on the Projects page). The header's GitHub button opens
the sign-in dialog or the Projects page — it does not save or share.

The goal: from anywhere in the workbench, saving is **one click** and sharing is **two**.

```
[ ☁↑ Save to GitHub | ⌄ ]  │  (RL) runelangoy   ⚙ Settings   ? Help   i About
  └ primary action    └ menu (only once the project is on GitHub)

Not on GitHub yet:       [ Save to GitHub ]            (no menu)
Changed, has a gist:     [ Save to GitHub | ⌄ ]        menu: Copy share link · Get the GitHub version
Saved, nothing changed:  [ Copy share link | ⌄ ]       menu: Get the GitHub version
```

### Scope of this release

The aim is to make it easy to **share the link to the gist**. Therefore:

- **The user is signed in.** The signed-out look (outline button, "sign in" tooltip) is not part
  of this release; the header's account button still handles signing in. If the user is not
  signed in the split button is simply not shown.
- **Copy share link copies the gist's own URL** (`https://gist.github.com/…`, i.e.
  `link.htmlUrl`) and nothing else. No `?project=` link into HDLBoard, no other integration.
- **No "Open on github.com"** menu item. It may return later; not in this release.
- **The button face follows the project**: *Copy share link* when everything is saved,
  *Save to GitHub* when there is something to save.
- **Get the GitHub version** is offered only when the project has a gist (downloaded from
  GitHub, or saved to it).

### Non-goals

- No change to how projects are stored (gists, index gist, fingerprints).
- No change to the sign-in dialog, the conflict dialog or the Projects page.
- The project page's GitHub card stays: it is the detailed view (gist address, explanation,
  activity line). It may be slimmed later; not part of this work.

---

## 2. Files

| File | Change |
|---|---|
| `src/components/workbench/gitHubShare.ts` | **New.** Pure function: the button's look and menu from the app state (§ 4). |
| `src/components/workbench/gitHubShare.test.ts` | **New.** Unit tests for § 4 (vitest, node environment). |
| `src/components/workbench/GitHubSplitButton.tsx` | **New.** The split button and its menu (§ 5). |
| `src/components/workbench/GitHubSplitButton.css` | **New.** Styles (§ 7). |
| `src/components/workbench/ProjectMenu.tsx` | Extend `MenuAction` with `detail`; optional `header` prop (§ 5.3). |
| `src/components/workbench/ProjectsPage.css` | Styles for the new `ProjectMenu` options (`__menu-detail`, `__menu-head`). |
| `src/components/workbench/Header.tsx` / `Header.css` | A slot for the button left of the account button, plus a divider (§ 6.1). |
| `src/components/workbench/Workbench.tsx` | Wire the button; Ctrl+Shift+S (§ 6.2, § 6.3). |
| `src/components/workbench/projectGitHub.ts` | `isSomeoneElses(link, userLogin)` helper shared by card and button (§ 4.2). |
| `src/components/workbench/ProjectGitHubCard.tsx` | Use the shared helper instead of its own `someoneElses` expression. |
| `docs/GITHUB.md`, `src/components/workbench/README.md`, `docs/changelog.txt` | Docs (§ 10). |
| `tests/e2e/github-split-button.md` | **New.** Manual check (§ 9.2). |

---

## 3. States

The mockup's seven states map onto data the workbench already has:

| State | Comes from |
|---|---|
| No project open | `project === null` |
| Signed out (this release: button hidden) | `gitHub.session === null` |
| Not on GitHub yet | `gitHubSync === 'not-on-github'` (`gitHubSyncState`, `projectGitHub.ts`) |
| Changes not saved | `gitHubSync === 'changed'` |
| Saved | `gitHubSync === 'saved'` |
| Saving / loading | `gitHubProjects.busy !== null` (`useGitHubProjects.ts`) |
| Someone else's project | `project.gist` owned by another login (§ 4.2) |
| Last action failed | `gitHubProjects.message?.tone === 'error'` |

Precedence when several hold: **no project / signed out (hidden) → busy → someone else's → sync
state**. "Last action failed" is an overlay (red dot + tooltip text), not its own state.

---

## 4. `gitHubShare.ts` — the view model

All decisions live in one pure function so they are unit-testable without a DOM (the vitest
config only runs `src/**/*.test.ts` in the node environment).

### 4.1 API

```ts
import type { GitHubSyncState } from './projectGitHub';
import type { ProjectGistLink } from './gistLink';

export interface GitHubShareInput {
  hasProject: boolean;
  signedIn: boolean;
  userLogin: string | null;
  link: ProjectGistLink | undefined;   // project.gist
  syncState: GitHubSyncState;          // gitHubSyncState(project, files)
  busy: string | null;                 // gitHubProjects.busy
  failed: string | null;               // gitHubProjects.message, when tone === 'error'
}

export type ShareVariant = 'primary' | 'quiet';
export type ShareIcon = 'upload' | 'link' | 'spinner';
export type ShareAction = 'save' | 'copyLink';
export type ShareMenuItem = 'copyLink' | 'getGitHubVersion';

export interface GitHubShareView {
  visible: boolean;
  variant: ShareVariant;
  icon: ShareIcon;
  action: ShareAction;                  // what the primary half does when clicked
  label: string;                        // also the aria-label in icon-only mode
  primaryInert: boolean;                // aria-disabled (busy only), stays focusable
  chevronDisabled: boolean;
  chevronHidden: boolean;               // no menu items: no chevron
  unsavedDot: boolean;
  errorDot: boolean;
  tooltip: string;
  chip: GitHubSyncState | 'signed-out' | 'someone-elses';
  menu: { item: ShareMenuItem; detail: string }[];
}

export function gitHubShareView(input: GitHubShareInput): GitHubShareView;
```

### 4.2 Rules

| | Variant | Icon / label | Face does | Chevron | Tooltip |
|---|---|---|---|---|---|
| No project / signed out | — (`visible: false`) | | | | |
| Busy | `quiet` | spinner / *busy text*, e.g. "Saving to GitHub…" | inert | disabled | the busy text |
| Someone else's, changed | `primary` + `unsavedDot` | upload / Save a copy to my GitHub | `save` | enabled | "Make your own copy of this project on GitHub" |
| `not-on-github` | `primary` | upload / Save to GitHub | `save` | hidden (no menu items) | "Save the project as a secret gist on your GitHub (Ctrl+Shift+S)" |
| `changed` | `primary` + `unsavedDot` | upload / Save to GitHub | `save` | enabled | "Save your changes to GitHub (Ctrl+Shift+S)" |
| `saved` | `primary` | link / Copy share link | `copyLink` | enabled | "Copy the link to the gist on GitHub" |

An unchanged project opened from someone else's gist behaves like *saved*: its face copies the
gist link and *Get the GitHub version* is in the menu. "Save a copy to my GitHub" appears once
such a project has been changed.

`failed !== null` → `errorDot: true` and the tooltip becomes the error text (the full text is
already in the console through `report → log`).

**Busy label.** Use `busy` verbatim but cap it to the save-related texts; any other activity
("Reading your projects on GitHub…") shows "Working…" so the header does not flicker with
Projects-page work. Simplest rule: `busy.startsWith('Saving') ? busy : 'Working…'`.

**Someone else's project.** Add to `projectGitHub.ts` and use it in both the button and
`ProjectGitHubCard` (they must agree, and must agree with `ProjectGists.isOwnedByUser`, which
treats an empty `ownerLogin` as the user's own):

```ts
export function isSomeoneElses(link: GistLink | undefined, userLogin: string | null): boolean {
  return link !== undefined && userLogin !== null && link.ownerLogin !== ''
    && link.ownerLogin.toLowerCase() !== userLogin.toLowerCase();
}
```

**Menu.** Items appear only when they make sense; nothing is shown disabled. In this order:

| Item | Shown | Detail line |
|---|---|---|
| Copy share link | `link !== undefined` **and** the face is *Save* (otherwise the face already does it) | "Copies the link to the gist on GitHub" |
| Get the GitHub version | `link !== undefined` (downloaded from GitHub, or saved there) | "Replace the files here with the version on GitHub" |

A project that is not on GitHub has no menu items, so the chevron is hidden and the button is
a plain *Save to GitHub*. There is no *Open on github.com* item in this release.

### 4.3 Unit tests (`gitHubShare.test.ts`)

One `it` per row of § 4.2, plus:

- precedence: signed out hides the button; busy wins over someone else's;
- `failed` sets `errorDot` and replaces the tooltip in every visible state;
- no gist: no menu items, `chevronHidden: true`;
- gist, changed: face `save`, menu = Copy share link, Get the GitHub version;
- gist, saved: face `copyLink`, menu = Get the GitHub version only;
- `isSomeoneElses`: same login in other case → false; empty `ownerLogin` → false;
  signed out → false.

---

## 5. `GitHubSplitButton.tsx`

### 5.1 Props

```ts
export interface GitHubSplitButtonProps {
  view: GitHubShareView;
  link: ProjectGistLink | undefined;
  onSave: () => void;              // gitHubProjects.save
  onGetGitHubVersion: () => void;  // gitHubProjects.getGitHubVersion
}
```

The component owns only UI state: whether the menu is open, and a short "Link copied"
feedback. Copying is done here (it needs nothing from the hook) and copies the plain gist
address, not an HDLBoard link:

```ts
const copyLink = async () => {
  if (!link) return;
  setCopied(await copyText(link.htmlUrl));  // clipboard.ts
};
```

The primary half calls `onSave()` when `view.action === 'save'` and `copyLink()` when it is
`'copyLink'`.

### 5.2 Markup

```tsx
<div className={cx('wb-gh-split', `is-${view.variant}`)} role="group" aria-label="GitHub">
  <button type="button" className="wb-gh-split__main"
          aria-disabled={view.primaryInert || undefined}
          onClick={() => !view.primaryInert && (view.action === 'save' ? onSave() : copyLink())}
          title={undefined /* tooltip is our own, § 5.4 */}
          aria-describedby={tipId}>
    <span className="wb-gh-split__icon">{icon}{dot}</span>
    <span className="wb-gh-split__label">{copied ? 'Link copied' : view.label}</span>
  </button>
  <button type="button" ref={chevronRef} className="wb-gh-split__chevron"
          aria-label="More GitHub actions" aria-haspopup="menu"
          aria-expanded={menuOpen} disabled={view.chevronDisabled}
          onClick={() => setMenuOpen((o) => !o)}
          onKeyDown={(e) => { if (e.key === 'ArrowDown') { e.preventDefault(); setMenuOpen(true); } }}>
    <ChevronDownIcon aria-hidden="true" />
  </button>
  <span role="tooltip" id={tipId} className="wb-gh-split__tip">{view.tooltip}</span>
  {menuOpen && chevronRef.current && (
    <ProjectMenu anchor={chevronRef.current} header={<…chip + gist address…/>}
                 actions={actions} onClose={() => setMenuOpen(false)} />
  )}
  <span className="wb-visually-hidden" aria-live="polite">{copied ? 'Share link copied' : ''}</span>
</div>
```

- **Inert, not `disabled`, for the primary half** while *Busy*: a disabled button
  gets no focus and no hover, so its tooltip would never show. Use `aria-disabled="true"`
  and ignore the click.
- The chevron *is* `disabled` while busy — nothing in the menu can run then.
- "Link copied" replaces the label for 2 s (same `COPIED_FEEDBACK_MS` pattern as
  `ProjectGitHubCard.GistAddress`), announced through the live region.
- Icons: `CloudUploadIcon`, `CloudDownloadIcon`, `LinkIcon`, `CopyIcon` and `ChevronDownIcon`
  exist in `icons.tsx`; nothing new is needed. The spinner reuses `.wb-github__spinner` from
  `GitHub.css`, recoloured for the header.

### 5.3 Menu: extend `ProjectMenu`

`ProjectMenu` already does what the menu needs — positions itself under its anchor, arrow
keys/Home/End, Escape returns focus to the anchor, closes on Tab, outside click and scroll.
Extend it instead of writing a second menu:

```ts
export interface MenuAction {
  label: string;
  icon: ReactNode;
  onSelect: () => void;
  danger?: boolean;
  /** A second, muted line under the label. */
  detail?: string;
}
export interface ProjectMenuProps {
  anchor: HTMLElement;
  actions: readonly MenuAction[];
  onClose: () => void;
  /** Shown above the items, not focusable (the GitHub status chip and gist address). */
  header?: ReactNode;
}
```

- The Projects page's existing menus are unaffected: all new fields are optional.
- The menu header reuses `<GitHubStatus state={…} />` for the chip, so the wording matches the
  project page exactly. For *someone else's*, show a plain muted line ("From ‹owner›'s
  GitHub") instead.

### 5.4 Tooltip

A native `title` is not shown on keyboard focus and appears late; use a small CSS tooltip
(`.wb-gh-split__tip`, shown on `:hover` and `:focus-within`, hidden while the menu is open),
linked with `aria-describedby`. Position: below the button, right-aligned, with a small
arrow — see the mockup.

### 5.5 Narrow windows

Below 900 px (the header's existing breakpoint, where the tagline hides) the label is
visually hidden and only the icon shows; the label stays in the accessible name. The account
button keeps its login text.

---

## 6. Wiring

### 6.1 `Header.tsx`

Keep the header dumb: add a slot rather than GitHub props.

```ts
export interface HeaderProps {
  …
  /** Shown left of the GitHub account button, with a divider: the save/share split button. */
  gitHubActions?: ReactNode;
}
```

```tsx
<div className="wb-header__actions">
  {gitHubActions}
  {gitHubActions && <span className="wb-header__divider" aria-hidden="true" />}
  {onGitHub && <button … account button, unchanged …/>}
  …
```

`.wb-header__divider`: 1 px × 24 px, `rgba(255,255,255,0.25)`, `margin: 0 4px`.

The account button keeps its job (sign in, or open the Projects page). It is **not** merged
into the split button: one control for *this project*, one for *my account*.

### 6.2 `Workbench.tsx`

Next to `const gitHubSync = gitHubSyncState(project, files);` (≈ line 1440):

```ts
const gitHubShare = gitHubShareView({
  hasProject: project !== null,
  signedIn,
  userLogin: gitHub.session?.user.login ?? null,
  link: project?.gist,
  syncState: project ? gitHubSync : 'not-on-github',
  busy: gitHubProjects.busy,
  failed: gitHubProjects.message?.tone === 'error' ? gitHubProjects.message.text : null,
});
```

(`gitHubSyncState` takes a non-null project; guard the call if it is not already guarded.)

In the `<Header>` call (≈ line 1457):

```tsx
gitHubActions={gitHubShare.visible && (
  <GitHubSplitButton
    view={gitHubShare}
    link={project?.gist}
    onSave={gitHubProjects.save}
    onGetGitHubVersion={gitHubProjects.getGitHubVersion}
  />
)}
```

Nothing else changes: `save()` already handles signed out (sign-in dialog, then save),
someone else's gist (new gist of one's own), first save vs. later saves, and conflicts
(`GitHubConflictDialog` is already rendered by `Workbench`). `getGitHubVersion()` already
asks before losing changes.

**Stale error dot.** `gitHubProjects.message` stays set after an error. Clear the error dot
when the user starts the next action: either clear `message` at the start of `run()` in
`useGitHubProjects` (preferred — the card benefits too), or have the button ignore a message
older than the last click.

### 6.3 Keyboard shortcut — Ctrl+Shift+S

The existing Ctrl+S handler (≈ line 615) already returns on `shiftKey`, so there is no clash.
Add a second listener, attached once, reading refs:

```ts
const shareRef = useRef({ view: gitHubShare, save: gitHubProjects.save });
shareRef.current = { view: gitHubShare, save: gitHubProjects.save };
useEffect(() => {
  const onKeyDown = (e: KeyboardEvent) => {
    if (!(e.ctrlKey || e.metaKey) || !e.shiftKey || e.altKey || e.key.toLowerCase() !== 's') return;
    e.preventDefault();
    const { view, save } = shareRef.current;
    if (view.visible && !view.primaryInert) save();
  };
  window.addEventListener('keydown', onKeyDown);
  return () => window.removeEventListener('keydown', onKeyDown);
}, []);
```

Caveat: in Firefox, Ctrl+Shift+S is the built-in screenshot shortcut and may not be
preventable; the shortcut is a convenience, the button is the feature. Mention the shortcut
only in the tooltip, not in the label.

---

## 7. Styling (`GitHubSplitButton.css`)

Values from the mockup; colours only through the workbench tokens (`Workbench.css`).

| Part | Primary | Quiet (busy) |
|---|---|---|
| Background | `#ffffff` | `rgba(255,255,255,0.16)` |
| Text / icon | `var(--wb-accent-dark)` | `#ffffff` |
| Hover (each half) | `var(--wb-accent-soft)` | chevron only: `rgba(255,255,255,0.26)` |
| Active (main) | `#d3e3ff` | — |
| Divider between halves | `1px solid rgba(29,78,216,0.22)` | `1px solid rgba(255,255,255,0.22)` |

- Height 32 px, radius 6 px (outer corners only per half), font 13 px / 600, gap 7 px, main
  padding `0 12px 0 10px`, chevron 30 px wide; icons 16 px, chevron icon 14 px and rotates
  180° while open.
- Focus: `outline: 2px solid #fff; outline-offset: 2px` (matches `.wb-header__action`).
- Unsaved dot: 8 px, the amber of `.wb-github__status.is-changed` (`#b45309` text /
  use `#f59e0b` fill), white 2 px ring, top-right of the icon. Error dot: same geometry,
  `var(--wb-danger)`.
- **Why white, not blue:** the header is already the `--wb-header-bg` blue gradient; a blue
  button would disappear. White with accent text is the one strong element in the bar.
- Menu: the existing `.wb-projects__menu` look; add `.wb-projects__menu-head` (padding
  `6px 8px 8px`, bottom border `var(--wb-border)`), `.wb-projects__menu-detail` (11.5 px,
  `var(--wb-text-muted)`), Menu width for this use: 290 px.
- `prefers-reduced-motion`: no chevron rotation transition, no spinner animation (show a
  static ring).

---

## 8. Accessibility checklist

- Two real `<button>`s inside `role="group" aria-label="GitHub"`.
- Chevron: `aria-label="More GitHub actions"`, `aria-haspopup="menu"`, `aria-expanded`.
- Menu: `role="menu"`, items `role="menuitem"`; Esc closes and returns focus to the chevron (existing
  `ProjectMenu` behaviour); Tab closes.
- ↓ on the chevron opens the menu with the first enabled item focused.
- Primary half inert (`aria-disabled`) rather than `disabled`, so it stays focusable and its
  tooltip readable.
- Tooltip linked by `aria-describedby`; status changes ("Share link copied", errors)
  announced by a polite live region.
- Contrast: accent-dark on white 6.7:1; white on the header gradient ≥ 4.5:1 — keep it so
  for the quiet variant (don't drop the text opacity below 0.9).

---

## 9. Testing

### 9.1 Unit (vitest)

- `gitHubShare.test.ts` — § 4.3.
- `projectGitHub.test.ts` — add `isSomeoneElses` cases.
- `npm test` must stay green; the existing tests for `ProjectMenu` users
  (`ProjectItems.test.ts`) must not change behaviour.

### 9.2 Manual check — `tests/e2e/github-split-button.md`

Same format as the other files in `tests/e2e/`. Run in the browser (`npm run dev` + server)
**and** in the Windows app, with both sign-in modes there (default browser / dialog).

1. Fresh start, no project, or signed out: no split button; account button unchanged.
2. Signed in, new project, never saved: "Save to GitHub", no chevron. Click: the project is saved
   as a secret gist; the face turns into "Copy share link" and a chevron appears.
3. Click "Copy share link": the label shows "Link copied" for 2 s; pasting gives exactly the
   gist address `https://gist.github.com/…` (no `?project=`, nothing else).
4. Chevron while saved: only "Get the GitHub version" (no Open on github.com). It replaces the
   files with the gist's version and asks first if there are unsaved changes.
5. Edit a file: the face turns into "Save to GitHub" with the amber dot; the menu now has
   "Copy share link" and "Get the GitHub version". Ctrl+Shift+S saves; Ctrl+S still downloads
   the shown file. After saving the face is "Copy share link" again.
6. Open a project from someone else's gist: face "Copy share link"; after an edit, "Save a copy
   to my GitHub"; saving makes a new gist; the face returns to "Copy share link".
7. Change the gist on github.com, then save here: the existing conflict dialog appears;
   both answers work from the header button.
8. Disconnect the network and save: red dot, tooltip shows the error; the console has the
   same text; the next successful save clears the dot.
9. Keyboard only: Tab to the button, Enter saves; Tab to the chevron, ↓ opens, ↑/↓/Home/End
    move, Esc closes and focus is back on the chevron.
10. Window under 900 px: icon-only button, tooltip still names the action.
11. Projects page ⋮ menus still look and behave as before.

---

## 10. Documentation

- **`docs/GITHUB.md`**, *Save a project to GitHub*: lead with the header button ("click
  **Save to GitHub** at the top"), keep the project-page card as the second way; add the
  ⌄ menu and Ctrl+Shift+S; replace the *Copy share link* bullet accordingly.
- **`src/components/workbench/README.md`**: entries for `GitHubSplitButton.tsx` and
  `gitHubShare.ts`; note the new `ProjectMenu` options.
- **`docs/changelog.txt`**: "Save to GitHub and Copy share link in the header (split
  button)".
- Link this spec and the mockup from the issue.

---

## 11. Order of work

1. `isSomeoneElses` in `projectGitHub.ts` + tests; switch `ProjectGitHubCard` to it.
2. `gitHubShare.ts` + `gitHubShare.test.ts` (all rules green before any UI).
3. `ProjectMenu` options (`detail`, `header`) + CSS; check the Projects
   page menus are unchanged.
4. `GitHubSplitButton.tsx` / `.css` with the icons it needs.
5. Header slot + divider; wire in `Workbench.tsx`.
6. Clear `message` at the start of `run()` in `useGitHubProjects`.
7. Ctrl+Shift+S.
8. Manual check § 9.2 in browser and Windows app; docs § 10.

---

## 12. Acceptance criteria

- [ ] Split button in the header, left of the GitHub account button, shown only when a
      project is open.
- [ ] Primary half: *Save to GitHub* (or *Save a copy to my GitHub* for a changed project
      from someone else's gist) when there is something to save; *Copy share link* when
      everything is saved; spinner while saving.
- [ ] Copy share link puts the plain gist URL on the clipboard, nothing else.
- [ ] Amber dot when there are unsaved changes; red dot + error tooltip after a failure.
- [ ] Menu: *Copy share link* (only when the face is *Save* and a gist exists) and *Get the
      GitHub version* (only when a gist exists). No chevron for a project not on GitHub.
      No *Open on github.com* in this release.
- [ ] Not signed in: the button is not shown.
- [ ] Workbench colour tokens only; matches the mockup.
- [ ] Keyboard and screen-reader operable as in § 8.
- [ ] `gitHubShare.test.ts` covers every state; `npm test` green.
- [ ] Manual check § 9.2 passed in the browser and the Windows app (both sign-in modes).
- [ ] `GITHUB.md`, the components README and the changelog updated.
