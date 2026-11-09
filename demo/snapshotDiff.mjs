// SPDX-License-Identifier: GPL-2.0-only
// Compares two computed-colour snapshots (docs/HDLBoard_Black_Theme_Spec.md T0.2).

/** Elements inside <head>: their number changes with the stylesheets loaded, never what is drawn. */
const HEAD_TAG = /^(HEAD|LINK|META|SCRIPT|STYLE|TITLE) /;

/** A captured line is "<index> <TAG> .<classes> <colours…>"; the index shifts when elements are added. */
function withoutIndex(line) {
  return line.slice(line.indexOf(' ') + 1);
}

/** The lines that describe what is drawn, comparable between two captures. */
export function drawnLines(lines) {
  return lines.map(withoutIndex).filter((line) => !HEAD_TAG.test(line));
}

/** common[i][j] = length of the longest common subsequence of expected[i…] and actual[j…]. */
function commonSuffixLengths(expected, actual) {
  const common = Array.from({ length: expected.length + 1 }, () => new Uint32Array(actual.length + 1));
  for (let i = expected.length - 1; i >= 0; i--) {
    for (let j = actual.length - 1; j >= 0; j--) {
      const same = expected[i] === actual[j];
      common[i][j] = same ? common[i + 1][j + 1] + 1 : Math.max(common[i + 1][j], common[i][j + 1]);
    }
  }
  return common;
}

/**
 * The lines only in the baseline (changed or removed elements) and the lines only in the new
 * capture (changed or added elements). Matching by longest common subsequence keeps an added
 * element from shifting every later element into a false difference.
 */
export function differences(expectedLines, actualLines) {
  const [expected, actual] = [drawnLines(expectedLines), drawnLines(actualLines)];
  const common = commonSuffixLengths(expected, actual);
  const removed = [];
  const added = [];
  let [i, j] = [0, 0];
  while (i < expected.length || j < actual.length) {
    const bothLeft = i < expected.length && j < actual.length;
    if (bothLeft && expected[i] === actual[j]) {
      i++;
      j++;
    } else if (j < actual.length && (i === expected.length || common[i][j + 1] >= common[i + 1][j])) {
      added.push(actual[j++]);
    } else {
      removed.push(expected[i++]);
    }
  }
  return { removed, added };
}

/** How many differences fail the comparison; added elements count unless `allowAdded`. */
export function failureCount({ removed, added }, allowAdded) {
  return allowAdded ? removed.length : removed.length + added.length;
}
