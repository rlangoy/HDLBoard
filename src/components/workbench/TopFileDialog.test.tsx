// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, test } from 'vitest';
import { TopFileDialog } from './TopFileDialog';
import type { TopFileSuggestion } from './topFileSuggestion';

const LAB2: TopFileSuggestion = { fileId: 'lab2', fileName: 'lab2.vhd', unitName: 'lab2', unitKind: 'entity', boardPorts: ['SW', 'KEY', 'LEDR'] };
const nothing = () => undefined;

function textOf(topFileName: string | null, suggestion = LAB2): string {
  const html = renderToStaticMarkup(
    <TopFileDialog
      suggestion={suggestion}
      topFileName={topFileName}
      onMakeTopAndStart={nothing}
      onStartAsItIs={nothing}
      onStopAsking={nothing}
      onClose={nothing}
    />,
  );
  return html.replace(/<[^>]+>/g, '');
}

describe('TopFileDialog', () => {
  test('asks about the file on screen', () => {
    expect(textOf('lab1.vhd')).toContain('Make lab2.vhd the Top-File?');
  });

  test('says what the Top-File is', () => {
    expect(textOf('lab1.vhd')).toContain('Start runs the Top-File');
  });

  test('gives the entity and the board ports as its evidence', () => {
    expect(textOf('lab1.vhd')).toContain('lab2.vhd (entity lab2) uses SW, KEY and LEDR, so it looks like one.');
  });

  test('calls a Verilog unit a module', () => {
    expect(textOf('lab1.vhd', { ...LAB2, fileName: 'lab3.v', unitName: 'lab3', unitKind: 'module', boardPorts: ['SW'] })).toContain(
      'lab3.v (module lab3) uses SW,',
    );
  });

  test('says what Start would run otherwise', () => {
    expect(textOf('lab1.vhd')).toContain('Now Start would run lab1.vhd.');
  });

  test('offers to start the current Top-File', () => {
    expect(textOf('lab1.vhd')).toContain('Start lab1.vhd');
  });

  test('offers making the file top and starting it', () => {
    expect(textOf('lab1.vhd')).toContain('Make lab2.vhd the Top-File and start');
  });

  test('says so when no file is the Top-File', () => {
    expect(textOf(null)).toContain('No file is the Top-File yet.');
  });

  test('offers to start without a Top-File when there is none', () => {
    expect(textOf(null)).toContain('Start without a Top-File');
  });

  test('points to the dot in Files', () => {
    expect(textOf('lab1.vhd')).toContain('with the dot beside a file name in Files');
  });

  test('says where Don’t ask me again is undone', () => {
    expect(textOf('lab1.vhd')).toContain('Turn it back on in Settings › General.');
  });
});
