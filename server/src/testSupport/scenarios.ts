// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * The scenario file: expected board behaviour of every shared fixture, in both
 * languages (docs/Verilog_implementation_plan.md § 7.3). Every test tier reads
 * expected values from here and nowhere else.
 *
 * `validateScenarios` returns problems as text rather than throwing, so a test can
 * assert on exactly what is wrong; `loadScenarios` throws with the whole list.
 */

import { readFileSync } from 'node:fs';
import { scenarioFilePath, type FixtureLanguage } from './fixture.js';

export type ScenarioMode = 'board' | 'batch';

export interface ExpectedBoard {
  /** LEDR9..LEDR0. */
  readonly ledr?: string;
  /** `'blank'`, or six 7-bit patterns concatenated (HEX0 first). */
  readonly hex?: string;
}

export interface ScenarioStep {
  readonly name: string;
  /** SW9..SW0, applied with `key` as one STIM. Omitted: no new stimulus. */
  readonly sw?: string;
  /** KEY3..KEY0. */
  readonly key?: string;
  readonly expect: ExpectedBoard;
  /** Real milliseconds after the previous step in which the state must appear. */
  readonly withinMs?: readonly [number, number];
}

export interface Fixture {
  readonly id: string;
  readonly mode: ScenarioMode;
  readonly top: string;
  readonly files: Partial<Record<FixtureLanguage, string>>;
  /** Extra files a language's top file needs (a batch testbench needs its design). */
  readonly companions?: Partial<Record<FixtureLanguage, readonly string[]>>;
  readonly steps?: readonly ScenarioStep[];
  readonly expectOutput?: readonly string[];
}

export interface ScenarioFile {
  readonly version: number;
  readonly fixtures: readonly Fixture[];
}

const MODES: readonly string[] = ['board', 'batch'];
const SWITCH_BITS = 10;
const KEY_BITS = 4;
const HEX_DISPLAY_COUNT = 6;
const SEGMENTS_PER_DISPLAY = 7;

export const LED_BITS = 10;
export const HEX_BITS = HEX_DISPLAY_COUNT * SEGMENTS_PER_DISPLAY;
/** In a scenario's `hex`: all six displays off. */
export const BLANK_DISPLAYS = 'blank';

type Record_ = Record<string, unknown>;

function isRecord(value: unknown): value is Record_ {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isBitString(value: unknown, width: number): boolean {
  return typeof value === 'string' && new RegExp(`^[01]{${width}}$`).test(value);
}

function checkOptionalBits(value: unknown, width: number, path: string): string[] {
  if (value === undefined || isBitString(value, width)) return [];
  return [`${path} must be ${width} bits of 0/1`];
}

function validateExpect(expect: unknown, where: string): string[] {
  if (!isRecord(expect)) return [`${where}.expect must be an object`];
  const problems = checkOptionalBits(expect.ledr, LED_BITS, `${where}.expect.ledr`);
  const hexOk = expect.hex === undefined || expect.hex === BLANK_DISPLAYS || isBitString(expect.hex, HEX_BITS);
  if (!hexOk) problems.push(`${where}.expect.hex must be "${BLANK_DISPLAYS}" or ${HEX_BITS} bits`);
  return problems;
}

function validateWindow(window: unknown, where: string): string[] {
  if (window === undefined) return [];
  const isOrderedPair =
    Array.isArray(window) && window.length === 2 && window.every((n) => typeof n === 'number') && window[0] <= window[1];
  return isOrderedPair ? [] : [`${where}.withinMs must be [min, max] with min <= max`];
}

/** One STIM carries switches and keys together, so a step gives both or neither. */
function validateStimulus(step: Record_, where: string): string[] {
  if ((step.sw === undefined) !== (step.key === undefined)) {
    return [`${where}: sw and key must be given together (one STIM carries both)`];
  }
  return [
    ...checkOptionalBits(step.sw, SWITCH_BITS, `${where}.sw`),
    ...checkOptionalBits(step.key, KEY_BITS, `${where}.key`),
  ];
}

function validateStep(step: unknown, index: number): string[] {
  const where = `steps[${index}]`;
  if (!isRecord(step)) return [`${where} must be an object`];
  return [
    ...validateStimulus(step, where),
    ...validateExpect(step.expect, where),
    ...validateWindow(step.withinMs, where),
  ];
}

function validateSteps(steps: unknown): string[] {
  if (!Array.isArray(steps) || steps.length === 0) return ['a board fixture needs "steps" (a non-empty array)'];
  return steps.flatMap(validateStep);
}

function validateExpectOutput(output: unknown): string[] {
  const isNonEmptyStrings = Array.isArray(output) && output.length > 0 && output.every((s) => typeof s === 'string');
  return isNonEmptyStrings ? [] : ['a batch fixture needs "expectOutput" (a non-empty array of strings)'];
}

function validateHeader(fixture: Record_): string[] {
  const problems: string[] = [];
  if (!MODES.includes(String(fixture.mode))) problems.push(`mode must be one of ${MODES.join(', ')}`);
  if (typeof fixture.top !== 'string') problems.push('top must be a string');
  if (!isRecord(fixture.files) || Object.keys(fixture.files).length === 0) problems.push('files must name at least one file');
  return problems;
}

function validateBody(fixture: Record_): string[] {
  if (fixture.mode === 'board') return validateSteps(fixture.steps);
  if (fixture.mode === 'batch') return validateExpectOutput(fixture.expectOutput);
  return []; // an unknown mode is already reported by validateHeader
}

function validateFixture(fixture: unknown, index: number): string[] {
  if (!isRecord(fixture)) return [`fixtures[${index}] must be an object`];
  const label = typeof fixture.id === 'string' ? fixture.id : `fixtures[${index}]`;
  return [...validateHeader(fixture), ...validateBody(fixture)].map((problem) => `${label}: ${problem}`);
}

/** Every schema problem in a parsed scenario file; empty when it is valid. */
export function validateScenarios(value: unknown): string[] {
  if (!isRecord(value) || !Array.isArray(value.fixtures)) {
    return ['the scenario file must be an object with a "fixtures" array'];
  }
  return value.fixtures.flatMap(validateFixture);
}

export function loadScenarios(): ScenarioFile {
  const parsed: unknown = JSON.parse(readFileSync(scenarioFilePath(), 'utf8'));
  const problems = validateScenarios(parsed);
  if (problems.length > 0) throw new Error(`scenarios.json is invalid:\n  ${problems.join('\n  ')}`);
  return parsed as ScenarioFile; // shape checked by validateScenarios above
}
