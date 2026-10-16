// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * The PLUGIN server frame (docs/plugin_batch_implementation_plan.md § 3.3, § 6.3):
 *
 *   PLUGIN <kind> <instance> <t_ns>\n<payload>
 *
 * The same rule as server/src/pluginLine.ts, which this package cannot import; both
 * read tests/fixtures/plugins/pluginFrames.json, so the two cannot drift. Pure.
 */

export interface PluginLine {
  /** Plugin type, e.g. `uart`. */
  readonly kind: string;
  /** Instance name from the plugin's `name` generic, e.g. `TX`. */
  readonly instance: string;
  /** Simulated time since the start of the run, integer nanoseconds. */
  readonly timeNs: number;
  /** Printable ASCII, at most `MAX_PAYLOAD_LENGTH` characters; may be empty. */
  readonly payload: string;
}

/** Longest payload, in characters. */
export const MAX_PAYLOAD_LENGTH = 200;

const NAME = '[A-Za-z_][A-Za-z0-9_]*';
/** At most 16 digits, then checked with Number.isSafeInteger. */
const TIME = '\\d{1,16}';
const FRAME_HEAD = new RegExp(`^(${NAME}) (${NAME}) (${TIME})$`);
const FRAME_BODY = new RegExp(`^[\\x20-\\x7e]{0,${MAX_PAYLOAD_LENGTH}}$`);

/** `inline` and `body` as `handleFrame` splits them; `undefined` for a frame that breaks the rule. */
export function decodePluginFrame(inline: string, body: string): PluginLine | undefined {
  const header = FRAME_HEAD.exec(inline);
  if (!header || !FRAME_BODY.test(body)) return undefined;
  const [, kind, instance, time] = header;
  const timeNs = Number(time);
  return Number.isSafeInteger(timeNs) ? { kind, instance, timeNs, payload: body } : undefined;
}

/** The line as `hdlb_emit` printed it, for copying into a bug report or a test fixture. */
export function hdlbLine({ kind, instance, timeNs, payload }: PluginLine): string {
  return `@@HDLB ${kind} ${instance} ${timeNs} ${payload}`;
}
