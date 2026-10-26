// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * Reading one board out of a board file, field by field. A board stops at its first
 * problem (docs/board_io_v2_spec.md § 3.4), so the readers throw a `BoardProblem` and
 * `checkBoard` turns it into a value at the board's edge. Nothing outside the parser
 * sees an exception.
 */

import { isObject } from '../project/jsonValue';
import { portNameProblem } from './boardNames';
import type { CountLimit } from './boardLimits';

/** A value, or why there is none — the first problem found. */
export interface BoardIssue {
  readonly path: string;
  readonly message: string;
}
export type Checked<T> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly problem: string; readonly path: string };

export const valid = <T>(value: T): Checked<T> => ({ ok: true, value });
export const invalid = (problem: string, path = ''): Checked<never> => ({ ok: false, problem, path });
export const quoted = (value: unknown): string => JSON.stringify(value);

class BoardProblem extends Error {
  constructor(message: string, readonly path: string) {
    super(message);
  }
}

/** Stops reading this board: `problem` is what the warning says. */
export function fail(problem: string, path = ''): never {
  throw new BoardProblem(problem, path.replace(/\[(\d+)\]/g, '.$1'));
}

/** Runs a reader, turning the first problem it meets into an invalid result. */
export function checkBoard<T>(read: () => T): Checked<T> {
  try {
    return valid(read());
  } catch (error) {
    if (error instanceof BoardProblem) return invalid(error.message, error.path);
    throw error;
  }
}

/** What an object at `path` may hold, for its unknown-key message. */
export interface ObjectFields {
  readonly required: readonly string[];
  readonly optional?: readonly string[];
  /** `role` for `ports`, `field` elsewhere: `ports.buttons is not a role`. */
  readonly noun?: string;
}

/** The object at `path`, with no key it may not have and every key it must. */
export function objectAt(path: string, value: unknown, fields: ObjectFields): Record<string, unknown> {
  if (!isObject(value)) fail(`${path} must be an object`, path);
  const allowed = [...fields.required, ...(fields.optional ?? [])];
  const noun = fields.noun ?? 'field';
  const unknownKey = Object.keys(value).find((key) => !allowed.includes(key));
  if (unknownKey !== undefined) fail(`${path}.${unknownKey} is not a ${noun} (the ${noun}s are ${allowed.join(', ')})`, `${path}.${unknownKey}`);
  const missing = fields.required.find((key) => value[key] === undefined);
  if (missing !== undefined) fail(`${path}.${missing} is missing`, `${path}.${missing}`);
  return value;
}

/** A port name: a plain identifier valid in both languages. */
export function nameAt(path: string, value: unknown): string {
  if (typeof value !== 'string') fail(`${path} must be a string (one port name)`, path);
  const problem = portNameProblem(value);
  if (problem !== undefined) fail(`${path} ${quoted(value)} ${problem}`, path);
  return value;
}

/** A list of port names, as many as `limit` allows. */
export function namesAt(path: string, value: unknown, limit: CountLimit): string[] {
  if (!Array.isArray(value)) fail(`${path} must be an array of port names`, path);
  checkWithin(path, { amount: value.length, text: `${value.length} names` }, limit);
  return value.map((name, index) => nameAt(`${path}[${index}]`, name));
}

/** A whole number within `limit`. */
export function countAt(path: string, value: unknown, limit: CountLimit): number {
  if (typeof value !== 'number' || !Number.isInteger(value)) fail(`${path} must be a whole number`, path);
  checkWithin(path, { amount: value, text: `${value}` }, limit);
  return value;
}

/** An amount, and how a message writes it: `9 names`, `20`. */
interface Counted {
  readonly amount: number;
  readonly text: string;
}

function checkWithin(path: string, { amount, text }: Counted, limit: CountLimit): void {
  if (amount > limit.max) fail(`${path}: ${text} is above the limit of ${limit.max}`, path);
  if (amount < limit.min) fail(`${path}: ${text} is below the minimum of ${limit.min}`, path);
}

/** A boolean, or `fallback` when it is left out. */
export function booleanAt(path: string, value: unknown, fallback: boolean): boolean {
  if (value === undefined) return fallback;
  if (typeof value !== 'boolean') fail(`${path} must be true or false`, path);
  return value;
}
