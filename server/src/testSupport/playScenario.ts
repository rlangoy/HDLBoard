// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * Plays a scenario's steps against a running board session: apply the stimulus,
 * then require the board to reach the expected state — within the step's timing
 * window when it has one. The same player serves the GHDL characterization tests
 * and every later Verilog and parity test, so all of them read expected behaviour
 * from `scenarios.json` and nowhere else.
 */

import assert from 'node:assert/strict';
import { matchesExpectation, type BoardState } from './boardState.js';
import type { ScenarioStep } from './scenarios.js';
import type { WsTestClient } from './WsTestClient.js';

const DEFAULT_STEP_TIMEOUT_MS = 8_000;

function timeoutFor(step: ScenarioStep): number {
  return step.withinMs ? step.withinMs[1] : DEFAULT_STEP_TIMEOUT_MS;
}

function assertNotTooEarly(step: ScenarioStep, elapsedMs: number): void {
  if (!step.withinMs) return;
  const [earliestMs] = step.withinMs;
  assert.ok(elapsedMs >= earliestMs, `step "${step.name}": the state appeared after ${elapsedMs} ms, before the expected ${earliestMs} ms`);
}

async function playStep(client: WsTestClient, step: ScenarioStep): Promise<void> {
  if (step.sw !== undefined && step.key !== undefined) client.stim(step.sw + step.key);
  try {
    const elapsedMs = await client.untilState((state) => matchesExpectation(state, step.expect), timeoutFor(step));
    assertNotTooEarly(step, elapsedMs);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(`step "${step.name}": ${reason}`);
  }
}

/** Plays every step and returns the board as it stood when each one was satisfied — what parity tests compare. */
export async function playBoardScenario(client: WsTestClient, steps: readonly ScenarioStep[]): Promise<BoardState[]> {
  const reached: BoardState[] = [];
  for (const step of steps) {
    await playStep(client, step);
    const state = client.latestBoardState();
    if (state) reached.push(state);
  }
  return reached;
}
