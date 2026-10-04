// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * Sets the one HDLBoard version everywhere it is written down:
 *
 *   package.json, server/package.json, winInstaller/electron/package.json
 *   and the project's own entry in each of their package-lock.json files.
 *
 * The frontend's About dialog, the desktop app and the installer's file name
 * (HDLBoard-Setup-<version>.exe) all read these, so nothing else needs editing.
 *
 *   npm run version:bump -- 1.2.0     an exact version (1.2.0-rc.1: a pre-release)
 *   npm run version:bump -- minor     1.1.1 -> 1.2.0   (also: major, patch)
 *   npm run version:bump -- --check   fail unless every field agrees (build.ps1 runs this)
 *
 * Only the version fields are touched: each file is edited as text, not
 * re-serialised, so formatting and every other field stay byte-identical.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PROJECTS = ['.', 'server', join('winInstaller', 'electron')];
const SEMVER = /^(\d+)\.(\d+)\.(\d+)(-[0-9A-Za-z.-]+)?$/;

/** Every file and version field this script owns. */
function targets() {
  return PROJECTS.flatMap((dir) => [
    { file: join(ROOT, dir, 'package.json'), lock: false },
    { file: join(ROOT, dir, 'package-lock.json'), lock: true },
  ]);
}

/**
 * The project's own version fields: the top-level "version" (2-space indent) and,
 * in a lockfile, the one under `packages[""]` (6-space indent, the first entry).
 * Dependencies' versions sit deeper or later and are never matched.
 */
function versionFields(text, lock) {
  const top = /^( {2}"version": ")([^"]+)(")/m;
  const fields = [top];
  if (lock) fields.push(/("packages": \{\s*"": \{[^}]*?\n {6}"version": ")([^"]+)(")/);
  return fields.map((re) => ({ re, value: text.match(re)?.[2] }));
}

function readVersions() {
  return targets().flatMap(({ file, lock }) => {
    const text = readFileSync(file, 'utf8');
    return versionFields(text, lock).map(({ value }) => ({ file, value }));
  });
}

function bumped(current, part) {
  const m = SEMVER.exec(current);
  if (!m) throw new Error(`current version "${current}" is not x.y.z`);
  const [major, minor, patch] = m.slice(1, 4).map(Number);
  if (part === 'major') return `${major + 1}.0.0`;
  if (part === 'minor') return `${major}.${minor + 1}.0`;
  return `${major}.${minor}.${patch + 1}`;
}

function check() {
  const versions = readVersions();
  const distinct = [...new Set(versions.map((v) => v.value))];
  if (distinct.length === 1 && distinct[0] !== undefined) {
    console.log(`version ${distinct[0]} (all ${versions.length} fields agree)`);
    return 0;
  }
  console.error('version fields disagree:');
  for (const { file, value } of versions) console.error(`  ${value ?? '(missing)'}  ${relative(ROOT, file)}`);
  console.error('fix with: npm run version:bump -- <x.y.z>');
  return 1;
}

function setVersion(next) {
  for (const { file, lock } of targets()) {
    let text = readFileSync(file, 'utf8');
    for (const { re, value } of versionFields(text, lock)) {
      if (value === undefined) throw new Error(`no version field found in ${relative(ROOT, file)}`);
      text = text.replace(re, `$1${next}$3`);
    }
    writeFileSync(file, text);
  }
}

function main(arg) {
  if (arg === '--check') return check();
  if (arg === undefined) {
    console.error('usage: npm run version:bump -- <x.y.z | major | minor | patch | --check>');
    return 2;
  }
  const current = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')).version;
  const next = ['major', 'minor', 'patch'].includes(arg) ? bumped(current, arg) : arg;
  if (!SEMVER.test(next)) {
    console.error(`"${arg}" is not a version (x.y.z[-pre]) or major/minor/patch`);
    return 2;
  }
  setVersion(next);
  console.log(`version ${current} -> ${next}`);
  if (check() !== 0) return 1;
  console.log('Next: add a line to docs/changelog.txt, then rebuild the installer (winInstaller\\build.ps1).');
  return 0;
}

process.exit(main(process.argv[2]));
