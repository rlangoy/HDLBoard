// SPDX-License-Identifier: GPL-2.0-only
// What counts as a colour literal outside the theme files (docs/HDLBoard_Black_Theme_Spec.md T0.1).

const EXEMPT_PATHS = [
  'src/theme/themes/',
  'src/components/waveform/figure/figureStyle.ts', // report export palette
  'src/components/workbench/logo.tsx', // brand colours
  'src/ComponentGallery.css', // demo page, out of scope
  'src/Images/',
];
/** A line carrying this mark is allowed a literal (a neutral blurred shadow, rule C4). */
const EXEMPT_MARK = 'theme-exempt';

const HEX = /#[0-9a-fA-F]{3,8}\b/;
const COLOUR_FUNCTION = /\b(?:rgba?|hsla?)\((?!\s*var\()/;
/** `white` or `black` as a word, but not inside a name such as white-space. */
const COLOUR_WORD = /(?<![\w-])(?:white|black)(?![\w-])/;
const CSS_LITERAL = new RegExp([HEX, COLOUR_FUNCTION, COLOUR_WORD].map((part) => part.source).join('|'));
/** Hex, rgb() or a colour word as a TS/TSX string or JSX attribute value: '#fff', "rgb(", "white". */
const CODE_LITERAL = /['"`](?:#[0-9a-fA-F]{3,8}['"`]|(?:rgba?|hsla?)\(|(?:white|black)['"`])/;

/** A source file the scanner reads: CSS or TS/TSX, not a test, test data or an exempt path. */
export function isScannedFile(file) {
  const isSource = /\.(css|ts|tsx)$/.test(file) && !/\.d\.ts$/.test(file);
  const isTestData = /\.test\.|\.testSupport\.|\/fixtures\//.test(file);
  const isExempt = EXEMPT_PATHS.some((exempt) => file.startsWith(exempt));
  return isSource && !isTestData && !isExempt;
}

/** Replaces CSS comments with spaces, keeping line numbers. */
function blankComments(css) {
  return css.replace(/\/\*[\s\S]*?\*\//g, (comment) => comment.replace(/[^\n]/g, ' '));
}

/** The 1-based line numbers of `text` (the content of `file`) that hold a colour literal. */
export function literalLines(file, text) {
  const isCss = file.endsWith('.css');
  const original = text.split('\n');
  const scanned = isCss ? blankComments(text).split('\n') : original;
  const pattern = isCss ? CSS_LITERAL : CODE_LITERAL;
  const hasLiteral = (line, index) => pattern.test(line) && !original[index].includes(EXEMPT_MARK);
  return scanned.flatMap((line, index) => (hasLiteral(line, index) ? [index + 1] : []));
}
