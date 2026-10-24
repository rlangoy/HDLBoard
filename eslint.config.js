// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * Lint rules for *new* frontend code: the same Clean Code limits as the backend's
 * (server/eslint.config.js; docs/Verilog_implementation_plan.md § 6.3) – small
 * functions, few parameters, low complexity, honest types – applied to the folders
 * listed here, without reformatting code that already ships.
 *
 * Add a folder to NEW_CODE when a new feature gets one; do not add old files to it.
 * An `eslint-disable` needs a comment saying why. The goal is zero.
 */

import tseslint from 'typescript-eslint';

const NEW_CODE = [
  'src/components/waveform/**/*.ts',
  'src/components/waveform/**/*.tsx',
  // The waveform view saved in the project file (docs/imp_wave_rearange.md § 11).
  'src/project/waveViews.ts',
  'src/components/workbench/useProjectWaveViews.ts',
  // Configurable board port names (docs/board_io_config_spec.md).
  'src/boards/**/*.ts',
  'src/components/workbench/useBoards.ts',
  'src/components/workbench/useBoardChange.ts',
  'src/components/workbench/BoardChangeDialog.tsx',
  'src/components/workbench/BoardIoPanel.tsx',
  'src/components/workbench/BoardSetting.tsx',
  'src/components/workbench/boardText.ts',
  'src/components/workbench/helpSignals.ts',
  'src/components/workbench/sourceComments.ts',
  'src/components/workbench/boardUi.test.ts',
];

const MAX_FUNCTION_LINES = 40;
const MAX_PARAMETERS = 3;
const MAX_COMPLEXITY = 8;
const MAX_NESTING_DEPTH = 3;

export default tseslint.config(
  {
    files: NEW_CODE,
    languageOptions: { parser: tseslint.parser, parserOptions: { ecmaFeatures: { jsx: true } } },
    plugins: { '@typescript-eslint': tseslint.plugin },
    rules: {
      'max-lines-per-function': ['error', { max: MAX_FUNCTION_LINES, skipBlankLines: true, skipComments: true }],
      'max-params': ['error', MAX_PARAMETERS],
      complexity: ['error', MAX_COMPLEXITY],
      'max-depth': ['error', MAX_NESTING_DEPTH],
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-non-null-assertion': 'error',
      'no-magic-numbers': ['warn', { ignore: [-1, 0, 1, 2], ignoreArrayIndexes: true, enforceConst: true }],
    },
  },
  {
    // A test suite's `describe` callback is a list of cases, and its expected values are the test data.
    files: ['**/*.test.ts', '**/*.testSupport.ts'],
    // TypeScript, wherever the test is: without the parser, `eslint src` fails on every
    // test file outside NEW_CODE (no rules apply to those; this block only turns rules off).
    languageOptions: { parser: tseslint.parser },
    rules: { 'max-lines-per-function': 'off', 'no-magic-numbers': 'off' },
  },
);
