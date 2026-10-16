// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * PROPOSAL - not wired in. Server side of the batch plugin
 * (../../plugin_batch_implementation_plan.md, "Server changes").
 * Intended home: server/src/pluginLine.ts, used by Session.forwardOutputLine
 * and by protocol.ts for the new PLUGIN frame.
 *
 * A plugin line on the simulator's stdout:
 *
 *   @@HDLB <kind> <instance> <t_ns> <payload>
 *
 * The server checks only the header. The payload is passed on untouched and
 * interpreted by the GUI widget for <kind>, so a new plugin type needs no
 * server change. Pure.
 */

export const HDLB_PREFIX = '@@HDLB ';

export interface PluginLine {
  /** Plugin type; selects the GUI widget, e.g. `uart`. */
  readonly kind: string;
  /** Instance name from the plugin's `name` generic; one GUI tab each, e.g. `TX`. */
  readonly instance: string;
  /** Simulated time since the start of the run (VHDL `now`), integer nanoseconds. */
  readonly timeNs: number;
  /** Everything after the timestamp; may be empty. */
  readonly payload: string;
}

const NAME = '[A-Za-z_][A-Za-z0-9_]*';
/** At most 16 digits, then checked with Number.isSafeInteger (2**53 ns = 104 days). */
const TIME = '\\d{1,16}';
const LINE = new RegExp(`^@@HDLB (${NAME}) (${NAME}) (${TIME})(?: (.*))?$`);
const FRAME_HEAD = new RegExp(`^(${NAME}) (${NAME}) (${TIME})$`);

function toPluginLine(kind: string, instance: string, time: string, payload: string): PluginLine | undefined {
  const timeNs = Number(time);
  return Number.isSafeInteger(timeNs) ? { kind, instance, timeNs, payload } : undefined;
}

/** The plugin line in `line`, or `undefined` if it is not one (or its header is malformed). */
export function parsePluginLine(line: string): PluginLine | undefined {
  if (!line.startsWith(HDLB_PREFIX)) return undefined;
  const m = LINE.exec(line);
  return m ? toPluginLine(m[1], m[2], m[3], m[4] ?? '') : undefined;
}

export type OutputRoute =
  | { readonly to: 'plugin'; readonly line: PluginLine }
  | { readonly to: 'log'; readonly text: string };

/**
 * Where one stdout line goes. A line that starts with @@HDLB but has a malformed
 * header goes to the console like any other output, so nothing disappears.
 */
export function routeOutputLine(text: string): OutputRoute {
  const line = parsePluginLine(text);
  return line ? { to: 'plugin', line } : { to: 'log', text };
}

/**
 * The PLUGIN server frame. Mirrors LOG: the header on the first line, the
 * free-form payload as the body.
 *
 *   PLUGIN <kind> <instance> <t_ns>\n<payload>
 */
export function encodePluginFrame(line: PluginLine): string {
  return `PLUGIN ${line.kind} ${line.instance} ${line.timeNs}\n${line.payload}`;
}

/** `inline`/`body` as `decodeServerFrame` splits them (text after `PLUGIN `, text after the first newline). */
export function decodePluginFrame(inline: string, body: string): PluginLine | { message: string } {
  const m = FRAME_HEAD.exec(inline);
  const line = m ? toPluginLine(m[1], m[2], m[3], body) : undefined;
  return line ?? { message: `PLUGIN requires "<kind> <instance> <t_ns>", got: ${JSON.stringify(inline)}` };
}
