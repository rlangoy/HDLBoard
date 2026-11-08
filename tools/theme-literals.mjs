// SPDX-License-Identifier: GPL-2.0-only
// Lists colour literals outside the theme files (docs/HDLBoard_Black_Theme_Spec.md T0.1).
// Usage: node tools/theme-literals.mjs     (exit code 1 while any remain)
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { isScannedFile, literalLines } from './themeLiteralRules.mjs';

const SOURCE_ROOT = 'src';
const COUNT_WIDTH = 4;

function listFiles(dir) {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name).replaceAll('\\', '/');
    return statSync(full).isDirectory() ? listFiles(full) : [full];
  });
}

function findLiterals(file) {
  const text = readFileSync(file, 'utf8');
  const lines = text.split('\n');
  return literalLines(file, text).map((line) => ({ file, line, text: lines[line - 1].trim() }));
}

function countByFile(findings) {
  const counts = new Map();
  findings.forEach(({ file }) => counts.set(file, (counts.get(file) ?? 0) + 1));
  return [...counts].sort((a, b) => b[1] - a[1]);
}

function report(findings) {
  findings.forEach(({ file, line, text }) => console.log(`${file}:${line}: ${text}`));
  console.log('\nPer file:');
  countByFile(findings).forEach(([file, count]) => console.log(`${String(count).padStart(COUNT_WIDTH)}  ${file}`));
  console.log(`\n${findings.length} colour literal(s) outside the theme files.`);
}

const findings = listFiles(SOURCE_ROOT).filter(isScannedFile).flatMap(findLiterals);
report(findings);
process.exitCode = findings.length === 0 ? 0 : 1;
