// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { readFixture } from '../testSupport/fixture.js';
import { findLegacyPackageUses, LEGACY_PACKAGES, legacyPackageWarning } from './legacyPackages.js';

const usesIn = (content: string) => findLegacyPackageUses([{ name: 'top.vhd', content }]);
const packagesIn = (content: string) => usesIn(content).map((use) => use.packageName);

describe('findLegacyPackageUses (issue #37)', () => {
  for (const name of LEGACY_PACKAGES) {
    test(`finds a use clause of IEEE.${name}`, () => {
      assert.deepEqual(packagesIn(`library ieee;\nuse ieee.${name}.all;\n`), [name]);
    });
  }

  test('finds a fully qualified name', () => {
    assert.deepEqual(packagesIn('v := IEEE.std_logic_arith.conv_std_logic_vector(42, 8);'), ['std_logic_arith']);
  });

  test('ignores case', () => {
    assert.deepEqual(packagesIn('use Ieee.STD_LOGIC_UNSIGNED.all;'), ['std_logic_unsigned']);
  });

  test('finds a reference written over several lines', () => {
    assert.deepEqual(packagesIn('use ieee\n  .\n  std_logic_signed.all;'), ['std_logic_signed']);
  });

  test('ignores a reference in a comment', () => {
    assert.deepEqual(packagesIn('-- use ieee.std_logic_arith.all;\n/* ieee.std_logic_signed */'), []);
  });

  test('ignores a reference in a string', () => {
    assert.deepEqual(packagesIn('report "ieee.std_logic_unsigned is legacy";'), []);
  });

  test('ignores the standard packages', () => {
    assert.deepEqual(packagesIn('use ieee.std_logic_1164.all;\nuse ieee.numeric_std.all;\nuse ieee.numeric_bit.all;'), []);
  });

  test('ignores a longer package name that starts like a legacy one', () => {
    assert.deepEqual(packagesIn('use work.std_logic_arith_ext.all;\nuse ieee.std_logic_arith_ext.all;'), []);
  });

  test('reports each package once per file, at its first reference', () => {
    assert.deepEqual(packagesIn('use ieee.std_logic_arith.all;\nx := ieee.std_logic_arith.conv_integer(v);'), ['std_logic_arith']);
  });

  test('reports the same package again in another file', () => {
    const files = ['a.vhd', 'b.vhd'].map((name) => ({ name, content: 'use ieee.std_logic_arith.all;' }));
    assert.deepEqual(findLegacyPackageUses(files).map((use) => use.fileName), ['a.vhd', 'b.vhd']);
  });

  test('places a use at the package name, where GHDL places its own error (tb_libraries.vhd:14:10)', () => {
    const [first] = findLegacyPackageUses([{ name: 'tb_libraries.vhd', content: readFixture('vhdl', 'tb_libraries.vhd') }]);
    assert.deepEqual(first, { fileName: 'tb_libraries.vhd', packageName: 'std_logic_arith', line: 14, column: 10 });
  });

  test('finds all three packages in the issue’s test file, in order', () => {
    assert.deepEqual(packagesIn(readFixture('vhdl', 'tb_libraries.vhd')), [...LEGACY_PACKAGES]);
  });
});

describe('legacyPackageWarning', () => {
  test('is a GHDL-shaped warning, so the editor marks the line', () => {
    const warning = legacyPackageWarning({ fileName: 'top.vhd', packageName: 'std_logic_arith', line: 4, column: 10 });
    assert.match(warning, /^top\.vhd:4:10:warning: Legacy Synopsys package detected: IEEE\.std_logic_arith\. /);
  });

  test('says the compatibility option is on, and what to use instead', () => {
    const warning = legacyPackageWarning({ fileName: 'top.vhd', packageName: 'std_logic_signed', line: 1, column: 1 });
    assert.match(warning, /Synopsys compatibility \(-fsynopsys\) has been enabled for this simulation\. For new designs, prefer IEEE\.numeric_std/);
  });
});
