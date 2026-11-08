// SPDX-License-Identifier: GPL-2.0-only
// Computed-colour snapshot (docs/HDLBoard_Black_Theme_Spec.md T0.2).
// Usage (dev server running):  node theme-snapshot.mjs save|compare [url] [--allow-added]
//   save      records every state, with one screenshot per state, under output/theme-snapshot/<theme>/.
//   compare   fails on any changed, removed or added element. --allow-added accepts added
//             elements (changed and removed ones still fail): for comparing with a baseline saved
//             before a feature added UI, such as the Phase 0 baseline and Settings › Appearance.
//   THEME=dark node theme-snapshot.mjs save   → snapshot of the Dark theme for review
import { chromium } from 'playwright';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { differences, failureCount } from './snapshotDiff.mjs';

const DEFAULT_URL = 'http://localhost:5173/';
/** Read by the app at start (src/theme/themePreference.ts THEME_STORAGE_KEY). */
const THEME_STORAGE_KEY = 'hdlboard.theme.v1';
const VIEWPORT = { width: 1280, height: 800 };
const SETTLE_MS = 600;
const MAX_REPORTED_DIFFERENCES = 40;
const USAGE = 'Usage: node theme-snapshot.mjs save|compare [url] [--allow-added]';
const EXIT_USAGE = 2;
const COLOUR_PROPERTIES = [
  'color', 'background-color', 'background-image', 'border-top-color', 'border-right-color',
  'border-bottom-color', 'border-left-color', 'outline-color', 'box-shadow', 'text-shadow',
  'text-decoration-color', 'caret-color', 'accent-color', 'fill', 'stroke', 'color-scheme',
];

const clickButton = (name) => (page) => page.getByRole('button', { name, exact: true }).click();
const clickLabel = (name) => (page) => page.getByLabel(name, { exact: true }).click();
const clickCss = (selector) => (page) => page.locator(selector).click();
const hoverLabel = (name) => (page) => page.getByLabel(name, { exact: true }).hover();
/** Parks the mouse in a corner, so no hover style depends on where the last click was. */
const parkMouse = (page) => page.mouse.move(1, 1);
const steps = (...actions) => async (page) => {
  for (const action of actions) await action(page);
};

const STATES = [
  { name: 'workbench', open: async () => {} },
  { name: 'settings', open: clickButton('Settings') },
  { name: 'help', open: clickButton('Help') },
  { name: 'about', open: clickButton('About') },
  { name: 'board-menu', open: clickButton('LED display options') },
  { name: 'board-pressed', open: steps(clickLabel('SW3'), clickLabel('SW0'), hoverLabel('KEY1')) },
  { name: 'examples', open: clickButton('Examples') },
  { name: 'new-file', open: clickCss('.wb-files__new') },
  { name: 'find', open: clickButton('Search in DE1_SoC.vhdl') },
  { name: 'projects', open: clickCss('.wb-files__open-project') },
  { name: 'project-page', open: clickCss('.wb-files__project') },
  { name: 'board-settings', open: steps(clickButton('Settings'), clickButton('Manage board'), parkMouse) },
  { name: 'github', open: clickButton('GitHub') },
];

/** Runs in the page: one line per element with its own and its pseudo-elements' colours. */
function readColours(properties) {
  const read = (element, pseudo) => {
    const style = getComputedStyle(element, pseudo);
    return properties.map((property) => style.getPropertyValue(property)).join('|');
  };
  const describe = (element, index) => {
    const colours = [null, '::before', '::after'].map((pseudo) => read(element, pseudo)).join(' ');
    return `${index} ${element.tagName} .${element.getAttribute('class') ?? ''} ${colours}`;
  };
  return [...document.querySelectorAll('*')].map(describe);
}

/** Opens `state` in a fresh page with `theme` stored, runs `use(page)`, and closes the page. */
async function withStatePage(browser, { theme, url, state }, use) {
  const context = await browser.newContext({ viewport: VIEWPORT, reducedMotion: 'reduce' });
  await context.addInitScript(([key, value]) => localStorage.setItem(key, value), [THEME_STORAGE_KEY, theme]);
  const page = await context.newPage();
  await page.goto(url);
  await page.locator('.wb').waitFor();
  await state.open(page);
  await page.waitForTimeout(SETTLE_MS);
  try {
    return await use(page);
  } finally {
    await context.close();
  }
}

function captureColours(page) {
  return page.evaluate(readColours, COLOUR_PROPERTIES);
}

async function saveState(page, state, outputDir) {
  const lines = await captureColours(page);
  await writeFile(path.join(outputDir, `${state.name}.json`), JSON.stringify(lines, null, 1));
  await page.screenshot({ path: path.join(outputDir, `${state.name}.png`) });
  return 0;
}

function report(name, { removed, added }) {
  const identical = removed.length === 0 && added.length === 0;
  const summary = identical ? 'identical' : `${removed.length} changed or removed, ${added.length} added element(s)`;
  console.log(`${name}: ${summary}`);
  removed.slice(0, MAX_REPORTED_DIFFERENCES).forEach((line) => console.log(`- ${line}`));
  added.slice(0, MAX_REPORTED_DIFFERENCES).forEach((line) => console.log(`+ ${line}`));
}

async function compareState(page, state, { outputDir, allowAdded }) {
  const expected = JSON.parse(await readFile(path.join(outputDir, `${state.name}.json`), 'utf8'));
  const found = differences(expected, await captureColours(page));
  report(state.name, found);
  return failureCount(found, allowAdded);
}

/** The command line, or null when it is not a valid one. */
function parseArguments(args) {
  const flags = args.filter((arg) => arg.startsWith('--'));
  const [mode, url = DEFAULT_URL] = args.filter((arg) => !arg.startsWith('--'));
  const isKnownMode = mode === 'save' || mode === 'compare';
  return isKnownMode ? { mode, url, allowAdded: flags.includes('--allow-added') } : null;
}

async function run({ mode, url, allowAdded }) {
  const theme = process.env.THEME ?? 'light';
  const outputDir = path.join(path.dirname(fileURLToPath(import.meta.url)), 'output', 'theme-snapshot', theme);
  await mkdir(outputDir, { recursive: true });
  const browser = await chromium.launch();
  let failures = 0;
  for (const state of STATES) {
    const run = mode === 'save'
      ? (page) => saveState(page, state, outputDir)
      : (page) => compareState(page, state, { outputDir, allowAdded });
    failures += await withStatePage(browser, { theme, url, state }, run);
  }
  await browser.close();
  return failures;
}

const options = parseArguments(process.argv.slice(2));
if (options === null) {
  console.error(USAGE);
  process.exitCode = EXIT_USAGE;
} else {
  process.exitCode = (await run(options)) === 0 ? 0 : 1;
}
