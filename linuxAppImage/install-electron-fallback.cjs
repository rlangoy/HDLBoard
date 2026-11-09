// SPDX-License-Identifier: GPL-2.0-only
// Download the same locked Electron binary via GitHub's asset API when the
// normal release download endpoint fails. Never trust the download's own hash.
const { createHash } = require('node:crypto');
const { readFileSync, mkdirSync, writeFileSync } = require('node:fs');
const { resolve, join } = require('node:path');
const { createRequire } = require('node:module');

async function downloadVerifiedArchive(electronDir, cacheDir) {
  const { version } = JSON.parse(readFileSync(join(electronDir, 'package.json')));
  const name = `electron-v${version}-linux-x64.zip`;
  const checksums = JSON.parse(readFileSync(join(electronDir, 'checksums.json')));
  const expected = checksums[name];
  if (!/^[a-f0-9]{64}$/.test(expected ?? '')) throw new Error(`No pinned checksum for ${name}`);
  const archive = join(cacheDir, name);
  const matches = data => createHash('sha256').update(data).digest('hex') === expected;
  try {
    if (matches(readFileSync(archive))) return archive;
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  const headers = { 'User-Agent': 'HDLBoard-build', Accept: 'application/vnd.github+json' };
  const release = await fetch(`https://api.github.com/repos/electron/electron/releases/tags/v${version}`, {
    headers, signal: AbortSignal.timeout(60000),
  });
  if (!release.ok) throw new Error(`Electron release API: HTTP ${release.status}`);
  const asset = (await release.json()).assets.find(item => item.name === name);
  if (!asset || !Number.isSafeInteger(asset.id)) throw new Error(`Missing upstream asset ${name}`);
  console.log(`Downloading ${name} via GitHub asset ${asset.id}`);
  const response = await fetch(`https://api.github.com/repos/electron/electron/releases/assets/${asset.id}`, {
    headers: { ...headers, Accept: 'application/octet-stream' }, signal: AbortSignal.timeout(300000),
  });
  if (!response.ok) throw new Error(`Electron asset API: HTTP ${response.status}`);
  const data = Buffer.from(await response.arrayBuffer());
  if (!matches(data)) throw new Error(`Checksum mismatch for ${name}; refusing to install`);
  mkdirSync(cacheDir, { recursive: true });
  writeFileSync(archive, data);
  return archive;
}

async function install() {
  if (process.platform !== 'linux' || process.arch !== 'x64') throw new Error('Linux x64 only');
  const electronDir = resolve(__dirname, '../winInstaller/electron/node_modules/electron');
  const archive = await downloadVerifiedArchive(electronDir, resolve(__dirname, 'vendor/downloads'));
  const requireDesktop = createRequire(join(electronDir, 'package.json'));
  await requireDesktop('extract-zip')(archive, { dir: join(electronDir, 'dist') });
  writeFileSync(join(electronDir, 'path.txt'), 'electron');
}

module.exports = { downloadVerifiedArchive };
if (require.main === module) install().catch(error => { console.error(error); process.exitCode = 1; });
