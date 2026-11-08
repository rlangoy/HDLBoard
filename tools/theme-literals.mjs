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
const CSS_LITERAL = /#[0-9a-fA-F]{3,8}\b|\b(?:rgba?|hsla?)\((?!\s*var\()|(?<![\w-])(?:white|black)(?![\w-])/; // not white-space
const CODE_LITERAL = /['"`](?:#[0-9a-fA-F]{3,8}['"`]|(?:rgba?|hsla?)\(|(?:white|black)['"`])/; // hex, rgb() or a named colour in TS/TSX strings and JSX attributes

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
