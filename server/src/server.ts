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
let activeSessions = 0;

console.log(`de1soc-sim GHDL backend listening on ws://0.0.0.0:${PORT}${WSPATH}`);

wss.on('connection', (ws: WebSocket) => {
  if (activeSessions >= MAX_SESSIONS) {
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
  activeSessions++;

  let helloed = false;
  const send = (frame: ServerFrame) => {
    if (ws.readyState === WebSocket.OPEN) ws.send(encodeServerFrame(frame));
  };
  const session = new Session(send);

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

  const teardown = () => {
    activeSessions--;
    session.destroy();
  };
  ws.on('close', teardown);
  ws.on('error', teardown);
});
