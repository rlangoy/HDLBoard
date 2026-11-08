const { test } = require('node:test');
const assert = require('node:assert/strict');
const { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const { createHash } = require('node:crypto');
const { downloadVerifiedArchive } = require('./install-electron-fallback.cjs');

function fixture(t) {
  const dir = mkdtempSync(join(tmpdir(), 'hdlboard-electron-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const data = Buffer.from('verified archive');
  const name = 'electron-v33.4.11-linux-x64.zip';
  writeFileSync(join(dir, 'package.json'), JSON.stringify({ version: '33.4.11' }));
  writeFileSync(join(dir, 'checksums.json'), JSON.stringify({ [name]: createHash('sha256').update(data).digest('hex') }));
  const cache = join(dir, 'cache');
  mkdirSync(cache);
  return { dir, data, name, cache, archive: join(cache, name) };
}

test('a verified cached archive needs no network', async t => {
  const f = fixture(t);
  writeFileSync(f.archive, f.data);
  t.mock.method(globalThis, 'fetch', () => { throw new Error('Unexpected network'); });
  assert.equal(await downloadVerifiedArchive(f.dir, f.cache), f.archive);
});

test('a corrupt cache is replaced only after the API download matches the pinned hash', async t => {
  const f = fixture(t);
  writeFileSync(f.archive, 'corrupt');
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    if (url.includes('/tags/')) return { ok: true, json: async () => ({ assets: [{ name: f.name, id: 123 }] }) };
    assert.equal(url, 'https://api.github.com/repos/electron/electron/releases/assets/123');
    assert.equal(options.headers.Accept, 'application/octet-stream');
    return { ok: true, arrayBuffer: async () => f.data };
  });
  await downloadVerifiedArchive(f.dir, f.cache);
  assert.deepEqual(readFileSync(f.archive), f.data);
});

test('a mismatched download is rejected and never cached', async t => {
  const f = fixture(t);
  t.mock.method(globalThis, 'fetch', async url => url.includes('/tags/')
    ? { ok: true, json: async () => ({ assets: [{ name: f.name, id: 123 }] }) }
    : { ok: true, arrayBuffer: async () => Buffer.from('bad download') });
  await assert.rejects(downloadVerifiedArchive(f.dir, f.cache), /Checksum mismatch/);
  assert.equal(existsSync(f.archive), false);
});
