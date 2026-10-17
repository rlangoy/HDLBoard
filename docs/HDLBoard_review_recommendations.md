<!-- SPDX-License-Identifier: GPL-2.0-only -->
<!-- Copyright (C) 2026 Rune Langøy -->

# HDLBoard Review — Recommended Changes (revised)

*Revised October 2026. The external review was checked against the code and filtered with
one rule: **keep HDLBoard simple**. A change is accepted only if it clearly improves the
experience for a student without adding a new mode, panel, menu or service.*

## Summary

HDLBoard's strength is that a student can open it, flip a switch and see an LED respond —
with nothing to install. Most of the review's suggestions either already exist or would
turn HDLBoard into a general-purpose IDE. Three changes are accepted:

| # | Change | Why | Size |
|---|---|---|---|
| 1 | Keep work safe in the browser | A reload or closed tab loses unsaved work without warning | Small |
| 2 | One-click save & share (header split button) | Saving and sharing are hidden on the project page | Medium — specified |
| 3 | Go to declaration | Lets students follow a signal to where it is declared | Medium |

Everything else waits until students or teachers actually ask for it.

---

## 1. Keep work safe in the browser

### Problem

The Windows app keeps the workspace between sessions (*Keep my project between sessions*,
`desktop.ts` → `saveWorkspace` / `loadWorkspace`). The browser keeps nothing: a reload, a
closed tab or a crashed browser loses every edit not saved to GitHub or downloaded, and the
user is not warned.

### Change

- **Restore:** store the workspace in `localStorage` in the browser, reusing
  `serializeWorkspace` / `parseWorkspace` from `desktop.ts`, so the page reopens as it was
  left. Same setting as the desktop app (*Keep my project between sessions*), on by default.
- **Warn:** while there are changes not saved to GitHub or disk, set a `beforeunload`
  handler so the browser asks before leaving the page.

### Not included

No draft list, no history, no "recover" dialog — the workspace simply comes back.

---

## 2. One-click save & share

### Problem

**Save to GitHub** is only on the project page; **Copy share link** only appears after the
first save, on the project page or in the Projects page's ⋮ menu.

### Change

A split button in the header: *Save to GitHub* on the left, a menu with *Copy share link*,
*Get the GitHub version* and *Open on github.com* on the right. Signed out it stays
clickable and signs in first.

- Mockup: [`github_split_button_mockup.html`](github_split_button_mockup.html)
- Spec: [`implementation_spec_one_click_share.md`](implementation_spec_one_click_share.md)

### Not included

No "commit", "repository" or branch vocabulary — projects are gists, and git terms would
only confuse students.

---

## 3. Go to declaration

### Problem

In a project with a top level, components and a testbench, students lose track of where a
signal or component is declared.

### Change

**Ctrl+click** (or **F12**) on a signal, port, constant, entity/module or component name
jumps to its declaration, in the same file or another file of the project. It builds on the
existing symbol-occurrence highlighting ([`symbol_occurrence_highlighting.md`](symbol_occurrence_highlighting.md))
and adds no buttons or panels.

### Not included

Rename symbol, Find all references and Peek definition — they need panels or previews, and
student projects are a few files long.

---

## Already in HDLBoard

These review items are covered by what exists today; no work needed.

| Review item | What HDLBoard already has |
|---|---|
| Better error navigation (§7) | Error lines tinted and marked with the message; the first error is opened and scrolled to; console lines link to the place; plain-language advice for GHDL and Icarus errors |
| Fork project (§3) | *Save a copy to my GitHub* for a project opened from someone else's gist |
| Teacher templates / student copies (§8) | A teacher shares a gist link; students *Save a copy to my GitHub* |
| Submission links (§8) | *Copy share link* — the student hands in the link |
| Reduce reliance on tabs (§4) | No tabs; files switch from the Files panel and the pane header |
| Recent projects (§9) | The Projects page, newest first |
| Public example gallery (§3) | The Examples pane, with search and a language filter |
| Version history (§9) | Gists keep their revisions on GitHub |
| README structure (§11) | One-sentence pitch, *Try online* button, screenshot and "Try it in one minute" |
| Symbol highlighting (§6) | Done |

**Small docs task:** add a short *For teachers* section to [`GITHUB.md`](GITHUB.md)
describing the workflow above (share a gist link → students save a copy → students hand in
their share link).

---

## Not accepted

| Review item | Why not |
|---|---|
| Projects instead of files (§1) | Opening one file and pressing Run is a strength. Projects already exist for those who need them; making them mandatory adds a step for everyone. |
| Guided tutorial / interactive onboarding (§2) | Tours get clicked away and go out of date. If first-run users struggle, one dismissible hint line ("Flip SW0 and watch LEDR0. Edit the code, then press Run.") is the most to add. |
| Command palette (§5) | A second, hidden way to reach every action; students don't know to press it. |
| Contextual suggestions (§5) | Unprompted pop-ups distract; errors already come with advice. |
| Quick file switcher Ctrl+P, pinned files, breadcrumbs, collapsible groups (§4) | Power-user features for large projects; student projects have a handful of files. |
| Rename symbol, Find all references, Peek (§6) | See § 3 above. |
| Public / view-only / classroom links (§3) | Need permissions and accounts beyond GitHub; a share link already works for anyone who has it. |
| Read-only exercises, embedded instructions (§8) | Assignments live in the course's learning platform; HDLBoard should not become one. |
| GitHub commit / repository operations (§10) | See § 2 above. |
| SEO pages, blog posts (§12) | Outreach, not user experience; the README already targets "online VHDL/Verilog simulator". |
| Themes, more board visuals, cosmetic UI (Lower priority) | Agreed with the review: not now. |

---

## Priority

1. **Keep work safe in the browser** — smallest change, prevents the worst experience.
2. **One-click save & share** — specified, ready to build.
3. **Go to declaration.**
4. *For teachers* section in `GITHUB.md`.

Revisit the rest only when real users ask for it.
