// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * WebSocket server entry point — ../../ghdl_implementation_plan.md § 7.1,
 * § 5.8, § 11. Accepts connections, speaks HELLO/WELCOME, and dispatches
 * everything else to a per-connection Session.
 */

import { WebSocketServer, WebSocket } from 'ws';
import { Session } from './session.js';
import { decodeClientFrame, encodeServerFrame, type ServerFrame } from './protocol.js';

const PORT = parseInt(process.env.GHDL_WS_PORT ?? '9010', 10);
const WSPATH = '/ghdlsim';
const PROTOCOL_VERSION = '1';
/** § 7.1/§ 11 — bounds how many students can concurrently fork GHDL. */
const MAX_SESSIONS = parseInt(process.env.GHDL_MAX_SESSIONS ?? '32', 10);

const wss = new WebSocketServer({ port: PORT, path: WSPATH, host: '0.0.0.0' });
/**
 * Every live session, so shutdown can reach them. Without this, killing
 * the backend (`stop.sh`, Ctrl-C, a restart) left each session's `ghdl -r`
 * child orphaned and spinning at 100 % CPU forever — the wrapper loops on
 * purpose (§ 5), so nothing ever ends it on its own, and § 7.2's teardown
 * only ever fired on a WebSocket close. Real incident, § 5.10.
 */
const sessions = new Set<Session>();

console.log(`de1soc-sim GHDL backend listening on ws://0.0.0.0:${PORT}${WSPATH}`);

wss.on('connection', (ws: WebSocket) => {
  if (sessions.size >= MAX_SESSIONS) {
    ws.send(
      encodeServerFrame({
        verb: 'ERROR',
        stage: 'internal',
        text: 'Too many concurrent sessions on this server. Try again shortly.',
      }),
    );
    ws.close();
    return;
  }

  let helloed = false;
  const send = (frame: ServerFrame) => {
    if (ws.readyState === WebSocket.OPEN) ws.send(encodeServerFrame(frame));
  };
  const session = new Session(send);
  sessions.add(session);

  ws.on('message', (data, isBinary) => {
    if (isBinary) {
      send({ verb: 'ERROR', stage: 'protocol', text: 'This protocol has no binary payloads.' });
      ws.close();
      return;
    }
    const text = data.toString('utf8');
    const frame = decodeClientFrame(text);
    if ('message' in frame) {
      send({ verb: 'ERROR', stage: 'protocol', text: frame.message });
      return;
    }

    switch (frame.verb) {
      case 'HELLO':
        helloed = true;
        send({ verb: 'WELCOME', version: PROTOCOL_VERSION });
        break;
      case 'RUN':
        if (!helloed) {
          send({ verb: 'ERROR', stage: 'protocol', text: 'RUN sent before HELLO.' });
          break;
        }
        session.handleRun(frame.files, frame.topFile).catch((e) => {
          send({ verb: 'ERROR', stage: 'internal', text: `Internal server error:\n${String(e)}` });
        });
        break;
      case 'STIM':
        session.handleStim(frame.bits);
        break;
      case 'RESET':
        session.handleReset();
        break;
      case 'STOP':
        session.handleStop();
        break;
      case 'PING':
        send({ verb: 'PONG' });
        break;
    }
  });

  // `error` is normally followed by `close`, so this fires twice without
  // the Set's own idempotence doing the work: `delete` returning false is
  // what tells the second call there is nothing left to tear down.
  const teardown = () => {
    if (!sessions.delete(session)) return;
    session.destroy();
  };
  ws.on('close', teardown);
  ws.on('error', teardown);
});

/**
 * A signalled backend must not outlive its GHDL children (§ 5.10). Node's
 * default SIGTERM/SIGINT disposition exits immediately without unwinding
 * anything, which is exactly how `stop.sh` (a plain `kill`) used to strand
 * them. Killing each child is synchronous, so it completes before the exit
 * below regardless of what the socket close is doing.
 */
let shuttingDown = false;
function shutdown(signal: string): void {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`${signal} received — destroying ${sessions.size} session(s) before exit.`);
  for (const session of sessions) session.destroy();
  sessions.clear();
  wss.close(() => process.exit(0));
  // A socket that never finishes closing must not hold the process open.
  setTimeout(() => process.exit(0), 1000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
