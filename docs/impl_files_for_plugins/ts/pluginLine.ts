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
 *
 * The payload is printable ASCII (0x20..0x7E) and at most MAX_PAYLOAD_LENGTH
 * characters. That keeps one plugin line one physical line (no CR, LF, NUL or other
 * control characters), bounds the memory a single line can take in the server, in a
 * WebSocket frame and in the browser, and means the same rule applies unchanged at
 * every hop. A line that breaks it goes to the console like any other output.
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

/** Longest payload, in characters (= bytes, as it is ASCII). */
export const MAX_PAYLOAD_LENGTH = 200;

const NAME = '[A-Za-z_][A-Za-z0-9_]*';
/** At most 16 digits, then checked with Number.isSafeInteger (2**53 ns = 104 days). */
const TIME = '\\d{1,16}';
const PAYLOAD = `[\\x20-\\x7e]{0,${MAX_PAYLOAD_LENGTH}}`;
const LINE = new RegExp(`^@@HDLB (${NAME}) (${NAME}) (${TIME})(?: (${PAYLOAD}))?$`);
const FRAME_HEAD = new RegExp(`^(${NAME}) (${NAME}) (${TIME})$`);
const FRAME_BODY = new RegExp(`^${PAYLOAD}$`);

function toPluginLine(kind: string, instance: string, time: string, payload: string): PluginLine | undefined {
  const timeNs = Number(time);
  return Number.isSafeInteger(timeNs) && FRAME_BODY.test(payload) ? { kind, instance, timeNs, payload } : undefined;
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
 *
 * `disabledKinds` holds the kinds of the plugins that are switched off for this run
 * (`disabledKinds` in pluginCatalog.ts). A line of such a kind is ordinary output, so a
 * disabled plugin is indistinguishable from no plugin. Every other kind is routed,
 * including kinds no catalog row knows: a plugin edited or written on the Plugins page
 * may introduce one, and the frontend shows it raw.
 */
export function routeOutputLine(text: string, disabledKinds: ReadonlySet<string> = new Set()): OutputRoute {
  const line = parsePluginLine(text);
  if (line === undefined || disabledKinds.has(line.kind)) return { to: 'log', text };
  return { to: 'plugin', line };
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

/**
 * True if VHDL `source` declares the library `hdlboard` in a library clause - the
 * condition for analysing the plugin library before the student's files. Comments
 * (`--` and VHDL-2008 block comments) and string literals are blanked out first, so a
 * commented-out `library hdlboard;` or one inside a string does not count. A
 * `use hdlboard...` without a library clause is not a dependency: the student's own
 * error, which GHDL reports. Pure; the server may swap this for the existing
 * comment stripper in portDetect.ts.
 */
export function usesHdlboardLibrary(source: string): boolean {
  const code = source.replace(/--[^\n]*|\/\*[\s\S]*?\*\/|'"'|"(?:[^"\n]|"")*"/g, ' ');
  return /\blibrary\b[^;]*\bhdlboard\b/i.test(code);
}

/** At most this many ids in one `PLUGINS` verb; far more than will ever be shipped. */
export const MAX_PLUGIN_IDS = 32;
const PLUGIN_ID = /^[a-z][a-z0-9_]{0,31}$/;

/**
 * The ids in the argument of the client verb `PLUGINS <id>,<id>,...` - the plugins
 * enabled for the next run. An empty argument means none. Unknown ids are not an error
 * here (a newer frontend may know plugins an older backend does not); the catalog
 * ignores them. Pure.
 */
export function parsePluginIds(inline: string): string[] | { message: string } {
  if (inline === '') return [];
  const ids = inline.split(',');
  if (ids.length > MAX_PLUGIN_IDS) return { message: `PLUGINS accepts at most ${MAX_PLUGIN_IDS} ids` };
  const bad = ids.find((id) => !PLUGIN_ID.test(id));
  if (bad !== undefined) return { message: `PLUGINS: invalid plugin id ${JSON.stringify(bad)}` };
  return [...new Set(ids)];
}
