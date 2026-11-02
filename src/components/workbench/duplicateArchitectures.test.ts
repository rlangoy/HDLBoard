// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import { describe, expect, test } from 'vitest';
import { adviseDiagnostics, adviseLogDiagnostics } from './diagnosticAdvice';
import { locateDiagnostics, type RunSnapshot } from './diagnosticLocation';
import { parseDiagnostics } from './diagnostics';
import { duplicateArchitectureWarnings } from './duplicateArchitectures';

const ENTITY = 'entity DE1_SoC is\n  port (SW : in bit_vector(9 downto 0); LEDR : out bit_vector(9 downto 0));\nend entity;\n';
const AND_GATE = 'architecture rtl of DE1_SoC is\nbegin\n  LEDR(0) <= SW(0) and SW(1);\nend architecture rtl;\n';
const PASS_THROUGH = 'architecture rtl of DE1_SoC is\nbegin\n  LEDR <= SW;\nend architecture;\n';

function snapshot(...files: [name: string, content: string][]): RunSnapshot {
  return { files: files.map(([name, content]) => ({ id: name, name, content })) };
}

describe('duplicateArchitectureWarnings', () => {
  test('two rtl of DE1_SoC in one file: a warning on the second, naming the first line', () => {
    const run = snapshot(['DE1_SoC.vhdl', `${ENTITY}\n${AND_GATE}\n${PASS_THROUGH}`]);
    expect(duplicateArchitectureWarnings(run)).toEqual([
      'DE1_SoC.vhdl:10:1:warning: architecture "rtl" of "DE1_SoC" is already defined on line 5, and this one replaces it – give each architecture its own name.',
    ]);
  });

  test('in two files: names the other file', () => {
    const run = snapshot(['DE1_SoC.vhdl', `${ENTITY}${AND_GATE}`], ['copy.vhd', PASS_THROUGH]);
    expect(duplicateArchitectureWarnings(run)).toEqual([
      'copy.vhd:1:1:warning: architecture "rtl" of "DE1_SoC" is already defined in DE1_SoC.vhdl (line 4), and only one of them is used – give each architecture its own name.',
    ]);
  });

  test('names are compared without case', () => {
    const run = snapshot(['a.vhd', `${AND_GATE}${PASS_THROUGH.replace('rtl of DE1_SoC', 'RTL of de1_soc')}`]);
    expect(duplicateArchitectureWarnings(run)).toHaveLength(1);
  });

  test('different names are fine', () => {
    const run = snapshot(['a.vhd', `${AND_GATE}${PASS_THROUGH.replace('rtl', 'pass')}`]);
    expect(duplicateArchitectureWarnings(run)).toEqual([]);
  });

  test('the same name for two entities is fine', () => {
    const run = snapshot(['a.vhd', `${AND_GATE}${PASS_THROUGH.replace('DE1_SoC', 'other')}`]);
    expect(duplicateArchitectureWarnings(run)).toEqual([]);
  });

  test('Verilog files are not read', () => {
    expect(duplicateArchitectureWarnings(snapshot(['a.v', `${AND_GATE}${PASS_THROUGH}`]))).toEqual([]);
  });

  test('the warning marks the line in the code window, as a GHDL warning would', () => {
    const run = snapshot(['DE1_SoC.vhdl', `${ENTITY}\n${AND_GATE}\n${PASS_THROUGH}`]);
    const [warning] = duplicateArchitectureWarnings(run);
    const [marked] = adviseLogDiagnostics(locateDiagnostics(parseDiagnostics(warning), run, run.files), run);
    expect(marked).toMatchObject({ fileId: 'DE1_SoC.vhdl', line: 10, severity: 'warning' });
  });
});

describe('GHDL’s own warning about the same pair, in a failed run', () => {
  const content = `${ENTITY}\n${AND_GATE}\n${PASS_THROUGH}`;
  const run = snapshot(['DE1_SoC.vhdl', content]);
  const ghdlOutput = [
    'DE1_SoC.vhdl:10:1:warning: redefinition of a library unit in same design file: [-Wlibrary]',
    'DE1_SoC.vhdl:10:1:warning: architecture "rtl" of "DE1_SoC" defined at line 5:14 is now architecture "rtl" of "DE1_SoC" [-Wlibrary]',
    'DE1_SoC.vhdl:3:1:warning: redefinition of a library unit in same design file: [-Wlibrary]',
  ].join('\n');
  const advised = adviseDiagnostics(locateDiagnostics(parseDiagnostics(ghdlOutput), run, run.files), run);

  test('is quiet: HDLBoard’s warning says it on that line', () => {
    expect(advised.slice(0, 2).map((d) => d.quiet)).toEqual([true, true]);
  });

  test('a redefinition of something else stays', () => {
    expect(advised[2].quiet).toBeUndefined();
  });
});
