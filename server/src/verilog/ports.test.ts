// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { readFixture } from '../testSupport/fixture.js';
import { boardPortSpellings, chooseTopModule, isBoardDesign, moduleNames, parseStubPorts, type Port } from './ports.js';

describe('moduleNames', () => {
  test('finds a module declaration', () => {
    assert.deepEqual(moduleNames('module A(input a, output b); endmodule'), ['A']);
  });

  test('finds module and macromodule declarations, in source order', () => {
    assert.deepEqual(moduleNames('macromodule B; endmodule\nmodule A; endmodule'), ['B', 'A']);
  });

  test('finds every module in a file that holds several', () => {
    const source = 'module helper; endmodule\nmodule top; helper h(); endmodule';
    assert.deepEqual(moduleNames(source), ['helper', 'top']);
  });

  test('returns nothing for a file with no module', () => {
    assert.deepEqual(moduleNames('`define WIDTH 8\n'), []);
  });

  test('does not mistake endmodule for a declaration', () => {
    assert.deepEqual(moduleNames('module A; endmodule endmodule'), ['A']);
  });

  test('accepts underscores, digits and dollar signs in names', () => {
    assert.deepEqual(moduleNames('module _top_2$x ; endmodule'), ['_top_2$x']);
  });

  test('ignores a module named inside a line comment', () => {
    assert.deepEqual(moduleNames('// module fake(input x);\nmodule real_one; endmodule'), ['real_one']);
  });

  test('ignores a module named inside a block comment', () => {
    assert.deepEqual(moduleNames('/* module fake;\n module fake2; */ module real_one; endmodule'), ['real_one']);
  });

  test('ignores a module named inside a string literal', () => {
    assert.deepEqual(moduleNames('module A; initial $display("module fake;"); endmodule'), ['A']);
  });

  test('does not let a comment marker inside a string swallow the next line', () => {
    assert.deepEqual(moduleNames('module A; initial $display("http://x"); endmodule\nmodule B; endmodule'), ['A', 'B']);
  });

  test('treats an unterminated block comment as hiding the rest of the file, as the compiler does', () => {
    assert.deepEqual(moduleNames('module A; endmodule\n/* module hidden;'), ['A']);
  });
});

const stub = (name: string) => readFixture('stub', name);
const byName = (ports: readonly Port[]) => [...ports].sort((a, b) => a.name.localeCompare(b.name));

function portsOf(stubText: string, top: string): Port[] {
  const result = parseStubPorts(stubText, top);
  assert.ok(result.ok, result.ok ? '' : result.reason);
  return byName(result.ports);
}

const TRICKY_PORTS: Port[] = [
  { name: 'CLOCK_50', direction: 'input', width: 1 },
  { name: 'KEY_N', direction: 'input', width: 4 },
  { name: 'LEDR', direction: 'output', width: 10 },
  { name: 'SW', direction: 'input', width: 10 },
];

describe('parseStubPorts', () => {
  test('reads the direction, width and spelling of every port of a board design', () => {
    const ports = portsOf(stub('simple13.stub'), 'DE1_SoC');
    assert.equal(ports.length, 10);
    assert.deepEqual(ports.find((p) => p.name === 'SW'), { name: 'SW', direction: 'input', width: 10 });
    assert.deepEqual(ports.find((p) => p.name === 'HEX3_N'), { name: 'HEX3_N', direction: 'output', width: 7 });
    assert.deepEqual(ports.find((p) => p.name === 'CLOCK_50'), { name: 'CLOCK_50', direction: 'input', width: 1 });
  });

  test('reports exactly the ports that exist after preprocessing (Icarus 13.0)', () => {
    // The source has an `ifdef'd-out port, macro-sized widths, a generate loop,
    // a parameter list and an attribute — all resolved by Icarus, not by us.
    assert.deepEqual(portsOf(stub('tricky13.stub'), 'top_ifdef'), TRICKY_PORTS);
  });

  test('reports the same ports from Icarus 12.0', () => {
    assert.deepEqual(portsOf(stub('tricky12.stub'), 'top_ifdef'), TRICKY_PORTS);
  });

  test('does not report ports of the child scopes that follow the top', () => {
    const names = portsOf(stub('tricky13.stub'), 'top_ifdef').map((port) => port.name);
    assert.ok(!names.includes('NEVER_PORT'));
    assert.equal(names.length, TRICKY_PORTS.length);
  });

  test('returns only the requested top when the stub holds several root modules', () => {
    const text = stub('tworoots13.stub');
    assert.deepEqual(portsOf(text, 'alpha').map((p) => p.name), ['a', 'y']);
    assert.deepEqual(portsOf(text, 'beta'), [
      { name: 'b', direction: 'input', width: 4 },
      { name: 'z', direction: 'output', width: 4 },
    ]);
  });

  test('returns no ports for a module that has none, such as a testbench', () => {
    assert.deepEqual(portsOf(stub('portless13.stub'), 'tb_counter8'), []);
  });

  test('reads Windows line endings the same as Unix ones', () => {
    const crlf = stub('simple13.stub').replace(/\n/g, '\r\n');
    assert.deepEqual(portsOf(crlf, 'DE1_SoC'), portsOf(stub('simple13.stub'), 'DE1_SoC'));
  });

  test('fails, naming the module, when the stub has no scope for it', () => {
    const result = parseStubPorts(stub('simple13.stub'), 'NoSuchModule');
    assert.deepEqual(result.ok, false);
    assert.match(result.ok ? '' : result.reason, /NoSuchModule/);
  });

  test('fails, without throwing, for text that is not stub output', () => {
    const result = parseStubPorts('module A; endmodule', 'A');
    assert.deepEqual(result.ok, false);
    assert.match(result.ok ? '' : result.reason, /-tstub/);
  });
});

const port = (name: string, direction: Port['direction'] = 'input', width = 1): Port => ({ name, direction, width });

describe('board detection', () => {
  test('recognises a design that declares board ports', () => {
    assert.equal(isBoardDesign([port('SW', 'input', 10), port('LEDR', 'output', 10)]), true);
  });

  test('matches board port names case-insensitively', () => {
    assert.equal(isBoardDesign([port('Clock_50')]), true);
    assert.equal(isBoardDesign([port('key_n', 'input', 4)]), true);
  });

  test('does not take a testbench with an output of its own for a board design', () => {
    assert.equal(isBoardDesign([port('done', 'output')]), false);
  });

  test('does not take a design with no ports for a board design', () => {
    assert.equal(isBoardDesign([]), false);
  });

  test('does not treat the VHDL-only legacy rst port as a board port', () => {
    assert.equal(isBoardDesign([port('rst')]), false);
  });

  test('maps each board port to the spelling the design declared', () => {
    const spellings = boardPortSpellings([port('Clock_50'), port('done', 'output'), port('LEDR', 'output', 10)]);
    assert.deepEqual([...spellings.entries()].sort(), [['clock_50', 'Clock_50'], ['ledr', 'LEDR']]);
  });
});

describe('chooseTopModule', () => {
  test('takes the only module in the top file, whatever it is called', () => {
    assert.deepEqual(chooseTopModule('keyCouter2Led.v', ['counter8']), { ok: true, name: 'counter8' });
  });

  test('takes the module named like the file when the file declares several', () => {
    assert.deepEqual(chooseTopModule('blink.v', ['counter', 'blink']), { ok: true, name: 'blink' });
  });

  test('compares the file name and the module name case-insensitively', () => {
    assert.deepEqual(chooseTopModule('Blink.v', ['helper', 'BLINK']), { ok: true, name: 'BLINK' });
  });

  test('fails, listing the candidates and the fix, when none is named like the file', () => {
    const result = chooseTopModule('blink.v', ['counter', 'blink_top']);
    assert.equal(result.ok, false);
    const reason = result.ok ? '' : result.reason;
    assert.match(reason, /blink\.v declares 2 modules \(counter, blink_top\)/);
    assert.match(reason, /Name the top module after its file/);
  });

  test('fails, naming the file, when the top file declares no module', () => {
    const result = chooseTopModule('empty.v', []);
    assert.equal(result.ok, false);
    assert.match(result.ok ? '' : result.reason, /empty\.v declares no module/);
  });

  test('removes only the extension from the file name before comparing', () => {
    assert.deepEqual(chooseTopModule('blink_top.v', ['blink', 'blink_top']), { ok: true, name: 'blink_top' });
  });
});
