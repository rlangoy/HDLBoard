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
  'src/wave/**/*.ts',
  'src/integration/waveform.test.ts',
  'src/runtime.ts',
  'src/session.ts',
  'src/session.test.ts',
  'src/server.test.ts',
  'src/outputLimiter.ts',
  'src/rateLimit.ts',
  'src/rateLimit.test.ts',
  'src/socketOutput.ts',
  'src/socketOutput.test.ts',
  'src/wsLimits.ts',
  'src/wsLimits.test.ts',
  'src/server.limits.test.ts',
  'src/frameLimits.ts',
  'src/clientConnection.ts',
  'src/timeUnits.ts',
  'src/childEnv.ts',
  'src/childEnv.test.ts',
  'src/settings.ts',
  'src/settings.test.ts',
  // A full server closes an old session for a new one.
  'src/sessionLimit.ts',
  'src/sessionLimit.test.ts',
  // A student's address, so one student's many tabs give way first.
  'src/clientAddress.ts',
  'src/clientAddress.test.ts',
  'src/testSupport/**/*.ts',
  'src/githubAuth.ts',
  'src/githubAuth.test.ts',
  // Configurable board port names (docs/board_io_config_spec.md).
  'src/boardFrame.ts',
  'src/boardFrame.test.ts',
  'src/session.board.test.ts',
  'src/tbTemplate.test.ts',
  'src/integration/boards.test.ts',
  // Board shapes (docs/board_io_v2_spec.md).
  'src/boardFrameFields.ts',
  'src/boardNames.ts',
  'src/integration/boardShapes.test.ts',
  'src/integration/bounceTrain.test.ts',
  // Compiler options and the legacy Synopsys packages (issue #37).
  'src/compilerOptions.ts',
  'src/compilerOptions.test.ts',
  'src/session.options.test.ts',
  'src/integration/compilerOptions.test.ts',
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
