// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { createPluginOutput, type OutputDecision, type PluginLimits } from './pluginOutput.js';

const SMALL_LIMITS: PluginLimits = { perSecond: 3, perRun: 5 };

function outputWithClock(disabledKinds: ReadonlySet<string> = new Set(), limits: PluginLimits = SMALL_LIMITS) {
  const clock = { ms: 0 };
  return { clock, output: createPluginOutput({ now: () => clock.ms, disabledKinds, limits }) };
}

const uartLine = (index: number) => `@@HDLB uart TX ${index} 48`;

const offer = (output: ReturnType<typeof createPluginOutput>, count: number): OutputDecision[] =>
  Array.from({ length: count }, (_, index) => output.accept(uartLine(index)));

const sentToPlugin = (decisions: readonly OutputDecision[]) => decisions.filter((d) => d.to === 'plugin').length;

describe('createPluginOutput', () => {
  test('PO-1: a plugin line goes to the plugin path', () => {
    const { output } = outputWithClock();
    assert.deepEqual(output.accept('@@HDLB uart TX 83495 48'), {
      to: 'plugin',
      line: { kind: 'uart', instance: 'TX', timeNs: 83495, payload: '48' },
    });
  });

  test('PO-2: ordinary output and a malformed plugin line go to the console', () => {
    const { output } = outputWithClock();
    assert.deepEqual(output.accept('tb.vhd:27:5:@1us:(report note): hi'), { to: 'log', text: 'tb.vhd:27:5:@1us:(report note): hi' });
    assert.deepEqual(output.accept('@@HDLB uart TX'), { to: 'log', text: '@@HDLB uart TX' });
  });

  test('PO-3: a line of a disabled kind goes to the console', () => {
    const { output } = outputWithClock(new Set(['uart']));
    assert.equal(output.accept(uartLine(1)).to, 'log');
  });

  test('PO-4: lines over the rate limit are dropped and summarised when the window ends', () => {
    const { clock, output } = outputWithClock();
    assert.equal(sentToPlugin(offer(output, 4)), 3);
    assert.deepEqual(output.flush(), []);
    clock.ms = 1000;
    assert.deepEqual(output.flush(), ['… 1 plugin line not shown (plugin limit: 3 lines/s)']);
  });

  test('PO-5: a window that ends while lines arrive keeps its summary for the next flush', () => {
    const { clock, output } = outputWithClock(new Set(), { perSecond: 2, perRun: 100 });
    offer(output, 4);
    clock.ms = 1000;
    assert.equal(sentToPlugin(offer(output, 1)), 1);
    assert.deepEqual(output.flush(), ['… 2 plugin lines not shown (plugin limit: 2 lines/s)']);
  });

  test('PO-6: lines over the per-run cap are dropped and summarised at the end of the run', () => {
    const { clock, output } = outputWithClock();
    let sent = 0;
    for (let second = 0; second < 3; second++) {
      clock.ms = second * 1000;
      sent += sentToPlugin(offer(output, 3));
    }
    assert.equal(sent, 5);
    assert.deepEqual(output.finish(), ['… 4 plugin lines not shown (plugin limit: 5 lines per run)']);
  });

  test('PO-7: finish reports a window still in progress', () => {
    const { output } = outputWithClock();
    offer(output, 4);
    assert.deepEqual(output.finish(), ['… 1 plugin line not shown (plugin limit: 3 lines/s)']);
  });

  test('PO-8: console output never counts against the plugin budget', () => {
    const { output } = outputWithClock();
    for (let i = 0; i < 10; i++) output.accept(`report ${i}`);
    assert.equal(sentToPlugin(offer(output, 3)), 3);
    assert.deepEqual(output.finish(), []);
  });
});
