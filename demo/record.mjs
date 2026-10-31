import { chromium } from 'playwright';
import { mkdir, writeFile, unlink, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const dir = path.dirname(fileURLToPath(import.meta.url));
const output = path.join(dir, 'output');
await mkdir(output, { recursive: true });
const fast = process.env.DEMO_FAST === '1';
const pause = async (ms = 1200) => page.waitForTimeout(fast ? 100 : ms);
const browser = await chromium.launch({ headless: process.env.DEMO_HEADLESS === '1' });
const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, recordVideo: { dir: output, size: { width: 1280, height: 720 } }, acceptDownloads: true });
const page = await context.newPage();
const recordingStarted = Date.now();
let presentationStart = 0;
// Playwright videos do not include the OS pointer. Draw a small, noninteractive
// marker that follows real mouse events so recorded clicks and drags are legible.
await page.addInitScript(() => {
  document.addEventListener('DOMContentLoaded', () => {
    const dot = document.createElement('div');
    dot.style.cssText = 'position:fixed;z-index:2147483647;width:14px;height:14px;border:2px solid white;border-radius:50%;background:#1268d4;box-shadow:0 1px 4px #0009;pointer-events:none;left:-30px;top:-30px;transform:translate(-50%,-50%)';
    document.body.append(dot);
    document.addEventListener('mousemove', e => { dot.style.left = `${e.clientX}px`; dot.style.top = `${e.clientY}px`; });
  });
});
page.setDefaultTimeout(12000);
const button = (name) => page.getByRole('button', { name, exact: true });
const click = async (locator) => { await locator.scrollIntoViewIfNeeded(); await locator.hover(); await pause(500); await locator.click(); await pause(); };
const fastDialogClick = async (locator) => { await locator.scrollIntoViewIfNeeded(); await locator.hover(); await pause(250); await locator.click(); await pause(600); };
// The repeated checkbox clicks take about one tenth of a normal narrated click.
const quickClick = async (locator, delay = 170) => { await locator.scrollIntoViewIfNeeded(); await locator.hover(); await locator.click(); await page.waitForTimeout(fast ? 20 : delay); };
const check = async (condition, message) => { if (!condition) throw new Error(message); };
const drag = async (locator, dx, dy) => {
  const b = await locator.boundingBox();
  await check(b, 'Divider is not visible');
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
  await pause(500);
  await page.mouse.down();
  await page.mouse.move(b.x + b.width / 2 + dx, b.y + b.height / 2 + dy, { steps: 20 });
  await page.mouse.up();
  await pause();
};
try {
  await page.goto(process.env.HDLBOARD_URL || 'http://127.0.0.1:5173/');
  await page.getByRole('complementary', { name: 'Board I/O · Default' }).waitFor();
  await check(await page.locator('.pb-board--single').count() === 0, 'Expected default two-column board layout');
  await pause(2500);
  await click(button('Create a new project or add a new file'));
  await page.getByLabel('File name').fill('switchTest');
  await pause();
  await click(page.getByRole('checkbox', { name: /Create project/ }));
  await page.getByLabel('Board', { exact: true }).selectOption({ label: 'Nexys A7' });
  await pause();
  await click(button('Create'));
  await click(button('Remove files'));
  await page.getByRole('complementary', { name: 'Board I/O · Nexys A7' }).waitFor();
  // Skip the first six seconds of the project-open sequence in the delivered video.
  presentationStart = (Date.now() - recordingStarted) / 1000 + 6;
  await pause(1000);
  await drag(page.getByRole('separator', { name: 'Resize board panel' }), 180, 0);
  const editor = page.getByRole('textbox', { name: /Design \(RTL\) editor/ });
  const code = await editor.inputValue();
  await check(/begin\s*end architecture/i.test(code), 'Expected an empty starter architecture');
  await click(editor);
  await editor.fill(code.replace(/begin\s*end architecture/i, 'begin\n    LED <= SW(15 downto 0);\nend architecture'));
  await editor.press('Control+End');
  await check((await editor.inputValue()).includes('LED <= SW(15 downto 0);'), 'LED assignment missing');
  await pause(1000);
  await page.screenshot({ path: path.join(output, 'switch-code.png') });
  await click(button('Start'));
  await page.getByText('Simulation running ...', { exact: false }).waitFor();
  for (const i of [0, 2, 5]) {
    const sw = page.getByRole('switch', { name: `SW${i}`, exact: true });
    await sw.scrollIntoViewIfNeeded();
    await sw.hover();
    await pause(167);
    await sw.click();
    await page.getByRole('img', { name: `LD${i} on`, exact: true }).waitFor();
    await pause(400);
  }
  await click(button('Stop'));
  await click(button('Settings'));
  const boardDivider = page.getByRole('separator', { name: 'Resize board panel' });
  const originalBoardWidth = Number(await boardDivider.getAttribute('aria-valuenow'));
  const singleColumn = page.locator('label').filter({ hasText: 'Single column' });
  await singleColumn.hover();
  await singleColumn.click();
  await check(await page.getByLabel('Single column').isChecked(), 'Single column was not selected');
  await pause(1000);
  await page.getByRole('dialog', { name: 'Settings' }).getByRole('button', { name: 'Close', exact: true }).click();
  await pause();
  const singleColumnWidth = Number(await boardDivider.getAttribute('aria-valuenow'));
  await drag(boardDivider, singleColumnWidth - originalBoardWidth, 0);
  await check(Math.abs(Number(await boardDivider.getAttribute('aria-valuenow')) - originalBoardWidth) <= 1, 'Board pane width was not restored');
  for (const name of ['LED', 'Switch']) {
    await click(button(`${name} display options`));
    await click(page.getByRole('menuitemradio', { name: 'Group by 4' }));
  }
  await check(await page.getByLabel('LD bits 15 to 12').count() === 1 && await page.getByLabel('SW bits 15 to 12').count() === 1, 'Grouping by four failed');
  for (const [name, label] of [['LED', 'LD'], ['Switch', 'SW']]) {
    await fastDialogClick(button(`${name} display options`));
    await fastDialogClick(page.getByRole('menuitem', { name: /Choose visible/ }));
    for (let i = 15; i >= 8; i--) await quickClick(page.getByRole('checkbox', { name: `${label}${i}`, exact: true }), 28.5);
    await fastDialogClick(button('Apply'));
    await check(await page.getByRole(name === 'LED' ? 'img' : 'switch', { name: new RegExp(`^${label}15`) }).count() === 0, `${label}15 still visible`);
  }
  await click(button('Hide Explorer'));
  await button('Show Explorer').waitFor();
  // Reduce the output first, then fit both I/O panels in the remaining height.
  const consolePane = page.getByRole('region', { name: 'Simulator output' });
  const oldConsoleHeight = (await consolePane.boundingBox()).height;
  await drag(page.getByRole('separator', { name: 'Resize console' }), 0, 250);
  await check((await consolePane.boundingBox()).height < oldConsoleHeight, 'Simulator output did not shrink');
  const boardWidth = Number(await boardDivider.getAttribute('aria-valuenow'));
  // At the recording's 1280 x 720 viewport, 490 px keeps both panels readable.
  const targetWidth = 490;
  await drag(boardDivider, boardWidth - targetWidth, 0);
  const fits = await page.locator('.wb-board-fit').evaluate(viewport => {
    const bounds = viewport.getBoundingClientRect();
    const leds = viewport.querySelector('.pb-leds').getBoundingClientRect();
    const switches = viewport.querySelector('.pb-switches').getBoundingClientRect();
    return leds.top >= bounds.top && switches.bottom <= bounds.bottom;
  });
  await check(fits, 'LEDs and switches do not both fit in the board pane');
  await page.screenshot({ path: path.join(output, 'compact-layout.png') });
  await click(page.getByRole('button', { name: /^Start simulation \(Top:/ }));
  await page.getByText('Simulation running ...', { exact: false }).waitFor();
  for (const i of [0, 2, 5]) {
    const sw = page.getByRole('switch', { name: `SW${i}`, exact: true });
    const next = !(await sw.isChecked());
    await click(sw);
    await page.getByRole('img', { name: `LD${i} ${next ? 'on' : 'off'}`, exact: true }).waitFor();
  }
  await button('Stop simulation').click();
  await click(button('Show Explorer'));
  await click(button('Examples'));
  await click(button('Open UART Tx Testbench (VHDL)'));
  await check(await button('UART_Tx_tb.vhd is the top-level file').isDisabled(), 'UART testbench was not selected as top');
  await click(page.getByRole('button', { name: /^Waveform/ }));
  await page.getByRole('region', { name: 'Waveform' }).waitFor({ timeout: 60000 });
  await pause(2000);
  for (const name of ['clk', 'btn0', 'start', 'tx', 'busy', 'complete', 'sim_done', 'state']) {
    await quickClick(page.getByRole('checkbox', { name: `Show ${name}`, exact: true }));
  }
  await check(await page.locator('.wv-list__row.is-section').first().getAttribute('aria-expanded') === 'false', 'TB items should be collapsed');
  await click(page.locator('.wv-list__row.is-section').filter({ hasText: 'RTL' }));
  for (const name of ['clk', 'bittimer', 'state', 'tx', 'data']) {
    const signal = page.getByRole('checkbox', { name: `Show ${name}`, exact: true });
    await signal.scrollIntoViewIfNeeded();
    await signal.hover();
    await pause(250);
    await signal.click();
    await pause(600);
    await check(await page.getByRole('checkbox', { name: `Show ${name}`, exact: true }).isChecked(), `${name} not shown`);
  }
  await click(button('More'));
  await click(page.getByRole('menuitem', { name: /Figure for a report/ }));
  await page.getByRole('region', { name: 'Figure for a report' }).waitFor();
  await pause(3000);
  await click(button('Close the figure for a report'));
  await click(button('Close the waveform'));
  const divider = page.getByRole('separator', { name: 'Resize testbench editor' });
  const beforeSplit = Number(await divider.getAttribute('aria-valuenow'));
  await drag(divider, 160, 0);
  await check(Number(await divider.getAttribute('aria-valuenow')) > beforeSplit, 'Testbench editor did not widen');
  const tb = page.getByRole('textbox', { name: 'Testbench editor, UART_Tx_tb.vhd' });
  const original = await tb.inputValue();
  const oldLine = 'constant BAUD_RATE    : positive := 10_000_000;  -- Make it simple 10clks per txBit';
  await check(original.includes(oldLine), 'Unexpected baud rate in example');
  // Select just the value, scroll its line into view, then visibly type the change.
  await tb.click();
  await tb.evaluate(el => {
    const p = el.value.indexOf('10_000_000', el.value.indexOf('constant BAUD_RATE'));
    el.setSelectionRange(p, p + '10_000_000'.length);
    const line = el.value.slice(0, p).split('\n').length - 1;
    el.scrollTop = Math.max(0, (line - 4) * parseFloat(getComputedStyle(el).lineHeight));
    el.dispatchEvent(new Event('scroll'));
  });
  await pause(1800);
  await page.keyboard.type('115_200', { delay: fast ? 5 : 220 });
  await pause(1000);
  await tb.evaluate(el => { const s = 'Make it simple 10clks per txBit'; const p = el.value.indexOf(s); el.setSelectionRange(p, p + s.length); });
  await page.keyboard.type('Make it real :)', { delay: fast ? 5 : 120 });
  await pause(1000);
  await page.screenshot({ path: path.join(output, 'baud-edit.png') });
  // The example's introductory timing comment describes the old accelerated rate.
  const updated = await tb.inputValue();
  await check(updated.includes('constant BAUD_RATE    : positive := 115_200;  -- Make it real :)'), 'Baud-rate edit failed');
  await tb.fill(updated.replace('-- The baud rate is raised to 10 Mbaud so one bit lasts only 10 clocks\n-- (100 ns) and the whole frame fits in a short, readable waveform.', '-- The baud rate is 115,200 baud, close to a real UART setting.'));
  await click(button('Start simulation with UART_Tx_tb.vhd as top'));
  await page.getByText('Simulation complete.', { exact: false }).last().waitFor({ timeout: 60000 });
  await click(page.getByRole('button', { name: /^Waveform/ }));
  await page.getByRole('region', { name: 'Waveform' }).waitFor({ timeout: 60000 });
  await pause(2000);
  const canvas = page.getByLabel('Waveform traces. The values at the cursor are listed beside the signal names.');
  const box = await canvas.boundingBox();
  await check(box && box.width > 100, 'Waveform traces not visible');
  const beforeZoom = await canvas.screenshot();
  // The first UART bit begins around 8.7 us, roughly one tenth of the full run.
  await page.mouse.move(box.x + box.width * 0.025, box.y + 150);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.16, box.y + 150, { steps: 30 });
  await pause(500);
  await page.mouse.up();
  await pause(1500);
  await check(!beforeZoom.equals(await canvas.screenshot()), 'Waveform did not change after zoom');
  // Narrow the view again around the 8.67 us baud tick: its 10 ns pulse and
  // the adjacent clock edges are visible alongside the state transition.
  const zoomed = await canvas.boundingBox();
  await page.mouse.move(zoomed.x + zoomed.width * 0.481, zoomed.y + 150);
  await page.mouse.down();
  await page.mouse.move(zoomed.x + zoomed.width * 0.500, zoomed.y + 150, { steps: 20 });
  await pause(500);
  await page.mouse.up();
  await pause(1500);
  await page.screenshot({ path: path.join(output, 'final-frame.png') });
  await click(button('Close the waveform'));
  const nexysFile = page.getByRole('treeitem', { name: /Nexys_A7\.vhdl/ });
  await nexysFile.hover();
  await nexysFile.click();
  await page.waitForTimeout(1000);
} catch (error) {
  console.error(error);
  await page.screenshot({ path: path.join(output, 'failure.png') });
  await writeFile(path.join(output, 'failure.html'), await page.content());
  await writeFile(path.join(output, 'failure.txt'), await page.locator('body').innerText());
  process.exitCode = 1;
} finally {
  const video = page.video();
  await context.close();
  const rawVideo = await video.path();
  if (process.exitCode) {
    await video.saveAs(path.join(output, 'incomplete.webm'));
  } else {
    // Playwright bundles ffmpeg for video recording. Trim the setup using that
    // same executable, so reruns start at the actual project-created moment.
    const cache = process.env.PLAYWRIGHT_BROWSERS_PATH || (process.platform === 'win32' ? path.join(process.env.LOCALAPPDATA, 'ms-playwright') : path.join(process.env.HOME, '.cache', 'ms-playwright'));
    const ffmpegDir = (await readdir(cache)).filter(n => /^ffmpeg-\d+$/.test(n)).sort((a, b) => Number(b.split('-')[1]) - Number(a.split('-')[1]))[0];
    const ffmpegName = process.platform === 'win32' ? 'ffmpeg-win64.exe' : process.platform === 'darwin' ? 'ffmpeg-mac' : 'ffmpeg-linux';
    const ffmpeg = path.join(cache, ffmpegDir, ffmpegName);
    const target = path.join(output, 'hdlboard-demo.webm');
    await new Promise((resolve, reject) => {
      const child = spawn(ffmpeg, ['-y', '-loglevel', 'error', '-ss', String(presentationStart), '-i', rawVideo, '-c:v', 'libvpx-vp9', '-deadline', 'realtime', '-cpu-used', '8', '-an', target], { stdio: 'inherit' });
      child.on('error', reject);
      child.on('exit', code => code === 0 ? resolve() : reject(new Error(`Video trim failed (${code}); raw video: ${rawVideo}`)));
    });
  }
  await unlink(rawVideo);
  await browser.close();
}
