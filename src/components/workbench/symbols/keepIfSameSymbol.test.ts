// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import { describe, expect, it } from 'vitest';
import { tokenizeSource } from '../highlight';
import { symbolAtCaret } from './caretPosition';
import { keepIfSameSymbol } from './keepIfSameSymbol';
import { buildSymbolIndex } from './symbolIndex';

const SOURCE = 'signal count, b : bit;\ncount <= b;';
const INDEX = buildSymbolIndex('vhdl', tokenizeSource('vhdl', SOURCE.split('\n')));
const symbolOf = (caret: number) => symbolAtCaret(INDEX, SOURCE, caret);
const at = (word: string, from = 0) => SOURCE.indexOf(word, from);

describe('keepIfSameSymbol', () => {
  it('keeps the previous position while the cursor stays on the same name', () => {
    expect(keepIfSameSymbol(at('count'), at('count') + 3, symbolOf)).toBe(at('count'));
  });

  it('keeps it when the cursor moves to another use of the same name', () => {
    const declaration = at('count');
    expect(keepIfSameSymbol(declaration, at('count', declaration + 1), symbolOf)).toBe(declaration);
  });

  it('stores no position at all where there is no symbol, so every such place is equal', () => {
    expect(keepIfSameSymbol(undefined, at('signal'), symbolOf)).toBeUndefined();
    expect(keepIfSameSymbol(at('count'), at('bit'), symbolOf)).toBeUndefined();
    expect(keepIfSameSymbol(at('count'), undefined, symbolOf)).toBeUndefined();
  });

  it('takes the new position when the symbol changes', () => {
    expect(keepIfSameSymbol(at('count'), at('b :'), symbolOf)).toBe(at('b :'));
    expect(keepIfSameSymbol(undefined, at('count'), symbolOf)).toBe(at('count'));
  });
});
