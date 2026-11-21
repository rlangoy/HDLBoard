// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, test } from 'vitest';
import { TopFileDialog } from './TopFileDialog';
import type {
  BoardDesignSuggestion, PortedTestbenchSuggestion, TestbenchSuggestion, TopFileSuggestion,
} from './topFileSuggestion';

const LAB2: BoardDesignSuggestion = {
  kind: 'board-design',
  fileId: 'lab2',
  fileName: 'lab2.vhd',
  label: 'lab2.vhd',
  unitName: 'lab2',
  unitKind: 'entity',
  boardPorts: ['SW', 'KEY', 'LEDR'],
};

const LAB2_TB: TestbenchSuggestion = {
  kind: 'testbench',
  fileId: 'lab2_tb',
  fileName: 'lab2_tb.vhd',
  label: 'lab2_tb.vhd',
  unitName: 'lab2_tb',
  unitKind: 'entity',
  dutName: 'lab2',
};
const nothing = () => undefined;

function textOf(topFileName: string | null, suggestion: TopFileSuggestion = LAB2): string {
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
    const lab3: BoardDesignSuggestion = { ...LAB2, fileName: 'lab3.v', label: 'lab3.v', unitName: 'lab3', unitKind: 'module', boardPorts: ['SW'] };
    expect(textOf('lab1.vhd', lab3)).toContain('lab3.v (module lab3) uses SW,');
  });

  test('names the unit when the file holds more than one', () => {
    expect(textOf('lab1.vhd', { ...LAB2_TB, label: 'lab2.vhd › lab2_tb' })).toContain('Make lab2.vhd › lab2_tb the Top-File?');
  });
});

describe('TopFileDialog for a testbench', () => {
  test('says a testbench Top-File runs without the board', () => {
    expect(textOf('lab1.vhd', LAB2_TB)).toContain('A testbench as the Top-File runs without the board');
  });

  test('names the design it tests', () => {
    expect(textOf('lab1.vhd', LAB2_TB)).toContain('lab2_tb.vhd (entity lab2_tb) is a testbench for lab2.');
  });

  test('says only that it is a testbench when its design is unknown', () => {
    expect(textOf('lab1.vhd', { ...LAB2_TB, dutName: null })).toContain('lab2_tb.vhd (entity lab2_tb) is a testbench.');
  });
});

describe('TopFileDialog for a VHDL testbench with ports', () => {
  const SENSOR: PortedTestbenchSuggestion = {
    kind: 'ported-testbench',
    fileId: 'sensor_tb',
    fileName: 'sensor_tb.vhd',
    label: 'sensor_tb.vhd',
    unitName: 'sensor_tb',
    unitKind: 'entity',
    ports: ['probe'],
  };

  test('names its ports', () => {
    expect(textOf('lab1.vhd', SENSOR)).toContain('sensor_tb.vhd (entity sensor_tb) is a testbench with ports (probe).');
  });

  test('says it runs on the board, where none of its ports is wired', () => {
    expect(textOf('lab1.vhd', SENSOR)).toContain('A testbench with ports runs on the board, where none of its ports is wired');
  });
});

describe('TopFileDialog, every kind', () => {

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
