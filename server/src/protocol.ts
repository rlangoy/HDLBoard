/**
 * The wire protocol between the Workbench and this backend —
 * ../../ghdl_implementation_plan.md § 6. Pure functions only: no socket,
 * no filesystem, no GHDL. That is what makes this module unit-testable in
 * isolation and is the one place the grammar is implemented on the
 * backend side (the frontend's ghdlClient.ts implements the same grammar
 * independently — it is a separate npm package, in the browser, and
 * cannot import this file).
 *
 * Framing (§ 6.2): one command = one WebSocket text frame.
 *   frame     = head-line [ LF body ]
 *   head-line = verb [ SP inline-args ]
 *   body      = everything after the first LF, verbatim, never escaped
 */

export interface VhdlFileInput {
  name: string;
  content: string;
}

export type ErrorStage = 'analyze' | 'elaborate' | 'runtime' | 'protocol' | 'internal';
export type DoneReason = 'stopped' | 'max-cycles' | 'closed';

export type ClientFrame =
  | { verb: 'HELLO'; version: string }
  // `topFile`: the submitted file whose declared entity should be
  // elaborated as top, e.g. from a "set as top" click in the Files
  // panel. Optional — omitted, the backend falls back to matching board
  // ports across every submitted entity (§ 7.3's original heuristic).
  | { verb: 'RUN'; files: VhdlFileInput[]; topFile?: string }
  | { verb: 'STIM'; bits: string }
  | { verb: 'RESET' }
  | { verb: 'STOP' }
  | { verb: 'PING' };

export type ServerFrame =
  | { verb: 'WELCOME'; version: string }
  | { verb: 'READY' }
  | { verb: 'STATE'; bits: string }
  | { verb: 'LOG'; text: string }
  | { verb: 'ERROR'; stage: ErrorStage; text: string }
  | { verb: 'DONE'; reason: DoneReason }
  | { verb: 'PONG' };

export interface ProtocolError {
  message: string;
}

/** `STIM`'s payload: SW9..SW0, KEY3..KEY0 — 14 bits, MSB-first (§ 6.3). */
export const STIM_LENGTH = 14;

/** `STATE`'s payload: LEDR(10) + HEX0..HEX5(7 each) = 52 bits (§ 6.4). */
export const STATE_LENGTH = 10 + 6 * 7;

const FILE_MARKER = /^@@FILE (.+)@@$/;

function isProtocolError(v: VhdlFileInput[] | ProtocolError): v is ProtocolError {
  return 'message' in v;
}

/**
 * Splits a `RUN` body into its files (§ 6.3). A marker line is
 * `@@FILE <name>@@`; everything up to the next marker (or the end of the
 * body) is that file's content, verbatim. Content is never trimmed or
 * re-escaped — this is deliberately dumb, per § 6.1's "no escaping ever".
 */
function splitRunBody(body: string): VhdlFileInput[] | ProtocolError {
  if (body.length === 0) return [];
  const lines = body.split('\n');
  const files: VhdlFileInput[] = [];
  let currentName: string | null = null;
  let currentLines: string[] = [];

  const flush = () => {
    if (currentName !== null) {
      files.push({ name: currentName, content: currentLines.join('\n') });
    }
  };

  for (const line of lines) {
    const m = FILE_MARKER.exec(line);
    if (m) {
      flush();
      currentName = m[1];
      currentLines = [];
    } else if (currentName !== null) {
      currentLines.push(line);
    } else if (line.trim() !== '') {
      return {
        message: `RUN body has content before the first @@FILE ...@@ marker: ${JSON.stringify(line)}`,
      };
    }
  }
  flush();
  return files;
}

export function decodeClientFrame(text: string): ClientFrame | ProtocolError {
  const nl = text.indexOf('\n');
  const head = nl === -1 ? text : text.slice(0, nl);
  const body = nl === -1 ? '' : text.slice(nl + 1);
  const sp = head.indexOf(' ');
  const verb = sp === -1 ? head : head.slice(0, sp);
  const inline = sp === -1 ? '' : head.slice(sp + 1);

  switch (verb) {
    case 'HELLO': {
      if (!inline) return { message: 'HELLO requires a protocol version' };
      return { verb: 'HELLO', version: inline };
    }
    case 'RUN': {
      const files = splitRunBody(body);
      if (isProtocolError(files)) return files;
      if (files.length === 0) {
        return { message: 'RUN body contains no @@FILE ...@@ sections' };
      }
      return { verb: 'RUN', files, topFile: inline || undefined };
    }
    case 'STIM': {
      if (!new RegExp(`^[01]{${STIM_LENGTH}}$`).test(inline)) {
        return {
          message: `STIM requires exactly ${STIM_LENGTH} bits ('0'/'1'), got: ${JSON.stringify(inline)}`,
        };
      }
      return { verb: 'STIM', bits: inline };
    }
    case 'RESET':
      return { verb: 'RESET' };
    case 'STOP':
      return { verb: 'STOP' };
    case 'PING':
      return { verb: 'PING' };
    default:
      return { message: `Unknown verb: ${JSON.stringify(verb)}` };
  }
}

export function encodeClientFrame(frame: ClientFrame): string {
  switch (frame.verb) {
    case 'HELLO':
      return `HELLO ${frame.version}`;
    case 'RUN': {
      const body = frame.files
        .map((f) => `@@FILE ${f.name}@@\n${f.content}`)
        .join('\n');
      const head = frame.topFile ? `RUN ${frame.topFile}` : 'RUN';
      return `${head}\n${body}`;
    }
    case 'STIM':
      return `STIM ${frame.bits}`;
    case 'RESET':
      return 'RESET';
    case 'STOP':
      return 'STOP';
    case 'PING':
      return 'PING';
  }
}

export function decodeServerFrame(text: string): ServerFrame | ProtocolError {
  const nl = text.indexOf('\n');
  const head = nl === -1 ? text : text.slice(0, nl);
  const body = nl === -1 ? '' : text.slice(nl + 1);
  const sp = head.indexOf(' ');
  const verb = sp === -1 ? head : head.slice(0, sp);
  const inline = sp === -1 ? '' : head.slice(sp + 1);

  switch (verb) {
    case 'WELCOME':
      if (!inline) return { message: 'WELCOME requires a protocol version' };
      return { verb: 'WELCOME', version: inline };
    case 'READY':
      return { verb: 'READY' };
    case 'STATE':
      if (!new RegExp(`^[01X]{${STATE_LENGTH}}$`).test(inline)) {
        return {
          message: `STATE requires exactly ${STATE_LENGTH} bits ('0'/'1'/'X'), got: ${JSON.stringify(inline)}`,
        };
      }
      return { verb: 'STATE', bits: inline };
    case 'LOG':
      return { verb: 'LOG', text: body };
    case 'ERROR': {
      const stage = inline as ErrorStage;
      if (!['analyze', 'elaborate', 'runtime', 'protocol', 'internal'].includes(stage)) {
        return { message: `ERROR has an unknown stage: ${JSON.stringify(inline)}` };
      }
      return { verb: 'ERROR', stage, text: body };
    }
    case 'DONE': {
      const reason = inline as DoneReason;
      if (!['stopped', 'max-cycles', 'closed'].includes(reason)) {
        return { message: `DONE has an unknown reason: ${JSON.stringify(inline)}` };
      }
      return { verb: 'DONE', reason };
    }
    case 'PONG':
      return { verb: 'PONG' };
    default:
      return { message: `Unknown verb: ${JSON.stringify(verb)}` };
  }
}

export function encodeServerFrame(frame: ServerFrame): string {
  switch (frame.verb) {
    case 'WELCOME':
      return `WELCOME ${frame.version}`;
    case 'READY':
      return 'READY';
    case 'STATE':
      return `STATE ${frame.bits}`;
    case 'LOG':
      return `LOG\n${frame.text}`;
    case 'ERROR':
      return `ERROR ${frame.stage}\n${frame.text}`;
    case 'DONE':
      return `DONE ${frame.reason}`;
    case 'PONG':
      return 'PONG';
  }
}
