/**
 * The Workbench's WebSocket client for the GHDL backend —
 * ../../../ghdl_implementation_plan.md § 6, § 8.2. The only file in this
 * app that speaks the wire protocol; `Workbench.tsx` calls this, never
 * `WebSocket` directly.
 *
 * Mirrors server/src/protocol.ts's grammar independently (a separate npm
 * package, in the browser, cannot import that file) — keep the two in
 * sync by hand if the protocol changes.
 */

import { bitsToString, type BitVector } from '../board';
import { blankSegments, patternToSegments, type SegmentVector } from '../SevenSegment';
import type { VhdlFile } from './files';

const PROTOCOL_VERSION = '1';
const STATE_LENGTH = 10 + 6 * 7;

export interface GhdlClientHandlers {
  onReady(): void;
  onState(ledr: BitVector, hex: SegmentVector[]): void;
  onLog(text: string): void;
  onError(stage: string, text: string): void;
  onDone(reason: string): void;
  onClosed(): void;
}

/** `ws://<page host>:<port>/ghdlsim` — never a hardcoded `localhost` (§ 6.4). */
export function ghdlBackendUrl(port: number): string {
  return `ws://${window.location.hostname}:${port}/ghdlsim`;
}

/**
 * `STATE`'s 52-bit payload → the board's own value shapes. `HEX0` is
 * slice 0 (§ 6.4). Any bit that isn't `'0'`/`'1'` (`'X'`, GHDL's
 * undefined) coerces to that field's own *off* value (§ 8.4) — `0` for
 * `LEDR` (active high), `'1'` for a `HEX` segment (active low) — rather
 * than a tri-state `Bit`, per the plan's recommendation to ship the
 * simple version first.
 */
function parseState(bits: string): { ledr: BitVector; hex: SegmentVector[] } {
  const ledrField = bits.slice(0, 10);
  const ledr: BitVector = [...ledrField].reverse().map((c) => (c === '1' ? 1 : 0));

  const hex: SegmentVector[] = [];
  for (let i = 0; i < 6; i++) {
    const field = bits.slice(10 + i * 7, 10 + (i + 1) * 7);
    const coerced = [...field].map((c) => (c === '0' || c === '1' ? c : '1')).join('');
    hex.push(patternToSegments(coerced));
  }
  return { ledr, hex };
}

export class GhdlClient {
  private ws: WebSocket | null = null;
  private readonly url: string;
  private readonly handlers: GhdlClientHandlers;
  // Whether the current socket has ever received READY. A close before
  // that happens means the backend was never actually reached — a plain
  // `onClosed()` there is indistinguishable from a normal Stop, and the
  // Workbench console would show nothing at all (found by actually
  // stopping the backend and clicking Start, not by reading this code:
  // the failure is a same-tick connection refusal, not a slow timeout —
  // near-instant on localhost, and silent without this).
  private everReady = false;

  constructor(url: string, handlers: GhdlClientHandlers) {
    this.url = url;
    this.handlers = handlers;
  }

  private ensureSocket(): WebSocket {
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      return this.ws;
    }
    this.everReady = false;
    const ws = new WebSocket(this.url);
    ws.onopen = () => {
      ws.send(`HELLO ${PROTOCOL_VERSION}`);
    };
    ws.onmessage = (event) => {
      if (typeof event.data !== 'string') return; // no binary payloads (§ 6.2)
      this.handleFrame(event.data);
    };
    ws.onclose = () => {
      if (!this.everReady) {
        this.handlers.onError('internal', `Could not reach the GHDL backend at ${this.url}.`);
      }
      this.handlers.onClosed();
    };
    ws.onerror = () => {
      // onclose fires right after in every browser; nothing extra to do here.
    };
    this.ws = ws;
    return ws;
  }

  private handleFrame(text: string): void {
    const nl = text.indexOf('\n');
    const head = nl === -1 ? text : text.slice(0, nl);
    const body = nl === -1 ? '' : text.slice(nl + 1);
    const sp = head.indexOf(' ');
    const verb = sp === -1 ? head : head.slice(0, sp);
    const inline = sp === -1 ? '' : head.slice(sp + 1);

    switch (verb) {
      case 'WELCOME':
        break; // nothing to do — HELLO/WELCOME just confirms the version
      case 'READY':
        this.everReady = true;
        this.handlers.onReady();
        break;
      case 'STATE':
        if (inline.length === STATE_LENGTH) {
          const { ledr, hex } = parseState(inline);
          this.handlers.onState(ledr, hex);
        }
        break;
      case 'LOG':
        this.handlers.onLog(body);
        break;
      case 'ERROR':
        this.handlers.onError(inline, body);
        break;
      case 'DONE':
        this.handlers.onDone(inline);
        break;
      case 'PONG':
        break;
      default:
        // Unknown verb: ignore, per § 6.2 — never disconnect on this.
        break;
    }
  }

  /** Filters to `folder === 'vhdl'` and builds the `@@FILE ...@@`-framed body (§ 6.3). */
  run(files: VhdlFile[]): void {
    const ws = this.ensureSocket();
    const vhdlFiles = files.filter((f) => f.folder === 'vhdl');
    const body = vhdlFiles.map((f) => `@@FILE ${f.name}@@\n${f.content}`).join('\n');
    const send = () => ws.send(`RUN\n${body}`);
    if (ws.readyState === WebSocket.OPEN) send();
    else ws.addEventListener('open', () => { ws.send(`HELLO ${PROTOCOL_VERSION}`); send(); }, { once: true });
  }

  stim(sw: BitVector, key: BitVector): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    this.ws.send(`STIM ${bitsToString(sw)}${bitsToString(key)}`);
  }

  reset(): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) this.ws.send('RESET');
  }

  stop(): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) this.ws.send('STOP');
  }

  close(): void {
    if (this.ws) {
      this.ws.onclose = null;
      this.ws.close();
      this.ws = null;
    }
  }
}

/** Blank board outputs — what `Workbench` resets to on every `run()` (§ 8.3). */
export function blankBoardOutputs(): { ledr: BitVector; hex: SegmentVector[] } {
  return {
    ledr: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    hex: Array.from({ length: 6 }, () => blankSegments()),
  };
}
