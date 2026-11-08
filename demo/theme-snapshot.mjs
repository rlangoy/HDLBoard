// SPDX-License-Identifier: GPL-2.0-only
// Computed-colour snapshot (docs/HDLBoard_Black_Theme_Spec.md T0.2).
// Usage (dev server running):  node theme-snapshot.mjs save|compare [url]
//   THEME=dark node theme-snapshot.mjs save   → snapshot of the Dark theme for review
// save also writes one screenshot per state (output/theme-snapshot/<theme>/<state>.png).
import { chromium } from 'playwright';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const [mode, url = 'http://localhost:5173/'] = process.argv.slice(2);
const theme = process.env.THEME ?? 'light';
const outputDir = path.join(path.dirname(fileURLToPath(import.meta.url)), 'output', 'theme-snapshot', theme);
const SETTLE_MS = 600;
const MAX_REPORTED_DIFFERENCES = 40;
const HEAD_TAG = /^(HEAD|LINK|META|SCRIPT|STYLE|TITLE) /;
const COLOUR_PROPERTIES = [
  'color', 'background-color', 'background-image', 'border-top-color', 'border-right-color',
  'border-bottom-color', 'border-left-color', 'outline-color', 'box-shadow', 'text-shadow',
  'text-decoration-color', 'caret-color', 'accent-color', 'fill', 'stroke', 'color-scheme',
];
const clickButton = (name) => (page) => page.getByRole('button', { name, exact: true }).click();
const clickLabel = (name) => (page) => page.getByLabel(name, { exact: true }).click();
const clickCss = (selector) => (page) => page.locator(selector).click();
const steps = (...actions) => async (page) => { for (const action of actions) await action(page); };
const STATES = [
  { name: 'workbench', open: async () => {} },
  { name: 'settings', open: clickButton('Settings') },
  { name: 'help', open: clickButton('Help') },
  { name: 'about', open: clickButton('About') },
  { name: 'board-menu', open: clickButton('LED display options') },
  { name: 'board-pressed', open: steps(clickLabel('SW3'), clickLabel('SW0'), (page) => page.getByLabel('KEY1', { exact: true }).hover()) },
  { name: 'examples', open: clickButton('Examples') },
  { name: 'new-file', open: clickCss('.wb-files__new') },
  { name: 'find', open: clickButton('Search in DE1_SoC.vhdl') },
  { name: 'projects', open: clickCss('.wb-files__open-project') },
  { name: 'project-page', open: clickCss('.wb-files__project') },
  { name: 'board-settings', open: steps(clickButton('Settings'), clickButton('Manage board'), (page) => page.mouse.move(1, 1)) },
  { name: 'github', open: clickButton('GitHub') },
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
  if (mode === 'save') await page.screenshot({ path: path.join(outputDir, `${state.name}.png`) });
  await context.close();
  return lines;
}

/** Drops the element index and the <head> elements, whose number changes with the stylesheets loaded. */
function rendered(lines) {
  return lines.map((line) => line.slice(line.indexOf(' ') + 1)).filter((line) => !HEAD_TAG.test(line));
}

/** Longest-common-subsequence table, so added or removed elements do not shift the rest. */
function commonTable(expected, actual) {
  const table = Array.from({ length: expected.length + 1 }, () => new Uint16Array(actual.length + 1));
  for (let i = expected.length - 1; i >= 0; i--) {
    for (let j = actual.length - 1; j >= 0; j--) {
      table[i][j] = expected[i] === actual[j] ? table[i + 1][j + 1] + 1 : Math.max(table[i + 1][j], table[i][j + 1]);
    }
  }
  return table;
}

/** Lines only in the baseline (changed or removed) and lines only in the new capture. */
function differences(expectedLines, actualLines) {
  const [expected, actual] = [rendered(expectedLines), rendered(actualLines)];
  const table = commonTable(expected, actual);
  const removed = [];
  const added = [];
  let [i, j] = [0, 0];
  while (i < expected.length || j < actual.length) {
    if (i < expected.length && j < actual.length && expected[i] === actual[j]) [i, j] = [i + 1, j + 1];
    else if (j < actual.length && (i === expected.length || table[i][j + 1] >= table[i + 1][j])) added.push(actual[j++]);
    else removed.push(expected[i++]);
  }
  return { removed, added };
}

async function compareState(name, lines) {
  const expected = JSON.parse(await readFile(path.join(outputDir, `${name}.json`), 'utf8'));
  const { removed, added } = differences(expected, lines);
  const summary = removed.length === 0 && added.length === 0 ? 'identical'
    : `${removed.length} changed or removed, ${added.length} added element(s)`;
  console.log(`${name}: ${summary}`);
  removed.slice(0, MAX_REPORTED_DIFFERENCES).forEach((line) => console.log(`- ${line}`));
  added.slice(0, MAX_REPORTED_DIFFERENCES).forEach((line) => console.log(`+ ${line}`));
  return removed.length;
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
