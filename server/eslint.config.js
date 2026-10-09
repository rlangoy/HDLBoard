// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * Lint rules for the *new* Verilog-backend code only — docs/Verilog_implementation_plan.md
 * § 6.3. They make the Clean Code standard of § 6.1 measurable (small functions, few
 * parameters, low complexity, honest types) without reformatting code that already ships.
 *
 * Add a path to NEW_CODE when a new module is created; do not add old files to it.
 * An `eslint-disable` needs a comment saying why. The goal is zero.
 */

import tseslint from 'typescript-eslint';

const NEW_CODE = [
  'src/verilog/**/*.ts',
  'src/engines/**/*.ts',
  'src/runtime.ts',
  'src/session.ts',
  'src/session.test.ts',
  'src/server.test.ts',
  'src/outputLimiter.ts',
  'src/settings.ts',
  'src/settings.test.ts',
  'src/testSupport/**/*.ts',
  'src/githubAuth.ts',
  'src/githubAuth.test.ts',
];

const MAX_FUNCTION_LINES = 40;
const MAX_PARAMETERS = 3;
const MAX_COMPLEXITY = 8;
const MAX_NESTING_DEPTH = 3;

export default tseslint.config(
  {
    files: NEW_CODE,
    languageOptions: { parser: tseslint.parser },
    plugins: { '@typescript-eslint': tseslint.plugin },
    rules: {
      'max-lines-per-function': ['error', { max: MAX_FUNCTION_LINES, skipBlankLines: true, skipComments: true }],
      'max-params': ['error', MAX_PARAMETERS],
      complexity: ['error', MAX_COMPLEXITY],
      'max-depth': ['error', MAX_NESTING_DEPTH],
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-non-null-assertion': 'error',
      // A warning, not an error: named constants are the goal, but a literal that is
      // its own explanation (an index, a doubling) should not need ceremony.
      'no-magic-numbers': ['warn', { ignore: [-1, 0, 1, 2], ignoreArrayIndexes: true, enforceConst: true }],
    },
  },
  {
    // A test suite's `describe` callback is a list of cases, not logic, and its
    // expected values are the test data.
    files: ['**/*.test.ts'],
    rules: { 'max-lines-per-function': 'off', 'no-magic-numbers': 'off' },
  },
);
