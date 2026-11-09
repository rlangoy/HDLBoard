// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import { describe, expect, it } from 'vitest';
import { parseCompilerOptions } from './compilerOptions';
import { parseProject, serializeProject } from './parseProject';
import { projectJson } from './testHelpers';
import type { CompilerOptions, Diagnostic } from './types';

function parsed(raw: unknown) {
  const warnings: Diagnostic[] = [];
  const options = parseCompilerOptions(raw, warnings);
  return { options, messages: warnings.map((warning) => warning.message) };
}

const EVERY_OPTION: CompilerOptions = {
  ghdl: { synopsys: 'auto', relaxed: true },
  iverilog: { generation: '2012', defines: { WIDTH: '8', SIMULATION: '' } },
};

describe('parseCompilerOptions', () => {
  it('is undefined when the project file has none', () => {
    expect(parsed(undefined).options).toBeUndefined();
  });

  it('keeps every valid option as written', () => {
    expect(parsed(EVERY_OPTION).options).toEqual(EVERY_OPTION);
  });

  it('fills in no defaults, so saving writes back only what was written', () => {
    expect(parsed({ ghdl: { synopsys: true } }).options).toEqual({ ghdl: { synopsys: true } });
  });

  it('leaves out a value that is not allowed, with a warning naming it', () => {
    expect(parsed({ ghdl: { synopsys: 'yes' } }).messages).toEqual([
      '"compilerOptions.ghdl.synopsys" must be one of "auto", true, false; it was left out',
    ]);
  });

  it('keeps the valid options next to a value left out', () => {
    expect(parsed({ ghdl: { synopsys: 'yes', relaxed: true } }).options).toEqual({ ghdl: { relaxed: true } });
  });

  it('leaves out an unknown option, so a raw flag is never passed on', () => {
    expect(parsed({ ghdl: { flags: '--vpi=x.dll' } }).messages).toEqual(['"compilerOptions.ghdl.flags" is not a known option; it was left out']);
  });

  it('leaves out an unknown tool', () => {
    expect(parsed({ nvc: {} }).options).toEqual({});
  });

  it('leaves out a field that is not an object', () => {
    expect(parsed('-fsynopsys').messages).toEqual(['"compilerOptions" is not an object; it was left out']);
  });

  it('leaves out an unknown Verilog generation', () => {
    expect(parsed({ iverilog: { generation: '1995' } }).options).toEqual({ iverilog: {} });
  });

  it('leaves out a macro whose name is not an identifier', () => {
    expect(parsed({ iverilog: { defines: { '1X': '1', OK: '2' } } }).options).toEqual({ iverilog: { defines: { OK: '2' } } });
  });

  it('leaves out a macro value with a backtick', () => {
    expect(parsed({ iverilog: { defines: { X: '`include "a.v"' } } }).messages).toEqual([
      '"compilerOptions.iverilog.defines.X" must be text of up to 64 characters, without a backtick; it was left out',
    ]);
  });

  it('leaves out a macro value that is not text', () => {
    expect(parsed({ iverilog: { defines: { WIDTH: 8 } } }).options).toEqual({ iverilog: { defines: {} } });
  });

  it('keeps the first 32 macros', () => {
    const defines = Object.fromEntries(Array.from({ length: 33 }, (_, i) => [`M${i}`, '1']));
    expect(Object.keys(parsed({ iverilog: { defines } }).options?.iverilog?.defines ?? {})).toHaveLength(32);
  });
});

describe('compilerOptions in the project file', () => {
  it('is read with the project', () => {
    expect(parseProject(projectJson([], { version: 2, compilerOptions: EVERY_OPTION })).project.compilerOptions).toEqual(EVERY_OPTION);
  });

  it('is written back when the project is saved, without changing the version', () => {
    const saved = JSON.parse(serializeProject(parseProject(projectJson([], { version: 2, compilerOptions: EVERY_OPTION })).project));
    expect({ version: saved.version, compilerOptions: saved.compilerOptions }).toEqual({ version: 2, compilerOptions: EVERY_OPTION });
  });

  it('is not written for a project that has none', () => {
    expect(serializeProject(parseProject(projectJson([], { version: 2 })).project)).not.toContain('compilerOptions');
  });

  it('turns a problem into a project warning, not a failure to open', () => {
    expect(parseProject(projectJson([], { version: 2, compilerOptions: [] })).warnings).toHaveLength(1);
  });
});
