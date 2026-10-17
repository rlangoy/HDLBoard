// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, test } from 'node:test';
import { gunzipSync } from 'node:zlib';
import { waveArguments } from '../engines/ghdlEngine.js';
import { decodeClientFrame, decodeServerFrame, encodeClientFrame, encodeServerFrame, type ServerFrame } from '../protocol.js';
import { DEFAULT_DUMP_FILE, findOwnDump } from '../verilog/dumpDetection.js';
import { compileArguments } from '../verilog/process.js';
import { batchRunArguments } from '../verilog/run.js';
import { validateSourceName } from '../verilog/fileNames.js';
import { WAVE_MODULE_NAME, waveModuleSource, wavePlusarg } from '../verilog/waveModule.js';
import { isOwnDumpNotice, sizeLimitMessage } from './waveConsole.js';
import { sendWaveFile } from './waveTransfer.js';

const SYSTEM_INSTALL = { iverilog: 'iverilog', vvp: 'vvp' };

describe('WAVE frames', () => {
  test('client frames round-trip', () => {
    for (const text of ['WAVE on', 'WAVE off', 'WAVE-GET 7']) {
      const frame = decodeClientFrame(text);
      assert.ok(!('message' in frame), text);
      assert.equal(encodeClientFrame(frame), text);
    }
    assert.deepEqual(decodeClientFrame('WAVE on'), { verb: 'WAVE', on: true });
  });

  test('bad client frames are refused', () => {
    for (const text of ['WAVE', 'WAVE maybe', 'WAVE-GET', 'WAVE-GET x', 'WAVE-GET -1']) {
      assert.ok('message' in decodeClientFrame(text), text);
    }
  });

  test('server frames round-trip', () => {
    const frames: ServerFrame[] = [
      { verb: 'WAVE-READY', run: 3, format: 'ghw', bytes: 2420, status: 'complete' },
      { verb: 'WAVE-READY', run: 4, format: 'vcd', bytes: 16, status: 'size-limit' },
      { verb: 'WAVE-BEGIN', run: 3, bytes: 2420 },
      { verb: 'WAVE-END', run: 3 },
      { verb: 'WAVE-NONE', run: 2 },
    ];
    for (const frame of frames) assert.deepEqual(decodeServerFrame(encodeServerFrame(frame)), frame);
    assert.ok('message' in decodeServerFrame('WAVE-READY 3 fst 10 complete'));
    assert.ok('message' in decodeServerFrame('WAVE-READY 3 vcd 10 crashed'));
  });
});

describe('GHDL wave arguments', () => {
  test('GHW or VCD, after the entity name, never --vcd-4states', () => {
    assert.deepEqual(waveArguments({ format: 'ghw' }, 'wave-1.ghw'), ['--wave=wave-1.ghw']);
    assert.deepEqual(waveArguments({ format: 'vcd' }, 'wave-2.vcd'), ['--vcd=wave-2.vcd']);
    assert.deepEqual(waveArguments(undefined, 'wave-2.vcd'), []);
  });
});

describe('the Verilog helper module', () => {
  test('dumps the top from a plusarg file name', () => {
    const source = waveModuleSource('counter_tb');
    assert.match(source, /module hdlboard_wave;/);
    assert.match(source, /\$dumpvars\(0, counter_tb\);/);
    assert.match(source, /\$value\$plusargs\("hdlboard_wave=%s", file_name\)/);
    assert.equal(wavePlusarg('wave-3.vcd'), '+hdlboard_wave=wave-3.vcd');
  });

  test('compiled as a second root, its file name reserved', () => {
    const args = compileArguments(SYSTEM_INSTALL, { dir: '.', target: 'tb', files: ['hdlboard_wave.v', 'tb.v'], extraRoots: [WAVE_MODULE_NAME] });
    assert.deepEqual(args.slice(args.indexOf('-s'), args.indexOf('-o')), ['-s', 'tb', '-s', 'hdlboard_wave']);
    assert.equal(validateSourceName('hdlboard_wave.v').ok, false);
    assert.deepEqual(batchRunArguments(SYSTEM_INSTALL, ['+hdlboard_wave=wave-1.vcd']), ['-n', '-i', 'sim.vvp', '+hdlboard_wave=wave-1.vcd']);
  });
});

describe('the student’s own dump', () => {
  test('none', () => {
    assert.deepEqual(findOwnDump(['module t; initial $display("$dumpvars"); endmodule']), { present: false });
    assert.deepEqual(findOwnDump(['// $dumpvars(0, t);\n/* $dumpfile("a.vcd"); */ module t; endmodule']), { present: false });
  });

  test('$dumpvars without $dumpfile writes dump.vcd', () => {
    assert.deepEqual(findOwnDump(['module t; initial if (x) $dumpvars(0, t); endmodule']), { present: true, file: DEFAULT_DUMP_FILE });
  });

  test('a plain $dumpfile name, also in a header', () => {
    assert.deepEqual(findOwnDump(['module t; endmodule', 'initial begin $dumpfile ( "my_wave.vcd" ); $dumpvars; end']), {
      present: true,
      file: 'my_wave.vcd',
    });
  });

  test('a path, another extension or a computed name cannot be offered', () => {
    assert.deepEqual(findOwnDump(['initial $dumpfile("../out/w.vcd");']), { present: true });
    assert.deepEqual(findOwnDump(['initial $dumpfile("w.fst");']), { present: true });
    assert.deepEqual(findOwnDump(['initial $dumpfile(name);']), { present: true });
  });
});

describe('console lines', () => {
  test("Icarus's notice for HDLBoard's own file is recognised", () => {
    assert.equal(isOwnDumpNotice('VCD info: dumpfile wave-7.vcd opened for output.', 'wave-7.vcd'), true);
    assert.equal(isOwnDumpNotice('VCD info: dumpfile mine.vcd opened for output.', 'wave-7.vcd'), false);
  });

  test('the size-limit message explains how to end the testbench', () => {
    assert.match(sizeLimitMessage(16 * 1024 * 1024), /too large \(16 MiB\).*std\.env\.stop/);
  });
});

describe('sendWaveFile', () => {
  const dir = mkdtempSync(join(tmpdir(), 'hdl-wave-test-'));
  const path = join(dir, 'wave-1.vcd');
  const content = Buffer.from(Array.from({ length: 50_000 }, (_, i) => `#${i * 5}\n${i % 2}!\n`).join(''));
  writeFileSync(path, content);

  test('WAVE-BEGIN, gzip in frames no larger than the limit, WAVE-END', async () => {
    const frames: ServerFrame[] = [];
    const chunks: Buffer[] = [];
    await sendWaveFile({ path, run: 1, sink: { send: (f) => frames.push(f), sendBinary: (c) => chunks.push(c) }, isCurrent: () => true, maxFrameBytes: 4096 });
    assert.deepEqual(frames, [
      { verb: 'WAVE-BEGIN', run: 1, bytes: content.length },
      { verb: 'WAVE-END', run: 1 },
    ]);
    assert.ok(chunks.length > 1);
    assert.ok(chunks.every((c) => c.length <= 4096));
    assert.deepEqual(gunzipSync(Buffer.concat(chunks)), content);
  });

  test('a missing file is WAVE-NONE', async () => {
    const frames: ServerFrame[] = [];
    await sendWaveFile({ path: join(dir, 'gone.vcd'), run: 2, sink: { send: (f) => frames.push(f), sendBinary: () => {} }, isCurrent: () => true });
    assert.deepEqual(frames, [{ verb: 'WAVE-NONE', run: 2 }]);
  });

  test('a run that stops being current stops sending', async () => {
    const frames: ServerFrame[] = [];
    let current = true;
    const chunks: Buffer[] = [];
    await sendWaveFile({
      path,
      run: 3,
      sink: { send: (f) => frames.push(f), sendBinary: (c) => { chunks.push(c); current = false; } },
      isCurrent: () => current,
      maxFrameBytes: 1024,
    });
    assert.deepEqual(frames, [{ verb: 'WAVE-BEGIN', run: 3, bytes: content.length }]);
    assert.equal(chunks.length, 1);
    rmSync(dir, { recursive: true, force: true });
  });
});
