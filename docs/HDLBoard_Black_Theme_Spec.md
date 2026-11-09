# HDLBoard — Theme Profiles (Light + Dark)

Version: 2.1 · Date: 8 November 2026 · Status: Implementation specification
Replaces: version 1.1 (JSON schema + binding layer design)
Source reviewed: local `main` at commit `de45520` (package 1.6.2)
Change in 2.1: review comments folded in (see Appendix A). The second theme is now called **Dark** (ID `dark`). Its palette is dark grey, not OLED black, and "dark" leaves room for later themes such as `highContrast`.

---

## 0. How to use this document

This specification is written so that it can be implemented **step by step by a modest AI model or a student**. Follow these rules:

1. Do the phases **in order** (Phase 0 → 4). Do not start a phase before the previous phase's **gate** passes.
2. Each numbered step is **one commit**. The commit message starts with the step ID, e.g. `T1.3: move board colour variables to light.css`.
3. Never change geometry (sizes, padding, radii, positions, transforms, timing), font metrics, line height or the editor's tokenisation. Only colour values move or change.
4. When you are unsure how to name or classify a colour, choose the rule in § 4.4 and write a one-line comment. Do not invent a new mechanism.
5. Code must follow Clean Code (https://gist.github.com/wojteklu/73c6914cc446146b8b533c0988cf8d29): meaningful names, small functions that do one thing, no magic values outside the theme files, no duplication, no side effects hidden in getters, tests for pure logic.
6. Run `npm run typecheck`, `npm test`, `npm run lint` and `node tools/theme-literals.mjs` before every commit from Phase 1 onwards.

---

## 1. Goal and key decisions

**Goal.** First, save today's colours as an editable **theme profile** ("Light") without any visible change. Then add a second profile ("Dark"): a modern, professional near-black appearance. Users choose Light, Dark or System in Settings. Dialogs, menus, the editor, the waveform and every Board I/O component follow the selected theme. Board I/O components are **recoloured only**. Their shapes, sizes and behaviour stay unchanged.

**Decision D1: a theme profile is one CSS file.**
Each theme is a single file that holds only CSS custom-property declarations with colour values:

```
src/theme/themes/light.css   ← today's colours (the default)
src/theme/themes/dark.css   ← the same variables, different values
```

To edit a theme, you edit its file. This replaces the JSON schema, binding table and adapter layer from v1.1. The browser cascade already does the "binding": components read `var(--…)`, and the theme file supplies the values. The result is fewer moving parts, no runtime parser and no schema drift. A unit test (T0.3) guarantees that both files define exactly the same variables.

**Decision D2: theme selection is one attribute.**
`<html data-theme="light">` or `<html data-theme="dark">`. `light.css` uses plain selectors, so Light also applies when the attribute is missing (a safe default). `dark.css` repeats every selector with the prefix `:root[data-theme='dark']`.

**Decision D3: preference storage follows the existing pattern.**
The theme preference is stored in `localStorage` under `hdlboard.theme.v1`, in the same way as `boardLayoutPreference.ts`. It is never part of a project, a project file or a Gist. The same code is used in the browser and in the desktop app. The Windows app and the Linux AppImage share one Electron shell, and their renderer keeps its own `localStorage` between launches (see `storedChoice.ts`). No Electron bridge is needed. As with every existing preference, each browser origin and each desktop install keeps its own choice.

**One deliberate difference from the existing pattern:** `boardLayoutPreference.ts` ignores a failed save silently. For the theme, the user is told: the Settings dialog shows a one-line note, because a theme that resets on the next start would look like a bug.

**Future user themes** (not in this release) can be added as a third CSS file, or as a loader that injects one `<style>` element with the same variable list. No component changes will be needed. This is why T0.3 enforces parity.

---

## 2. Requirements

### 2.1 Must (release)

| ID | Requirement |
| --- | --- |
| T01 | Settings → **Appearance** offers **Light**, **Dark**, **System**. No saved value or an invalid value → System. |
| T02 | Dark covers the shell, editor, Board I/O panels and their menus, console, waveform, dialogs, menus, tooltips, forms, scrollbars and pages (Projects, Board settings). |
| T03 | Changing theme does not change any Board I/O shape, size, position, spacing, border width, radius, segment path, switch travel or hit area. |
| T04 | Changing theme keeps the editor text, cursor, selection, scroll, focus, simulation session, signal values, board configuration and panel layout. It does not remount components or reconnect to the simulator. |
| T05 | Contrast targets in § 9.3 pass in Dark. They are computed with the WCAG 2.2 relative-luminance formula, on the **rendered** colour: translucent layers (selection, diagnostics, occurrence highlight) are composited over their background first. Light keeps today's values; its known shortfalls are logged (Gate 1), not fixed in this delivery. |
| T06 | The preference survives reload and app restart. It is not saved in projects or Gists. |
| T07 | Starting in Dark shows no light flash longer than one frame in the production build (browser and desktop app). |
| T08 | In System mode, an OS light/dark change updates the app immediately. Explicit Light/Dark ignores the OS. |
| T09 | Hover, pressed, selected, focus, disabled, warning, error and success states stay distinguishable. |

### 2.2 Out of scope

New components, a Board I/O redesign, layout changes, new icons, a theme editor UI, theme import/export, simulator changes, a toolbar theme shortcut, syncing between windows, and the `#gallery` demo page styles (only its Board I/O components follow the theme).

**Surfaces the app does not own** (they may follow the OS instead, and are not failures of T02): native file pickers and OS dialogs; the Electron window frame, title bar and native menus; native `<select>` popup lists where the platform draws them (`color-scheme` helps but is not guaranteed); browser DevTools and React DevTools; GitHub's own sign-in pages; printed output; report-style waveform figures (print colours by design).

---

## 3. Facts about the current code (verified)

| Fact | Consequence |
| --- | --- |
| Colour variables already exist in three families: `--wb-*` on `.wb` (`Workbench.css`), `--pb-*` on `.pb-ui` plus variants (`board/tokens.css`, `Leds/Led.css`, `Pushbuttons/PushbuttonCross.css`), `--wv-*` on `.wv-pane` (`Waveform.css`). A few use other selectors: `.wb-editor` (`CodeEditor.css`), `.hdl-close-button` (`CloseButton.css`), `.hdl-column-divider` (`ColumnDivider.css`), `:root` (`index.css`). | These move into `light.css` **under the same selector** (§ 4.2). |
| The same blocks also hold geometry and timing variables, e.g. `--pb-unit`, `--wb-header-h`, `--wb-code-line-h`. | Geometry stays where it is. Only colour declarations move. |
| About 770 colour literals sit directly in 42 CSS files (largest: `Waveform.css` 107, `board/tokens.css` 94, `ProjectsPage.css` 73, `BoardSettingsPage.css` 49, `Workbench.css` 35). | Phase 1 converts them to variables. The scanner (T0.1) is the authoritative to-do list. |
| `--wb-accent` (9 × `color`, 17 × `background`) and `--wb-accent-dark` (29 × `color`, 11 × `background`) are used both as text colour and as fill. The same is true for `--wb-danger` and `--wb-danger-dark`. | In Dark, a light ink and a dark fill cannot share one value. Step T1.2 splits them. |
| Board menus are rendered with `createPortal` into `<body>`, outside `.wb`. They carry `pb-ui pb-accent-*` classes. The `<dialog>` in `GroupedIoPanel.tsx` and the workbench dialogs stay inside `.wb`. | `data-theme` on `<html>` reaches everything. New variables are declared on `:root` (rule R4), so portals see them too. |
| Inline SVG colours: `icons.tsx` has 3 literal strokes. `logo.tsx` holds the brand colours. | Icons are converted. The logo is exempt. |
| The waveform canvas reads colours with `readColors()` (`waveDraw.ts`) at paint time. `WaveCanvas.tsx` repaints after every render. | A theme change must re-render `WaveCanvas` (step T2.6). |
| `figure/figureStyle.ts` holds the report-export palette. The waveform's ⋯ menu (`WaveMenus.tsx`) already has separate actions: **Copy waveform / Download** (screen look) and **Report figure** (print style). | Exempt. Report figures keep their print colours. Screen-look export already uses `readColors()`, so it follows the active theme. No new export UI is needed, because the user already picks the style by choosing the action. |
| The editor text selection is drawn by `.wb-editor__textarea::selection` as `rgba(37, 99, 235, 0.25)` on a **transparent** textarea that lies over the highlighted layer. | The selection colour must stay translucent in every theme. An opaque colour would hide the syntax glyphs underneath. |
| Preferences follow a pattern: `boardLayoutPreference.ts` and `storedChoice.ts` give guarded `localStorage` access with a typed parse and a default. | `themePreference.ts` copies this pattern. |
| Settings sub-sections are small components in `SettingsDialog.tsx` (`BoardLayoutSetting` uses a radio group). | `ThemeSetting` follows the same markup and classes. |
| Vitest runs in the `node` environment and stubs CSS imports unless they are listed in `vitest.config.ts` → `css.include`. The frontend has no `@types/node`, so tests read CSS with `?raw` imports. | Theme tests use `import css from './themes/light.css?raw'`, and `vitest.config.ts` gets the theme files in `css.include`. |
| ESLint applies Clean Code limits only to the paths in `NEW_CODE` (`eslint.config.js`) and to the file list in the `lint` script (`package.json`). | Add the new theme files to both. |
| `color-mix()` is already used (`Board.css`, `CodeEditor.css`). | It is allowed in components. Theme files still hold plain colours only. |

---

## 4. Target structure and rules

### 4.1 New and changed files

| Path | Responsibility |
| --- | --- |
| `src/theme/themes/light.css` | **Light profile.** Every themable colour variable with today's value. |
| `src/theme/themes/dark.css` | **Dark profile.** Same selectors (prefixed) and same variables, with Dark values. |
| `src/theme/themePreference.ts` | Types, storage key, pure parse/resolve, guarded load/save. |
| `src/theme/systemTheme.ts` | Read and observe the OS `prefers-color-scheme`. |
| `src/theme/applyTheme.ts` | Write `data-theme` on `<html>`. Nothing else. |
| `src/theme/themeStore.ts` | The single source of truth for the current state. Exposes `startTheme`, `chooseTheme`, `getThemeState`, `subscribeTheme`. |
| `src/theme/useTheme.ts` | React hooks `useThemeState()` and `useResolvedTheme()`. |
| `src/components/workbench/ThemeSetting.tsx` | The Appearance section of the Settings dialog. |
| `src/theme/themeCss.testSupport.ts` | Tiny parser for theme files, used by the tests only. |
| `src/theme/*.test.ts` | Tests (T0.3, T2.9, § 9.3). |
| `src/ComponentGallery.css` | The `.demo*` rules moved out of `index.css`. |
| `tools/theme-literals.mjs` | Scanner: lists colour literals that are not yet variables. |
| `demo/theme-snapshot.mjs` | Computed-colour snapshot and compare (the "no visual change" gate). |
| `index.html` | Inline bootstrap script (T2.8). |
| `src/main.tsx` | Imports the theme files and calls `startTheme()`. |

### 4.2 Rules for the theme files

- **R1** A theme file contains only declarations of CSS custom properties (`--name: value;`) and `color-scheme`. It contains no other properties, no `var()`, no `calc()`, no `url()`, no units and no `!important`.
- **R2** Allowed values: `#rgb`, `#rgba`, `#rrggbb`, `#rrggbbaa`, `rgb(…)`/`rgba(…)` with numbers, or a channel triple `R, G, B` for variables whose name ends in `-glow` (used as `rgba(var(--pb-led-glow), 0.7)`).
- **R3** An **existing** colour variable moves to `light.css` under **exactly the selector where it is declared today**. Examples: `.wb`, `.pb-ui`, `.pb-ui.pb-accent-leds, .pb-ui.pb-accent-hex`, `.pb-led--green`, `.wv-pane`, `.wb-editor`, `.hdl-close-button`, `.hdl-column-divider`, `:root`.
- **R4** Every **new** variable (created in Phase 1 from a literal) is declared in the `:root` block of `light.css`.
- **R5** Aliases such as `--pb-key-face: var(--pb-part-face);` or `--wv-tb-head: var(--hdl-tb-head);` are not colours. They **stay** in the component CSS.
- **R6** Block order in `light.css`: `:root`, `.wb`, `.wb-editor`, `.hdl-close-button`, `.hdl-column-divider`, `.pb-ui`, the `.pb-ui.pb-accent-*` variants, the `.pb-led--*` variants, the PushbuttonCross selector, `.wv-pane`. `dark.css` uses the same order. Variants must come after their base.
- **R7** `dark.css` has the same blocks in the same order. Every selector part is prefixed with `:root[data-theme='dark']`, and the `:root` block becomes `:root[data-theme='dark']`. A comma-separated selector is prefixed per part:
  ```css
  :root[data-theme='dark'] .pb-ui.pb-accent-leds,
  :root[data-theme='dark'] .pb-ui.pb-accent-hex { … }
  ```
- **R8** Both files define **identical sets** of variables per selector. There is no fallback and no inheritance between theme files. T0.3 enforces this.
- **R9** `light.css` starts with `color-scheme: light;` in `:root`. `dark.css` has `color-scheme: dark;`. Remove `color-scheme` from `index.css`.
- **R10** Group the declarations with short comments (`/* --- switch housing --- */`) and keep the explanatory comments that sat beside the original values, so the profile is easy to edit.

### 4.3 Rules for component CSS after migration

- **C1** A component rule never contains a colour literal. It uses `var(--name)`.
- **C2** Remove literal fallbacks: `var(--wb-text, #0f172a)` → `var(--wb-text)`. The theme file always defines the variable.
- **C3** Inside `color-mix()`, replace the literal with a variable: `color-mix(in srgb, var(--wb-accent) 22%, #ffffff)` → `color-mix(in srgb, var(--wb-accent) 22%, var(--wb-code-bg))`. The computed colour stays identical.
- **C4** A **neutral blurred shadow** (black or slate with alpha, e.g. `0 24px 60px rgba(15,23,42,0.35)`, `rgba(0,0,0,0.2)`, `#0003`) gives depth on both themes and may stay literal. Mark it on the same line with `/* theme-exempt: shadow */`. Use the marker only for blurred shadows. **A shadow that draws an edge** (no blur, e.g. `0 0 0 1px rgba(15,23,42,0.08)`) is an outline, not depth. It would vanish on a dark surface, so its colour becomes a variable with the role `edge` (e.g. `--wb-dialog-edge`). When one `box-shadow` has both parts, split the declaration so the exempt marker only covers the blurred part: `box-shadow: 0 24px 60px rgba(15, 23, 42, 0.35) /* theme-exempt: shadow */, 0 0 0 1px var(--wb-dialog-edge);`. Everything else becomes a variable.
- **C5** `transparent`, `currentColor` and `inherit` are not literals and need no change.
- **C6** Never use `!important` or theme-ID conditions (`[data-theme='dark']`) in component files. Only `dark.css` may contain the prefix.

### 4.4 Naming new variables

Pattern: `--<family>-<component>-<part>-<role>[-<state>]`

| File location | Family |
| --- | --- |
| `src/components/workbench/**` | `wb` |
| `src/components/{board,Leds,Switches,Pushbuttons,SevenSegment}/**` | `pb` |
| `src/components/waveform/**` | `wv` |
| `src/index.css`, cross-cutting parts (`hdl-*` classes) | `hdl` |

- **Roles:** `bg` (background), `fg` (text/icon colour), `border`, `outline`, `edge` (an outline drawn with `box-shadow`), `shadow`, `accent`.
- **States:** `hover`, `active`, `selected`, `disabled`, `focus`, `on`, `off`.
- **Component** is the BEM block without prefix, e.g. `.wb-dialog__lead` → `--wb-dialog-lead-fg`; `.wb-projects__card:hover` background → `--wb-projects-card-bg-hover`.

**Reuse rule:**
1. The literal has the same value **and** the same meaning as an existing variable (e.g. `#0f172a` used as normal text) → use the existing variable (`--wb-text`).
2. Same value but a different meaning (e.g. `#0f172a` used as a dark band background) → create a new variable.
3. Unsure → create a new variable. Merging later is easy; splitting later is not.
4. A role that fits none of the names above may get a new, descriptive role word (e.g. `--pb-hex-window-bg`). Prefer a clear name over forcing a role that does not fit.

**Required names** (use exactly these, so Phase 3 tables match):

| Where | Literal / use | New variable |
| --- | --- | --- |
| `index.css` `body` | background `#ffffff` | `--hdl-page-bg` |
| `index.css` `body` | color `#0f172a` | `--hdl-page-fg` |
| `Workbench.css` `.wb` | background `#ffffff` | `--wb-surface-bg` |
| `Dialog.css` `.wb-dialog__backdrop` | background | `--wb-dialog-backdrop` |
| `Dialog.css` `.wb-dialog` | background | `--wb-dialog-bg` |
| `Dialog.css` `.wb-dialog` | the `0 0 0 1px` edge in `box-shadow` | `--wb-dialog-edge` |
| `Dialog.css` hero / subtitle | white text on the header band | `--wb-on-header-fg`, `--wb-on-header-fg-muted` |
| `Dialog.css` `.wb-dialog__badge` | background `#ffffff` | `--wb-dialog-badge-bg` |
| `Dialog.css` `.wb-dialog__lead` | `#334155` | `--wb-text-body` |
| `CodeEditor.css` `.wb-editor` | background `#ffffff` | `--wb-code-bg` |
| `CodeEditor.css` gutter numbers | `#94a3b8` | `--wb-gutter-fg` |
| `CodeEditor.css` code text | `#1e293b` | `--wb-code-fg` |
| `CodeEditor.css` textarea | `caret-color` | `--wb-code-caret` |
| `CodeEditor.css` `.wb-editor__textarea::selection` | `rgba(37, 99, 235, 0.25)`. **Must stay translucent** (§ 3) | `--wb-code-selection` |
| `CodeEditor.css` `.wb-tok-keyword` … `.wb-tok-system` | 8 syntax colours | `--wb-syn-keyword`, `--wb-syn-type`, `--wb-syn-comment`, `--wb-syn-string`, `--wb-syn-number`, `--wb-syn-punct`, `--wb-syn-directive`, `--wb-syn-system` |
| `icons.tsx` | `#6B7280`, `#0D9488`, `#EF4444` | `--wb-icon-muted`, `--wb-icon-run`, `--wb-icon-stop` |

---

## 5. Phase 0 — Tools (no app change)

### T0.1 Literal scanner `tools/theme-literals.mjs`

This script is the to-do list for Phase 1 and the gate for Phase 4. It prints every remaining colour literal and a per-file count, and exits with status 1 while any remain.

```js
// SPDX-License-Identifier: GPL-2.0-only
// Lists colour literals outside the theme files (docs/HDLBoard_Black_Theme_Spec.md T0.1).
// Usage: node tools/theme-literals.mjs
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

const SOURCE_ROOT = 'src';
const EXEMPT_PATHS = [
  'src/theme/themes/',
  'src/components/waveform/figure/figureStyle.ts', // report export palette
  'src/components/workbench/logo.tsx', // brand colours
  'src/ComponentGallery.css', // demo page, out of scope
  'src/Images/',
];
const EXEMPT_MARK = 'theme-exempt';
const CSS_LITERAL = /#[0-9a-fA-F]{3,8}\b|\b(?:rgba?|hsla?)\((?!\s*var\()|\b(?:white|black)\b/;
const CODE_LITERAL = /['"`](?:#[0-9a-fA-F]{3,8}['"`]|(?:rgba?|hsla?)\()/; // hex or rgb() in TS/TSX strings and JSX attributes

function listFiles(dir) {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name).replaceAll('\\', '/');
    return statSync(full).isDirectory() ? listFiles(full) : [full];
  });
}

function isCandidate(file) {
  const isSource = /\.(css|ts|tsx)$/.test(file) && !/\.d\.ts$/.test(file);
  const isTestData = /\.test\.|\.testSupport\.|\/fixtures\//.test(file);
  return isSource && !isTestData && !EXEMPT_PATHS.some((exempt) => file.startsWith(exempt));
}

/** Replaces CSS comments with spaces, keeping line numbers. */
function blankComments(css) {
  return css.replace(/\/\*[\s\S]*?\*\//g, (comment) => comment.replace(/[^\n]/g, ' '));
}

function findLiterals(file) {
  const original = readFileSync(file, 'utf8').split('\n');
  const isCss = file.endsWith('.css');
  const scanned = isCss ? blankComments(original.join('\n')).split('\n') : original;
  const pattern = isCss ? CSS_LITERAL : CODE_LITERAL;
  return scanned.flatMap((line, index) =>
    pattern.test(line) && !original[index].includes(EXEMPT_MARK) ? [{ file, line: index + 1, text: original[index].trim() }] : [],
  );
}

function countByFile(findings) {
  const counts = new Map();
  findings.forEach(({ file }) => counts.set(file, (counts.get(file) ?? 0) + 1));
  return [...counts].sort((a, b) => b[1] - a[1]);
}

const findings = listFiles(SOURCE_ROOT).filter(isCandidate).flatMap(findLiterals);
findings.forEach(({ file, line, text }) => console.log(`${file}:${line}: ${text}`));
console.log('\nPer file:');
countByFile(findings).forEach(([file, count]) => console.log(`${String(count).padStart(4)}  ${file}`));
console.log(`\n${findings.length} colour literal(s) outside the theme files.`);
process.exitCode = findings.length === 0 ? 0 : 1;
```

### T0.2 Computed-colour snapshot `demo/theme-snapshot.mjs`

This is the objective "nothing changed" check for Phase 1. It records the computed colour properties of every element (and its `::before`/`::after`) in fixed UI states, then compares the records. It uses Playwright, which is already a dependency in `demo/`.

```js
// SPDX-License-Identifier: GPL-2.0-only
// Computed-colour snapshot (docs/HDLBoard_Black_Theme_Spec.md T0.2).
// Usage (dev server running):  node theme-snapshot.mjs save|compare [url]
//   THEME=dark node theme-snapshot.mjs save   → snapshot of the Dark theme for review
import { chromium } from 'playwright';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const [mode, url = 'http://localhost:5173/'] = process.argv.slice(2);
const theme = process.env.THEME ?? 'light';
const outputDir = path.join(path.dirname(fileURLToPath(import.meta.url)), 'output', 'theme-snapshot', theme);
const SETTLE_MS = 600;
const MAX_REPORTED_DIFFERENCES = 40;
const COLOUR_PROPERTIES = [
  'color', 'background-color', 'background-image', 'border-top-color', 'border-right-color',
  'border-bottom-color', 'border-left-color', 'outline-color', 'box-shadow', 'text-shadow',
  'text-decoration-color', 'caret-color', 'accent-color', 'fill', 'stroke', 'color-scheme',
];
const clickButton = (name) => (page) => page.getByRole('button', { name, exact: true }).click();
const STATES = [
  { name: 'workbench', open: async () => {} },
  { name: 'settings', open: clickButton('Settings') },
  { name: 'help', open: clickButton('Help') },
  { name: 'about', open: clickButton('About') },
  // Add states here (board display menu, projects page, board settings, find bar, waveform)
  // as they become reachable; keep each state deterministic.
];

function readColours(properties) {
  const read = (element, pseudo) => {
    const style = getComputedStyle(element, pseudo);
    return properties.map((property) => style.getPropertyValue(property)).join('|');
  };
  return [...document.querySelectorAll('*')].map((element, index) =>
    `${index} ${element.tagName} .${element.getAttribute('class') ?? ''} ${read(element, null)} ${read(element, '::before')} ${read(element, '::after')}`,
  );
}

async function captureState(browser, state) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, reducedMotion: 'reduce' });
  await context.addInitScript((value) => localStorage.setItem('hdlboard.theme.v1', value), theme);
  const page = await context.newPage();
  await page.goto(url);
  await page.locator('.wb').waitFor();
  await state.open(page);
  await page.waitForTimeout(SETTLE_MS);
  const lines = await page.evaluate(readColours, COLOUR_PROPERTIES);
  await context.close();
  return lines;
}

function differences(expected, actual) {
  const length = Math.max(expected.length, actual.length);
  return Array.from({ length }, (_, i) => i).filter((i) => expected[i] !== actual[i])
    .map((i) => `- ${expected[i] ?? '(missing)'}\n+ ${actual[i] ?? '(missing)'}`);
}

async function compareState(name, lines) {
  const expected = JSON.parse(await readFile(path.join(outputDir, `${name}.json`), 'utf8'));
  const found = differences(expected, lines);
  console.log(`${name}: ${found.length === 0 ? 'identical' : `${found.length} difference(s)`}`);
  found.slice(0, MAX_REPORTED_DIFFERENCES).forEach((line) => console.log(line));
  return found.length;
}

await mkdir(outputDir, { recursive: true });
const browser = await chromium.launch();
let total = 0;
for (const state of STATES) {
  const lines = await captureState(browser, state);
  if (mode === 'save') await writeFile(path.join(outputDir, `${state.name}.json`), JSON.stringify(lines, null, 1));
  else total += await compareState(state.name, lines);
}
await browser.close();
process.exitCode = total === 0 ? 0 : 1;
```

> The snapshot does not cover canvas pixels or geometry. Phase 4 checks those by hand (§ 9.2).

### T0.3 Theme file parser and parity test

`src/theme/themeCss.testSupport.ts`:

```ts
// SPDX-License-Identifier: GPL-2.0-only
/** Parses the theme profile files for tests (docs/HDLBoard_Black_Theme_Spec.md T0.3). */

export const DARK_PREFIX = ":root[data-theme='dark']";

/** Selector → (property → value). */
export type ThemeBlocks = ReadonlyMap<string, ReadonlyMap<string, string>>;

const COMMENT = /\/\*[\s\S]*?\*\//g;
const BLOCK = /([^{}]+)\{([^{}]*)\}/g;
const DECLARATION = /([\w-]+)\s*:\s*([^;]+);/g;

export function parseThemeBlocks(css: string, prefix = ''): ThemeBlocks {
  const blocks = new Map<string, ReadonlyMap<string, string>>();
  for (const [, selector, body] of css.replace(COMMENT, '').matchAll(BLOCK)) {
    blocks.set(normaliseSelector(selector, prefix), parseDeclarations(body));
  }
  return blocks;
}

export function findValue(blocks: ThemeBlocks, name: string): string | undefined {
  for (const declarations of blocks.values()) {
    const value = declarations.get(name);
    if (value !== undefined) return value;
  }
  return undefined;
}

function normaliseSelector(selector: string, prefix: string): string {
  return selector.split(',').map((part) => stripPrefix(part.trim(), prefix)).sort().join(', ');
}

function stripPrefix(part: string, prefix: string): string {
  if (prefix === '') return part;
  if (!part.startsWith(prefix)) throw new Error(`Selector "${part}" must start with ${prefix}`);
  return part.slice(prefix.length).trim() || ':root';
}

function parseDeclarations(body: string): ReadonlyMap<string, string> {
  return new Map([...body.matchAll(DECLARATION)].map(([, name, value]) => [name, value.trim()]));
}
```

`src/theme/themeFiles.test.ts`:

```ts
// SPDX-License-Identifier: GPL-2.0-only
import { describe, expect, it } from 'vitest';
import darkCss from './themes/dark.css?raw';
import lightCss from './themes/light.css?raw';
import { DARK_PREFIX, parseThemeBlocks, type ThemeBlocks } from './themeCss.testSupport';

const COLOUR_VALUE = /^(#[0-9a-f]{3,4}|#[0-9a-f]{6}|#[0-9a-f]{8}|rgba?\([\d.,\s/%]+\))$/i;
const CHANNEL_TRIPLE = /^\d{1,3}, \d{1,3}, \d{1,3}$/;

const light = parseThemeBlocks(lightCss);
const dark = parseThemeBlocks(darkCss, DARK_PREFIX);

function namesOf(blocks: ThemeBlocks): Record<string, string[]> {
  return Object.fromEntries([...blocks].map(([selector, declarations]) => [selector, [...declarations.keys()].sort()]));
}

function isAllowedDeclaration(name: string, value: string): boolean {
  if (name === 'color-scheme') return value === 'light' || value === 'dark';
  if (!name.startsWith('--')) return false;
  return name.endsWith('-glow') ? CHANNEL_TRIPLE.test(value) : COLOUR_VALUE.test(value);
}

describe('theme profiles', () => {
  it('define the same variables for the same selectors', () => {
    expect(namesOf(dark)).toEqual(namesOf(light));
  });

  it.each([['light', light], ['dark', dark]])('%s holds colours only', (_, blocks) => {
    const invalid = [...blocks.values()].flatMap((declarations) =>
      [...declarations].filter(([name, value]) => !isAllowedDeclaration(name, value)).map(([name, value]) => `${name}: ${value}`));
    expect(invalid).toEqual([]);
  });
});
```

Also in T0.3:
- `vitest.config.ts`: `css: { include: [/BoardSettingsPage\.css/, /theme\/themes\/.*\.css/] }`.
- `eslint.config.js` `NEW_CODE`: add `'src/theme/**/*.ts'`, `'src/theme/**/*.tsx'`, `'src/components/workbench/ThemeSetting.tsx'`. Add `src/theme src/components/workbench/ThemeSetting.tsx` to the `lint` script in `package.json`.
- Create `light.css` and `dark.css` with only `:root { color-scheme: light; }` / `:root[data-theme='dark'] { color-scheme: dark; }`. Import both in `src/main.tsx` **after** `./index.css`:
  ```ts
  import './index.css';
  import './theme/themes/light.css';
  import './theme/themes/dark.css';
  ```

### Gate 0

- `npm test` passes, including `themeFiles.test.ts`.
- `node tools/theme-literals.mjs` prints the full list (it fails at this point; that is expected).
- With `npm run dev` running: `cd demo && node theme-snapshot.mjs save`. Commit nothing from `demo/output/`. This is the **baseline**: capture it before any colour edit in Phase 1.

---

## 6. Phase 1 — Save today's colours as the Light profile (no visible change)

**Principle:** in Phase 1, `dark.css` stays a mirror. Every variable added to `light.css` is added to `dark.css` **with the same value** in the same step. The parity test then passes, and Dark looks like Light until Phase 3. Phase 1 changes **no rendered colour**.

### Per-step procedure (repeat for every file)

1. Run `node tools/theme-literals.mjs` and pick the files of the current step.
2. For each literal, follow the decision rule below.
3. Add every new or moved variable to `light.css` (rule R3 or R4) **and** mirror it in `dark.css` with the same value.
4. Run `npm test`, `npm run typecheck`, then `node theme-snapshot.mjs compare`. The result must be `identical` for every state.
5. Commit.

**Decision per literal:**

```
Is it the colour of a neutral blurred shadow?       → keep it, add /* theme-exempt: shadow */
Is it a shadow without blur (an edge, 0 0 0 Npx)?   → new variable with role `edge`
Is it a fallback inside var(--x, #…)?              → delete the fallback
Does an existing variable have this value AND meaning? → var(--existing)
Otherwise                                           → new variable (§ 4.4), declared in :root of light.css
```

**Worked example** (`Dialog.css`):

Before:
```css
.wb-dialog__backdrop { background: rgba(15, 23, 42, 0.55); }
.wb-dialog {
  background: #ffffff;
  box-shadow: 0 24px 60px rgba(15, 23, 42, 0.35), 0 0 0 1px rgba(15, 23, 42, 0.08);
}
.wb-dialog__lead { color: #334155; }
```
After:
```css
.wb-dialog__backdrop { background: var(--wb-dialog-backdrop); }
.wb-dialog {
  background: var(--wb-dialog-bg);
  box-shadow:
    0 24px 60px rgba(15, 23, 42, 0.35), /* theme-exempt: shadow */
    0 0 0 1px var(--wb-dialog-edge);
}
.wb-dialog__lead { color: var(--wb-text-body); }
```
`light.css` (`:root` block), mirrored in `dark.css`:
```css
  /* --- dialogs (Dialog.css) --- */
  --wb-dialog-backdrop: rgba(15, 23, 42, 0.55);
  --wb-dialog-bg: #ffffff;
  --wb-dialog-edge: rgba(15, 23, 42, 0.08);
  --wb-text-body: #334155;
```

### Steps

| Step | Work | Files |
| --- | --- | --- |
| **T1.1** | **Move the existing colour variables** (pure move, no renames) under their current selectors into `light.css` + mirror. Geometry and alias lines stay. Move `.demo*` rules from `index.css` into a new `src/ComponentGallery.css` imported by `ComponentGallery.tsx`. Remove `color-scheme` from `index.css`. Convert `body` colours (`--hdl-page-bg`, `--hdl-page-fg`). The scanner does not detect channel triples, so also move `--pb-led-glow` and `--pb-key-hover-glow` (`grep -rn -- "-glow:" src`). | `index.css`, `Workbench.css`, `board/tokens.css`, `Leds/Led.css` (variants), `Pushbuttons/PushbuttonCross.css` (cap colours), `CloseButton.css`, `ColumnDivider.css`, `CodeEditor.css` (`.wb-editor` block), `Waveform.css` (`.wv-pane` block) |
| **T1.2** | **Split dual-use variables.** For each `color:` (text/icon) use, switch to an `-ink` twin with the **same Light value**: `--wb-accent-ink`, `--wb-accent-dark-ink`, `--wb-danger-ink`, `--wb-danger-dark-ink`, `--wb-header-bg-dark-ink`. Background, border, outline and shadow uses keep the original name. Declare the twins in the `.wb` block. | all files that use them (`grep -rn "color: var(--wb-accent" src`, etc.) |
| **T1.3** | Board I/O component literals | `Leds/Led.css`, `Pushbuttons/Pushbutton.css`, `Pushbuttons/PushbuttonCross.css`, `Switches/ToggleSwitch.css`, `SevenSegment/SevenSegmentDisplay.css`, `board/panel.css`, `board/Board.css`, `workbench/GroupedIoPanel.css`, `workbench/BoardSetting.css` |
| **T1.4** | Editor and console | `CodeEditor.css` (required names § 4.4), `SplitEditor.css`, `find/FindBar.css`, `ConsoleOutput.css`, `OverlayScrollbar.css` |
| **T1.5** | Dialogs and menus | `Dialog.css`, `SettingsDialog.css`, `HelpDialog.css`, `AboutDialog.css`, `NewFileDialog.css`, `PasteArchitectureDialog.css`, `BoardChangeDialog.css`, `FileMenu.css`, `PickerWait.css`, `GitHub.css`, `GitHubSplitButton.css`, `UpdateBell.css` |
| **T1.6** | Shell and pages | `Header.css`, `ActivityBar.css`, `SidePanel.css`, `PaneHeaderButton.css`, `SimToggle.css`, `SimulationCard.css`, `FileExplorer.css`, `FileRowLabel.css`, `ExamplesPane.css`, `ProjectPage.css`, `ProjectsPage.css`, `BoardSettingsPage.css` |
| **T1.7** | Waveform and icons. In `icons.tsx`, replace `stroke="#6B7280"` with `style={{ stroke: 'var(--wb-icon-muted)' }}` (SVG presentation attributes do not resolve `var()`). Do the same for `--wb-icon-run` and `--wb-icon-stop`. | `Waveform.css` (rest), `FlatSelect.css`, `icons.tsx` |

If the scanner lists a file that is not in the table, add it to the step whose area it belongs to.

### Gate 1

- `node tools/theme-literals.mjs` reports **0** literals.
- `theme-snapshot.mjs compare` reports `identical` for all states.
- `npm test`, `npm run typecheck` and `npm run lint` pass.
- A quick manual look at the board, a dialog, the waveform and the console shows no change.
- **Baseline contrast issues** found along the way (known: Light gutter numbers `#94a3b8` on `#f8fafc` ≈ 2.5:1, comments `#16a34a` on white ≈ 3.3:1, comments inside a selection ≈ 2.3:1) are written to `docs/theme_light_baseline_issues.md`. **Do not fix them in Phase 1.** Any Light fix is a separate, later commit with before/after evidence.

From now on, `light.css` **is** the saved profile of today's appearance.

---

## 7. Phase 2 — Theme switching

### T2.1 `src/theme/themePreference.ts` (pure logic + guarded storage)

```ts
// SPDX-License-Identifier: GPL-2.0-only
/** The user's theme choice (docs/HDLBoard_Black_Theme_Spec.md § 7). Stored in this browser only. */

export type ThemePreference = 'light' | 'dark' | 'system';
export type ResolvedTheme = 'light' | 'dark';

export const THEME_PREFERENCES: readonly ThemePreference[] = ['light', 'dark', 'system'];
export const DEFAULT_THEME_PREFERENCE: ThemePreference = 'system';
/** Also read by the bootstrap script in index.html. */
export const THEME_STORAGE_KEY = 'hdlboard.theme.v1';

export function parseThemePreference(value: string | null): ThemePreference {
  return THEME_PREFERENCES.find((preference) => preference === value) ?? DEFAULT_THEME_PREFERENCE;
}

export function resolveTheme(preference: ThemePreference, systemIsDark: boolean): ResolvedTheme {
  if (preference === 'system') return systemIsDark ? 'dark' : 'light';
  return preference;
}

/** Never throws. */
export function loadThemePreference(): ThemePreference {
  try {
    return parseThemePreference(window.localStorage.getItem(THEME_STORAGE_KEY));
  } catch {
    return DEFAULT_THEME_PREFERENCE;
  }
}

/** Never throws. False when storage is blocked: the choice then holds for this session only. */
export function saveThemePreference(preference: ThemePreference): boolean {
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, preference);
    return true;
  } catch {
    return false;
  }
}
```

### T2.2 `src/theme/systemTheme.ts`

```ts
// SPDX-License-Identifier: GPL-2.0-only
const DARK_SCHEME_QUERY = '(prefers-color-scheme: dark)';

function darkSchemeQuery(): MediaQueryList | null {
  return typeof window.matchMedia === 'function' ? window.matchMedia(DARK_SCHEME_QUERY) : null;
}

/** False when the OS preference cannot be read. */
export function systemPrefersDark(): boolean {
  return darkSchemeQuery()?.matches ?? false;
}

/** Calls `onChange` when the OS switches between light and dark. Returns the unsubscribe function. */
export function subscribeSystemTheme(onChange: () => void): () => void {
  const query = darkSchemeQuery();
  if (query === null) return () => undefined;
  query.addEventListener('change', onChange);
  return () => query.removeEventListener('change', onChange);
}
```

### T2.3 `src/theme/applyTheme.ts`

```ts
// SPDX-License-Identifier: GPL-2.0-only
import type { ResolvedTheme } from './themePreference';

/** Selects the theme profile (themes/*.css) for the whole document, portals included. */
export function applyTheme(theme: ResolvedTheme): void {
  document.documentElement.dataset.theme = theme;
}
```

### T2.4 `src/theme/themeStore.ts` (single source of truth)

```ts
// SPDX-License-Identifier: GPL-2.0-only
import { applyTheme } from './applyTheme';
import { subscribeSystemTheme, systemPrefersDark } from './systemTheme';
import {
  DEFAULT_THEME_PREFERENCE, loadThemePreference, resolveTheme, saveThemePreference,
  type ResolvedTheme, type ThemePreference,
} from './themePreference';

export interface ThemeState {
  readonly preference: ThemePreference;
  readonly resolved: ResolvedTheme;
  /** The last choice could not be stored; it holds for this session only. */
  readonly saveFailed: boolean;
}

type Listener = () => void;

const listeners = new Set<Listener>();
let state: ThemeState = { preference: DEFAULT_THEME_PREFERENCE, resolved: 'light', saveFailed: false };

function stateFor(preference: ThemePreference, saveFailed: boolean): ThemeState {
  return { preference, resolved: resolveTheme(preference, systemPrefersDark()), saveFailed };
}

function publish(next: ThemeState): void {
  state = next;
  applyTheme(next.resolved);
  listeners.forEach((listener) => listener());
}

function onSystemThemeChange(): void {
  if (state.preference === 'system') publish(stateFor('system', state.saveFailed));
}

/** Call once, before the first render. Returns the function that stops observing the OS. */
export function startTheme(): () => void {
  publish(stateFor(loadThemePreference(), false));
  return subscribeSystemTheme(onSystemThemeChange);
}

export function chooseTheme(preference: ThemePreference): void {
  const saved = saveThemePreference(preference);
  publish(stateFor(preference, !saved));
}

export function getThemeState(): ThemeState {
  return state;
}

export function subscribeTheme(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
```

### T2.5 `src/theme/useTheme.ts`

```ts
// SPDX-License-Identifier: GPL-2.0-only
import { useSyncExternalStore } from 'react';
import { getThemeState, subscribeTheme, type ThemeState } from './themeStore';
import type { ResolvedTheme } from './themePreference';

export function useThemeState(): ThemeState {
  return useSyncExternalStore(subscribeTheme, getThemeState);
}

export function useResolvedTheme(): ResolvedTheme {
  return useThemeState().resolved;
}
```

### T2.6 Wiring

**`src/main.tsx`:** call `startTheme()` before `createRoot(...)`. It observes the OS for the app's lifetime, so the returned unsubscribe function is not used:

```ts
import { startTheme } from './theme/themeStore';
// …
startTheme(); // runs for the app's lifetime (docs/HDLBoard_Black_Theme_Spec.md § 7)
createRoot(…)
```

**`src/components/waveform/WaveCanvas.tsx`:** the canvas reads its colours from CSS at paint time and repaints after every render. Make it re-render on theme change. Add this line at the top of the component, before `usePaint(…)`:

```ts
useResolvedTheme(); // a theme change re-renders, and so repaints, the canvas in the new colours
```

Every waveform view, whether live during simulation or static after a run, draws through its own `WaveCanvas`, so this one line covers all open views. The repaint reuses the current scene: data, cursor, zoom and selection are not touched.

No other component reads the theme. **Components must never branch on the theme ID** (rule C6). Not `theme === 'dark'`, not `[data-theme='dark']` in component CSS, not a second set of component classes. All colour differences live in the theme files. That is what keeps a third theme free of component changes.

### T2.7 Settings UI — `src/components/workbench/ThemeSetting.tsx`

```tsx
// SPDX-License-Identifier: GPL-2.0-only
import { useId } from 'react';
import type { ThemePreference } from '../../theme/themePreference';
import { chooseTheme } from '../../theme/themeStore';
import { useThemeState } from '../../theme/useTheme';

interface ThemeChoice {
  readonly value: ThemePreference;
  readonly label: string;
  readonly note: string;
}

const THEME_CHOICES: readonly ThemeChoice[] = [
  { value: 'light', label: 'Light', note: 'The standard light appearance.' },
  { value: 'dark', label: 'Dark', note: 'Near-black surfaces for dark rooms.' },
  { value: 'system', label: 'System', note: "Follow the operating system's light or dark setting." },
];

export const THEME_SAVE_FAILED_TEXT = 'Theme changed for this session. Your preference could not be saved.';

/** Settings → Appearance. Applies at once; stored in this browser, never in a project. */
export function ThemeSetting() {
  const { preference, saveFailed } = useThemeState();
  const groupName = useId();
  return (
    <fieldset className="wb-settings__group">
      <legend className="wb-settings__heading">Appearance</legend>
      {THEME_CHOICES.map((choice) => (
        <label key={choice.value} className="wb-settings__option">
          <input type="radio" name={groupName} value={choice.value} checked={preference === choice.value} onChange={() => chooseTheme(choice.value)} />
          <span>
            <strong>{choice.label}</strong>
            <span className="wb-settings__note">{choice.note}</span>
          </span>
        </label>
      ))}
      {saveFailed && <p className="wb-settings__note" role="status">{THEME_SAVE_FAILED_TEXT}</p>}
    </fieldset>
  );
}
```

In `SettingsDialog.tsx`, render `<ThemeSetting />` as the **first** group (before `<BoardSetting …/>`). No new props are needed, and `Workbench.tsx` does not change.

### T2.8 Startup without flash — `index.html`

Add this inside `<head>`, before any stylesheet or script:

```html
<script>
  /* Theme bootstrap (docs/HDLBoard_Black_Theme_Spec.md § 7): picks the profile before the
     first frame. Mirrors resolveTheme() in src/theme/themePreference.ts; keep them in step. */
  (function () {
    var theme = 'light';
    try {
      var preference = null;
      try { preference = localStorage.getItem('hdlboard.theme.v1'); } catch (e) { /* storage blocked: System */ }
      var systemIsDark = !!window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
      if (preference === 'dark' || (preference !== 'light' && systemIsDark)) theme = 'dark';
    } catch (e) { /* OS preference unreadable: Light */ }
    document.documentElement.dataset.theme = theme;
  })();
</script>
```

This small duplication is deliberate: it must run before the bundle loads. A test (T2.9) guards it.

### T2.9 Tests

`src/theme/themePreference.test.ts`. Follow the style of `boardLayoutPreference.test.ts` (`vi.stubGlobal('window', …)`):

| Case | Expected |
| --- | --- |
| `parseThemePreference(null)`, `('')`, `('black')`, `('DARK')` | `'light'` |
| `parseThemePreference('dark')`, `('system')` | the same value |
| `resolveTheme('system', true)` / `(…, false)` | `'dark'` / `'light'` |
| `resolveTheme('light', true)`, `resolveTheme('dark', false)` | `'light'`, `'dark'` |
| `loadThemePreference()` when `getItem` throws | `'light'` |
| `saveThemePreference()` when `setItem` throws | `false` |
| `systemPrefersDark()` when `window.matchMedia` is missing (`systemTheme.test.ts`) | `false`, so System resolves to Light |
| `subscribeSystemTheme()` when `window.matchMedia` is missing | returns a no-op unsubscribe, does not throw |
| save then load | the round trip returns the saved value |

`src/theme/themeBootstrap.test.ts`:

```ts
import { expect, it } from 'vitest';
import indexHtml from '../../index.html?raw';
import { THEME_STORAGE_KEY } from './themePreference';

it('the index.html bootstrap reads the same storage key as the app', () => {
  expect(indexHtml).toContain(`localStorage.getItem('${THEME_STORAGE_KEY}')`);
});
```

### Gate 2

- Settings → Appearance switches Light ↔ Dark instantly. Dark still **looks like Light** (mirror values); check in DevTools that `<html data-theme="dark">` is set.
- Reload keeps the choice. In System mode, changing the OS setting (or DevTools → Rendering → `prefers-color-scheme`) switches the theme.
- Typing in the editor, then switching theme: text, cursor and focus stay. Simulation keeps running.
- All tests, typecheck and lint pass. `theme-snapshot.mjs compare` (Light) is still `identical`.

---

## 8. Phase 3 — Edit the Dark profile

Edit **only** `src/theme/themes/dark.css`. No component file changes in this phase. If a colour cannot be made right without a component change, stop. The missing role must then be added to **both** files as a new variable (Phase 1 procedure).

### 8.1 Base palette (design reference)

| Role | Value | Typical use |
| --- | --- | --- |
| canvas | `#121416` | editor, waveform, page |
| panel | `#1C1F23` | sidebar, Board I/O cards, gutter |
| raised | `#262A30` | dialogs, menus, popovers, inputs on panels |
| header | `#23272D` | top header band (neutral, modern) |
| hover | `#2A2F36` (on panel) / `#303640` (on raised) | neutral hover |
| pressed | `#39424E` | neutral pressed |
| border subtle | `#3B414A` | separators, panel edges |
| border control | `#778391` | input and button outlines |
| text | `#ECEFF4` | main text |
| text muted | `#ABB4C0` | secondary text, timestamps |
| text disabled | `#858E9A` | disabled only |
| accent fill | `#2F6FED` (white text 4.55:1) / darker `#245A96` | primary buttons, selected rows |
| accent ink | `#83B9FF` | links, active indicators, focus |
| accent tint | `#1F3550` | selected/soft backgrounds |
| success / warning / error ink | `#8CDEA3` / `#FFD27A` / `#FF9A9A` | status text |

### 8.2 Values for the existing variables

**`:root[data-theme='dark']`**

| Variable | Dark |
| --- | --- |
| `--hdl-tb-head` | `#1f2f47` |
| `--hdl-rtl-head` | `#1c3326` |
| `--hdl-page-bg` | `#121416` |
| `--hdl-page-fg` | `#eceff4` |

**`… .wb`**

| Variable | Dark | Variable | Dark |
| --- | --- | --- | --- |
| `--wb-rail-bg` | `#181a1e` | `--wb-border` | `#3b414a` |
| `--wb-sidebar-bg` | `#1c1f23` | `--wb-hover` | `#2a2f36` |
| `--wb-text` | `#eceff4` | `--wb-text-muted` | `#abb4c0` |
| `--wb-accent` | `#2f6fed` | `--wb-accent-ink` | `#83b9ff` |
| `--wb-accent-dark` | `#245a96` | `--wb-accent-dark-ink` | `#a9c7ff` |
| `--wb-accent-soft` | `#1f3550` | `--wb-header-bg` | `#23272d` |
| `--wb-header-bg-dark` | `#1c1f23` | `--wb-header-bg-dark-ink` | `#23272d` |
| `--wb-success` | `#22c55e` | `--wb-success-dark` | `#8cdea3` |
| `--wb-danger` | `#ef4444` | `--wb-danger-ink` | `#ff9a9a` |
| `--wb-danger-dark` | `#dc2626` | `--wb-danger-dark-ink` | `#ff9a9a` |
| `--wb-role-tb-ink` | `#c4a5ff` | `--wb-role-tb-tint` | `#2e2440` |
| `--wb-role-rtl-ink` | `#5eead4` | `--wb-role-rtl-tint` | `#173330` |
| `--wb-role-quiet-ink` | `#8e97a3` | `--wb-console-bg` | `#0e1012` |
| `--wb-diag-error` | `#ff8080` | `--wb-diag-error-bg` | `#ff5a5a29` |
| `--wb-diag-error-text` | `#ff9a9a` | `--wb-diag-warning` | `#ffc35c` |
| `--wb-diag-warning-bg` | `#ffb02029` | `--wb-diag-warning-text` | `#ffd27a` |
| `--wb-diag-followon` | `#8e97a3` | `--wb-diag-followon-bg` | `#94a3b824` |
| `--wb-diag-hint` | `#83b9ff` | `--wb-diag-hint-bg` | `#3b82f629` |
| `--wb-divider-bg` | `#262a30` | `--wb-divider-edge` | `#3b414a` |

**`… .wb-editor`, `… .hdl-close-button`, `… .hdl-column-divider`**

| Variable | Dark |
| --- | --- |
| `--wb-occ-bg` | `#64a0ff47` |
| `--wb-occ-underline` | `#83b9ff` |
| `--wb-find-current-bg` | `#594820` |
| `--wb-find-current-outline` | `#ffd27a` |
| `--hdl-close-bg` / `-bg-hover` / `-border` / `-ink` | `#303640` / `#39424e` / `#4a525d` / `#eceff4` |
| `--hdl-divider-accent` | `#83b9ff` |

**Required new editor names (§ 4.4)**

| Variable | Dark | Variable | Dark |
| --- | --- | --- | --- |
| `--wb-code-bg` | `#121416` | `--wb-code-fg` | `#eceff4` |
| `--wb-code-caret` | `#ffffff` | `--wb-gutter-fg` | `#8e97a3` |
| `--wb-syn-keyword` | `#83b9ff` | `--wb-syn-type` | `#8ed9bd` |
| `--wb-syn-comment` | `#a5b59b` | `--wb-syn-string` | `#f1cb8a` |
| `--wb-syn-number` | `#d5b0ff` | `--wb-syn-punct` | `#b9c2ce` |
| `--wb-syn-directive` | `#f4a3c8` | `--wb-syn-system` | `#7dd3fc` |
| `--wb-surface-bg` | `#121416` | `--wb-dialog-bg` | `#262a30` |
| `--wb-dialog-backdrop` | `#000000a6` | `--wb-dialog-badge-bg` | `#eceff4` |
| `--wb-text-body` | `#c9d0d9` | `--wb-on-header-fg` | `#ffffff` |
| `--wb-on-header-fg-muted` | `#ffffffcc` | `--wb-icon-muted` | `#9aa3ad` |
| `--wb-icon-run` | `#2dd4bf` | `--wb-icon-stop` | `#ff7b7b` |
| `--wb-code-selection` | `#4c8dff4d` (translucent, never opaque) | `--wb-dialog-edge` | `#3b414a` |

Composited over `--wb-code-bg`, the selection renders as about `#24395c`. Every syntax colour inside a selection then stays ≥ 5.3:1, and plain code text stays at 10:1. The contrast test (§ 9.3) checks this composited value.

**Board I/O — `… .pb-ui`** (recolour only; geometry is untouched by construction)

| Group | Variable → Dark |
| --- | --- |
| Switch housing | `--pb-sw-body-edge` `#8a94a1` · `-body-top` `#5a616b` · `-body-upper` `#4f5660` · `-body-mid` `#474d57` · `-body-low` `#3f454e` |
| Switch track | `--pb-sw-track-hi` `#1f2328` · `--pb-sw-track-lo` `#262a30` |
| Switch knob (light, so position stays obvious) | `--pb-sw-knob-top` `#e4e7ec` · `-knob-mid` `#d3d8de` · `-knob-lo` `#b9bfc7` · `-knob-bottom` `#a9b0b9` |
| LED package | `--pb-led-ring` `#9099a4` · `--pb-led-rim` `#59616b` · `--pb-led-rim-on` `#7a3a33` |
| LED unlit (visible but clearly weaker) | `--pb-led-off` `#4b525a` · `-off-hi` `#5d656e` · `-off-lo` `#3d434a` |
| LED lit (red, **unchanged**) | `--pb-led-core` `#fff1ee` · `-mid` `#ff6b52` · `-body` `#f6210f` · `-edge` `#a80b06` · `-glow` `255, 48, 28` |
| KEY/HEX package | `--pb-part-face` `#2b3138` · `-face-hi` `#353c44` · `-edge` `#7d8896` · `-edge-dark` `#5f6a77` |
| KEY pressed | `--pb-key-face-down` `#1f2328` · `-face-down-hi` `#2b3138` · `-edge-down` `#4a535e` |
| KEY cap | `--pb-key-cap-hi` `#6b7581` · `-cap-body` `#5a6470` · `-cap-lo` `#4a535e` · `-cap-rim` `#9aa3ad` |
| KEY hover | `--pb-key-hover-face` `#1f3550` · `-hover-edge` `#83b9ff` · `-hover-glow` `131, 185, 255` |
| 7-segment | `--pb-hex-seg-off` `#505862` · `--pb-hex-seg-on` `#ff453a` |
| Card and readout | `--pb-card-bg` `#1c1f23` · `--pb-label` `#a9c7ff` · `--pb-readout-bg` `#262a30` · `-readout-border` `#3b414a` · `-readout-fg` `#c7dcff` |
| Focus and surfaces | `--pb-focus` `#83b9ff` · `--pb-surface` `#262a30` |
| Menus | `--pb-menu-text` `#eceff4` · `-icon` `#abb4c0` · `-muted` `#abb4c0` · `-badge-bg` `#303640` · `-badge-border` `#3b414a` · `-badge-text` `#eceff4` · `-border` `#3b414a` · `-rule` `#30363e` · `-control-border` `#778391` · `-shadow` `#0000008c` |
| Dialog and controls | `--pb-control-shadow` `#00000066` · `--pb-dialog-shadow` `#00000080` · `--pb-dialog-backdrop` `#000000a6` · `--pb-dialog-button-border` `#778391` · `-button-bg` `#303640` · `-button-text` `#eceff4` · `--pb-chevron` `#abb4c0` |
| Menu selection (default = inputs, blue) | `--pb-menu-selected-fg` `#ffffff` · `--pb-menu-selected` `#245a96` · `--pb-menu-focus` `#83b9ff` · `-trigger-border` `#4a6a94` · `-trigger-fg` `#a9c7ff` · `-trigger-hover` `#1f3550` · `-row-selected` `#1f3550` · `-row-hover` `#262f3b` · `-row-selected-hover` `#24405f` · `--pb-collapsed-bg` `#1f2a38` · `--pb-collapsed-hover` `#263547` |
| Default accent | `--pb-accent-head` `#1d2a3a` · `-border` `#2c3f57` · `-title` `#a9c7ff` |

**`… .pb-ui.pb-accent-switches`**: same as the default accent.
**`… .pb-ui.pb-accent-keys`**: `--pb-accent-head` `#1d2a3a` · `-border` `#2f4a6b` · `-title` `#a9c7ff`.
**`… .pb-ui.pb-accent-leds, … .pb-ui.pb-accent-hex`** (outputs stay green): `--pb-accent-head` `#1a2e2a` · `-border` `#2a4a42` · `-title` `#9fe0b4` · `--pb-menu-selected` `#1f6b5c` · `--pb-menu-focus` `#6fd3b8` · `-trigger-border` `#3f6f63` · `-trigger-fg` `#9fe0c8` · `-trigger-hover` `#1b3a33` · `-row-selected` `#1b3a33` · `-row-hover` `#1f2f2b` · `-row-selected-hover` `#22443b` · `--pb-collapsed-bg` `#1a2b27` · `--pb-collapsed-hover` `#213a33`.
**`… .pb-led--green`**: `--pb-led-rim-on` `#3b6b45`. Other lit values unchanged.
**`… .pb-led--amber`**: `--pb-led-rim-on` `#7a6233`. Other lit values unchanged.
**PushbuttonCross cap**: unchanged (it is a hardware colour).

**Waveform — `… .wv-pane`**

| Variable | Dark | Variable | Dark |
| --- | --- | --- | --- |
| `--wv-bg` | `#121416` | `--wv-grid` | `#2a2f36` |
| `--wv-axis-text` | `#abb4c0` | `--wv-trace-high` / `-low` | `#4ade80` |
| `--wv-trace-bus` | `#83b9ff` | `--wv-trace-bus-text` | `#eceff4` |
| `--wv-trace-undefined` | `#ff9a9a` | `--wv-trace-z` | `#ffd27a` |
| `--wv-trace-dont-care` | `#858e9a` | `--wv-cursor` | `#fbbf24` |
| `--wv-cursor-text` | `#1f2937` (dark on the amber handle) | `--wv-error-marker` | `#ff9a9a` |
| `--wv-selection` | `#83b9ff` | `--wv-tool-bg` | `#262a30` |
| `--wv-tool-bg-hover` | `#303640` | `--wv-tool-ink` | `#83b9ff` |
| `--wv-row-hover` | `#1c1f23` | `--wv-row-selected` | `#1f3550` |
| `--wv-tb-ink` | `#83b9ff` | `--wv-tb-tint` | `#1a2230` |
| `--wv-tb-head-ink` | `#c7dcff` | `--wv-rtl-ink` | `#8cdea3` |
| `--wv-rtl-tint` | `#17241c` | `--wv-rtl-head-ink` | `#c4f0d0` |
| `--wv-enum-ink` | `#d5b0ff` | `--wv-drag-grip` | `#778391` |
| `--wv-drag-veil` | `rgb(18 20 22 / 0.65)` | `--wv-drag-ghost-bg` | `#262a30` |
| `--wv-drag-flash` | `rgb(131 185 255 / 0.18)` | `--wv-drag-muted` | `#3b414a` |

### 8.3 Rules for the variables created in Phase 1

Apply these rules in order. The first match wins.

1. **Same Light value and same role as a variable in § 8.2** → use that variable's Dark value.
2. **By role suffix and Light value:**

| Light value looks like | Role | Dark |
| --- | --- | --- |
| white / near-white (`#fff`, `#f8fafc`, `#f1f5f9`) | `-bg` of page or editor area | `#121416` |
| same | `-bg` of panel, sidebar, card | `#1c1f23` |
| same | `-bg` of dialog, menu, popover, tooltip, input | `#262a30` |
| light grey (`#eef2f7`, `#e2e8f0`) | `-bg-hover` | `#2a2f36` (on panel) / `#303640` (on raised) |
| light blue tint (`#e5efff`, `#eff6ff`, `#dbeafe`) | `-bg-selected`, soft accent | `#1f3550` |
| light green / red / amber tint | status background | `#17301f` / `#3a1d20` / `#382d18` |
| dark slate (`#0f172a`, `#1e293b`, `#334155`) | `-fg` | `#eceff4` (main) / `#c9d0d9` (body) |
| mid slate (`#475569`, `#64748b`, `#94a3b8`) | `-fg` muted | `#abb4c0` |
| light grey (`#e2e8f0`, `#cbd5e1`, `#d1d9e6`) | `-border` separator | `#3b414a` |
| same | `-border` of an input or button | `#778391` |
| blue (`#1d4ed8`, `#2563eb`, `#1e40af`) | `-fg` / ink | `#83b9ff` |
| same | `-bg` fill with white text | `#245a96` |
| green / red / amber / purple / teal ink | `-fg` | `#8cdea3` / `#ff9a9a` / `#ffd27a` / `#d5b0ff` / `#5eead4` |
| `#ffffff` | text on a coloured fill | `#ffffff` |
| translucent slate/black | backdrop / shadow | `#000000a6` / `#00000080` |
| translucent slate (`rgba(15,23,42,0.08)` etc.) | `edge` (no-blur shadow ring) | `#3b414a` |

3. **Console variables** (`ConsoleOutput.css`): the console is already dark. Keep the Light values, except backgrounds that equal `#0f172a` → `#0e1012`.
4. Still unclear → choose the closest base-palette role (§ 8.1) and add the comment `/* chosen: <role> */`.

### 8.4 Depth on dark surfaces

Soft shadows are nearly invisible on near-black, so in Dark, hierarchy comes from **surface steps plus edges**, not from shadows:

- A layer that floats (dialog, menu, popover, tooltip, dropdown) uses a **raised** surface (`#262a30`) one step lighter than what lies under it, **and** a visible edge or border of at least `#3b414a`. Its `-border` / `-edge` variable gets that value even where Light relies on the shadow alone.
- Backdrops behind modal dialogs are `#000000a6`, so the dialog stands clearly apart from the dimmed app.
- Exempt blurred shadows (C4) stay as they are. They do no harm on dark, and the edge carries the separation.
- Focus rings use `#83b9ff` (≥ 3:1 against panel, raised and accent-tint surfaces).

### Gate 3

- `npm test` passes (parity, values, contrast § 9.3).
- `THEME=dark node theme-snapshot.mjs save` runs. Review the Dark screenshots by hand: run the dev server in Dark and open every state from § 9.1.
- `theme-snapshot.mjs compare` for **Light** is still `identical`.

---

## 9. Phase 4 — Verification

### 9.1 Acceptance criteria

| ID | Scenario | Expected |
| --- | --- | --- |
| A01 | No saved preference, or an invalid one | System (follows the OS); the app starts normally |
| A02 | Choose Dark; reload; restart the desktop app | Dark returns; production build shows no light flash |
| A03 | System; switch the OS light ↔ dark | The app follows immediately |
| A03b | System, where the OS preference cannot be read | Light (unit test, T2.9) |
| A04 | Explicit Dark; switch the OS | The app stays Dark |
| A05 | Switch theme while editing and simulating | Text, cursor, selection, scroll, focus, simulation and board state stay |
| A06 | Same viewport, project and state in Light and Dark | Board I/O geometry and hit areas match (§ 9.2) |
| A07 | Operate every switch, key, LED and HEX in Dark | Positions, pressed state, lit/unlit and intermediate brightness are recognisable |
| A08 | Open Settings, Help, About, New file, Paste architecture, Board change, GitHub dialogs, file menu, board display menus, I/O visibility dialog, find bar, Projects page, Board settings page | Everything is themed and readable |
| A09 | Hover, focus, selected, disabled and diagnostic states | Distinguishable; status is never shown by colour only |
| A10 | Save/export a project or Gist; open another project | Theme is not in the file; the preference is unchanged |
| A11 | Block `localStorage` (e.g. a stubbed `setItem` that throws) | The theme changes for the session; the save-failed note appears in Settings |
| A12 | Switch back to Light | `theme-snapshot.mjs compare` is `identical` to the Phase 0 baseline |
| A13 | Switch theme with a waveform open: once during a live simulation, once on a finished run, and with two views open | Every canvas repaints in the new colours; data, cursor, zoom and selection stay |
| A13b | Open a menu, a tooltip and a dialog in Dark | Each is clearly separated from what lies under it (raised surface + edge, § 8.4) |
| A14 | Export a report figure and a screen-look figure in Dark | Report keeps print colours; screen-look uses the Dark palette |
| A15 | `node tools/theme-literals.mjs` | 0 literals |
| A16 | `grep -rn "data-theme" src --include=*.css --include=*.tsx` | Matches only in `dark.css` (and none in components) |

Check both VHDL and Verilog, one narrow layout, and 200 % zoom, in the browser and in the packaged desktop build.

### 9.2 Geometry check (manual, about 5 minutes)

In DevTools, select a switch, an LED, a KEY and a HEX digit. Compare `getBoundingClientRect()` in Light and Dark (switch theme with the element still selected). The values must be identical. Because Phases 1–3 only move or change colour declarations, a difference means a geometry line was edited by mistake.

### 9.3 Contrast test — `src/theme/themeContrast.test.ts`

The test computes contrast from the Dark profile values with the WCAG 2.2 relative-luminance formula. Translucent layers are composited over their opaque base first, so the test checks what is actually rendered. It also checks that unlit LEDs and segments stay visible while being clearly weaker than lit ones.

```ts
// SPDX-License-Identifier: GPL-2.0-only
import { describe, expect, it } from 'vitest';
import darkCss from './themes/dark.css?raw';
import { DARK_PREFIX, findValue, parseThemeBlocks } from './themeCss.testSupport';

const TEXT = 4.5;
const CONTROL = 3;
/** An unlit LED or segment must still read as a shape on its surface… */
const UNLIT_VISIBLE = 1.5;
/** …and a lit one must stand out at least this many times more. */
const LIT_OVER_UNLIT = 1.5;
const HEX_COLOUR = /^#[0-9a-f]{6}([0-9a-f]{2})?$/i;

const dark = parseThemeBlocks(darkCss, DARK_PREFIX);

/** A translucent variable as seen on screen: composited over an opaque base variable. */
interface Layer {
  readonly name: string;
  readonly over: string;
}

type Background = string | Layer;
type Pair = readonly [foreground: string, background: Background, minimum: number];

const selection: Layer = { name: '--wb-code-selection', over: '--wb-code-bg' };
const errorLine: Layer = { name: '--wb-diag-error-bg', over: '--wb-code-bg' };
const warningLine: Layer = { name: '--wb-diag-warning-bg', over: '--wb-code-bg' };
const occurrence: Layer = { name: '--wb-occ-bg', over: '--wb-code-bg' };

const PAIRS: readonly Pair[] = [
  ['--wb-text', '--wb-sidebar-bg', TEXT],
  ['--wb-text-muted', '--wb-sidebar-bg', TEXT],
  ['--wb-text', '--wb-dialog-bg', TEXT],
  ['--wb-text-body', '--wb-dialog-bg', TEXT],
  ['--wb-accent-ink', '--wb-sidebar-bg', TEXT],
  ['--wb-accent-dark-ink', '--wb-dialog-bg', TEXT],
  ['--wb-code-fg', '--wb-code-bg', TEXT],
  ['--wb-gutter-fg', '--wb-sidebar-bg', TEXT],
  ['--wb-syn-keyword', '--wb-code-bg', TEXT],
  ['--wb-syn-type', '--wb-code-bg', TEXT],
  ['--wb-syn-comment', '--wb-code-bg', TEXT],
  ['--wb-syn-string', '--wb-code-bg', TEXT],
  ['--wb-syn-number', '--wb-code-bg', TEXT],
  ['--wb-syn-punct', '--wb-code-bg', TEXT],
  ['--wb-syn-directive', '--wb-code-bg', TEXT],
  ['--wb-syn-system', '--wb-code-bg', TEXT],
  ['--wb-code-fg', selection, TEXT],
  ['--wb-syn-comment', selection, TEXT],
  ['--wb-syn-keyword', selection, TEXT],
  ['--wb-code-fg', errorLine, TEXT],
  ['--wb-diag-error-text', errorLine, TEXT],
  ['--wb-diag-warning-text', warningLine, TEXT],
  ['--wb-code-fg', occurrence, TEXT],
  ['--wb-code-fg', '--wb-find-current-bg', TEXT],
  ['--pb-label', '--pb-card-bg', TEXT],
  ['--pb-readout-fg', '--pb-readout-bg', TEXT],
  ['--pb-menu-text', '--pb-surface', TEXT],
  ['--wv-axis-text', '--wv-bg', TEXT],
  ['--wv-trace-bus-text', '--wv-bg', TEXT],
  ['--pb-focus', '--pb-card-bg', CONTROL],
  ['--pb-sw-body-edge', '--pb-card-bg', CONTROL],
  ['--pb-led-ring', '--pb-card-bg', CONTROL],
];

/** [lit colour, unlit colour, surface they sit on]. */
const LIT_UNLIT: readonly (readonly [lit: string, unlit: string, surface: string])[] = [
  ['--pb-led-body', '--pb-led-off', '--pb-card-bg'],
  ['--pb-hex-seg-on', '--pb-hex-seg-off', '--pb-part-face'],
];

function hexColour(name: string): string {
  const value = findValue(dark, name);
  if (value === undefined || !HEX_COLOUR.test(value)) throw new Error(`${name} must be #rrggbb or #rrggbbaa in dark.css`);
  return value.toLowerCase();
}

function opaqueColour(name: string): string {
  const value = hexColour(name);
  if (value.length !== 7) throw new Error(`${name} must be opaque (#rrggbb) in dark.css`);
  return value;
}

function byte(hex: string, offset: number): number {
  return parseInt(hex.slice(offset, offset + 2), 16);
}

/** Alpha-composites `top` (#rrggbbaa or #rrggbb) over the opaque `base`. */
function composite(top: string, base: string): string {
  const alpha = top.length === 9 ? byte(top, 7) / 255 : 1;
  const mix = (offset: number) => Math.round(byte(top, offset) * alpha + byte(base, offset) * (1 - alpha));
  return `#${[1, 3, 5].map((offset) => mix(offset).toString(16).padStart(2, '0')).join('')}`;
}

function rendered(background: Background): string {
  return typeof background === 'string' ? opaqueColour(background) : composite(hexColour(background.name), opaqueColour(background.over));
}

function channel(hex: string, offset: number): number {
  const value = byte(hex, offset) / 255;
  return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
}

function luminance(hex: string): number {
  return 0.2126 * channel(hex, 1) + 0.7152 * channel(hex, 3) + 0.0722 * channel(hex, 5);
}

function contrast(a: string, b: string): number {
  const [brighter, darker] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (brighter + 0.05) / (darker + 0.05);
}

describe('Dark contrast', () => {
  it.each(PAIRS)('%s (pair %#) meets its minimum', (foreground, background, minimum) => {
    expect(contrast(opaqueColour(foreground), rendered(background))).toBeGreaterThanOrEqual(minimum);
  });

  it.each(LIT_UNLIT)('%s is clearly stronger than %s, which stays visible', (lit, unlit, surface) => {
    const unlitContrast = contrast(opaqueColour(unlit), opaqueColour(surface));
    const litContrast = contrast(opaqueColour(lit), opaqueColour(surface));
    expect(unlitContrast).toBeGreaterThanOrEqual(UNLIT_VISIBLE);
    expect(litContrast).toBeGreaterThanOrEqual(unlitContrast * LIT_OVER_UNLIT);
  });
});
```

The values in § 8.2 are pre-checked: text pairs ≥ 5.6:1; syntax colours ≥ 8.5:1 on the code background and ≥ 5.3:1 inside a selection; code text over error, warning and occurrence tints ≥ 9:1; lit LED 4.0:1 vs unlit 2.1:1; lit segment 3.9:1 vs unlit 1.8:1. When you add a new important text/background pair, add it to `PAIRS`. A translucent background is written as a `Layer`.

Also check by eye: focus on a selected control, badges, tooltips, and LEDs/segments at intermediate brightness.

---

### T4.1 Developer note — `docs/Design_Description.md`

Add a short **Theming** section, so later work keeps the system intact. Use this text:

> **Theming.** Colours live only in the theme profiles `src/theme/themes/light.css` (default) and `dark.css`. Components use `var(--…)` and never colour literals, theme-ID checks or `!important`. Geometry tokens (`--pb-unit`, sizes, radii, travel) stay in the component token files and are never themed.
>
> **To add a colour:** (1) name it with `--<wb|pb|wv|hdl>-<component>-<part>-<role>[-<state>]`; (2) declare it in the `:root` block of `light.css` **and** of `dark.css` (if the existing variable family lives on `.pb-ui` / `.wv-pane` / a variant, declare it in that block in both files); (3) use it with `var(--name)`; (4) run `npm test` (parity + contrast) and `node tools/theme-literals.mjs` (must report 0). Neutral blurred shadows may stay literal with `/* theme-exempt: shadow */`.
>
> **Board I/O:** only colours are themed. Unlit LEDs and segments must stay visible and clearly weaker than lit ones; hardware colours (red/green/amber LEDs, the red reset cap) do not change between themes.
>
> Full rules: `docs/HDLBoard_Black_Theme_Spec.md`.

---

## 10. Definition of done

- [ ] `light.css` holds today's colours. The Light snapshot is identical to the Phase 0 baseline.
- [ ] `dark.css` is complete. The parity, value and contrast tests pass.
- [ ] Settings → Appearance (Light / Dark / System) works, persists and shows the save-failed note when storage is blocked.
- [ ] Startup shows no flash longer than one frame. System mode follows the OS live, and falls back to Light when the OS cannot be read.
- [ ] Dialogs, menus, portals, editor, console, waveform (canvas included) and all Board I/O components follow the theme. Board geometry is unchanged.
- [ ] 0 colour literals outside the theme files (except marked blurred shadows and exempt paths). The editor selection is translucent.
- [ ] No component contains a theme-ID condition, `!important` or a colour literal.
- [ ] `docs/theme_light_baseline_issues.md` lists any Light contrast issues found (not fixed in this delivery).
- [ ] A01–A16 (incl. A03b, A13b) checked in the browser and in the desktop app (Windows, Linux AppImage). Surfaces the app does not own (§ 2.2) are noted if they do not follow.
- [ ] `docs/Design_Description.md` has the Theming section (T4.1).

## 11. Later (not this release)

- **Third theme:** copy `dark.css` to `<name>.css`, change the prefix and values, add the ID to `ResolvedTheme`/`THEME_PREFERENCES`, and add one Settings choice. The parity test covers it once it is added to the test list.
- **User themes:** load a validated list of `--variable: colour` pairs (the same allowed-value rule as T0.3) into one `<style>` element with its own `data-theme` value. Reject anything else, keep the last valid theme on error, and offer recovery to Light. No component changes are needed.

---

## Appendix A — Review decisions (version 2.1)

Four review comment sets were checked against the code and against the original brief: save today's colours as an editable profile first, then add a modern dark alternative; dialogs and Board I/O follow the theme; Board I/O is recoloured only; Clean Code; simple enough to implement step by step.

**Adopted**

| Comment | Change |
| --- | --- |
| Opaque editor selection would hide the syntax layer | `--wb-code-selection` is required and must stay translucent (`#4c8dff4d`); contrast is tested on the composited colour (§ 3, § 4.4, § 8.2, § 9.3) |
| Light contrast targets conflict with "no visual change" | T05 applies to Dark; Light shortfalls (gutter, comments, comments in selection) are logged, not fixed (§ 2.1, Gate 1) |
| Contrast method unspecified; measure rendered states | WCAG 2.2 relative luminance; translucent layers composited in the test (§ 2.1, § 9.3) |
| Unlit LED/segment visibility | Automated lit-vs-unlit check (§ 9.3) |
| Shadows vanish on dark; popovers blend in | Edge shadows become `edge` variables (C4); depth via surface step + edge (§ 8.4, A13b) |
| Flash requirement should be testable | "No flash longer than one frame" (T07) |
| Desktop persistence scope unclear | Renderer `localStorage` in browser and Electron, no bridge (D3) |
| Save-failure message deviates from the silent pattern | Stated as a deliberate difference; shown in the Settings dialog (D3) |
| Out-of-scope surfaces must be explicit | List in § 2.2, including DevTools |
| System fallback when OS detection is unavailable | Unit tests + A03b |
| Waveform repaint must cover all views, live and static | T2.6, A13 |
| Report vs screen-look export ambiguity | Documented: existing separate actions already make the choice explicit (§ 3); no new UI |
| Forbid font-metric / line-height / tokenisation changes; strengthen "no theme-ID checks" | § 0 rule 3, T2.6 |
| Scanner misses `rgb()` strings in TS and channel triples | Scanner pattern widened; glow triples listed in T1.1 |
| Allow new semantic roles when none fits | Reuse rule 4 (§ 4.4) |
| Developer documentation for adding colours | T4.1 |
| "Black" is really a dark-grey theme | Renamed to **Dark** (`dark`), as in the original brief |

**Not adopted**

| Comment | Reason |
| --- | --- |
| Keep hard-coded colours in Board I/O | Conflicts with the brief: Board I/O must be recoloured so it stays visible. Hardware colours (lit LEDs, red reset cap) are kept unchanged by value instead |
| JSON schema, validator, type parity, schema versioning, short-palette→JSON mapping, canonical `--hdl-theme-*` + alias layer | Superseded by D1: the CSS profile files are the contract, and the parity/value tests enforce it. No extra indirection layer |
| Allow missing variables with fallback to Light | A fallback would hide an un-themed light surface in Dark. Copying a line into two files is cheap; the parity test points to it |
| Validate Light against the same targets now | Would force visible Light changes in the extraction phase; deferred and logged instead |
| Machine-readable inventory file | The scanner output (T0.1) is the live inventory; inline `theme-exempt` markers record the exceptions |
| New export-mode UI | The existing ⋯ menu already separates screen-look and report export |

