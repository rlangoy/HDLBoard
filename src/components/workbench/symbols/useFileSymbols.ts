// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import { useMemo } from 'react';
import { analyzeFile, type FileSymbols } from './fileSymbols';

/** The file's analysis, rebuilt only when its name or text changes; undefined without a file. */
export function useFileSymbols(file: { readonly name: string; readonly content: string } | undefined): FileSymbols | undefined {
  const name = file?.name;
  const content = file?.content;
  return useMemo(
    () => (name === undefined || content === undefined ? undefined : analyzeFile(name, content)),
    [name, content],
  );
}
