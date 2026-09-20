// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * WebSocket server entry point — ../../ghdl_implementation_plan.md § 7.1,
 * § 5.8, § 11. Accepts connections, speaks HELLO/WELCOME, and dispatches
 * everything else to a per-connection Session.
 *
 * Two deployments, one code path:
 *
 *  - **Server mode** (`./start.sh`, `node dist/server.js`) — WebSocket
 *    only, bound to `0.0.0.0` so the LAN can reach it, with the frontend
 *    served separately by Vite on its own port. This is the default and
 *    behaves exactly as it always has.
 *  - **Desktop mode** (the packaged Windows app) — `serveDir` is set, so
 *    this also serves the built frontend over HTTP and binds loopback
 *    only. One port, one origin: the renderer derives its WebSocket URL
 *    from `window.location`, so page and socket must agree, and they
 *    cannot under `file://` (hostname is empty there). Serving the
 *    frontend from here is what lets the Electron app reuse `src/**`
 *    completely unmodified.
 */

import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { createReadStream, promises as fs } from 'node:fs';
import { extname, normalize, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { Duplex } from 'node:stream';
import { WebSocketServer, WebSocket } from 'ws';
import { Session } from './session.js';
import { setGhdlExe } from './ghdl.js';
import { decodeClientFrame, encodeServerFrame, type ServerFrame } from './protocol.js';

const WSPATH = '/ghdlsim';
const PROTOCOL_VERSION = '1';

export interface BackendOptions {
  /** Defaults to `GHDL_WS_PORT`, then 9010. */
  port?: number;
  /** Absolute path to the GHDL executable. Defaults to `GHDL_EXE`, then `'ghdl'`. */
  ghdlExe?: string;
  /**
   * Directory of the built frontend to serve over HTTP. Unset (the
   * default) keeps today's WebSocket-only, LAN-bound behaviour.
   */
  serveDir?: string;
  /** § 7.1/§ 11 — bounds how many students can concurrently fork GHDL. */
  maxSessions?: number;
}

export interface BackendHandle {
  /**
   * Destroys every session (and its GHDL child) and closes the socket.
   * `onClosed` fires once the listening socket is fully released — the
   * script entry uses it to exit only after teardown, rather than racing
   * the sessions' own async temp-directory cleanup.
   */
  stop(onClosed?: () => void): void;
  /** The port actually listening — useful to log. */
  port: number;
}

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.map': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
};

/**
 * Serves one file out of `rootDir`. The `normalize`-then-prefix-check is
 * the path traversal guard: a request for `/../../etc/passwd` normalizes
 * to something outside `rootDir`, and anything that does is refused
 * rather than clamped, so there is no encoding trick that turns into a
 * read. Loopback-only binding already makes this hard to reach, but a
 * static server that can leave its root is a bug regardless of who can
 * talk to it.
 */
async function serveStatic(rootDir: string, req: IncomingMessage, res: ServerResponse): Promise<void> {
  const urlPath = decodeURIComponent((req.url ?? '/').split('?')[0]);
  const rel = urlPath === '/' ? 'index.html' : urlPath.replace(/^\/+/, '');
  const target = resolve(rootDir, normalize(rel));

  if (target !== rootDir && !target.startsWith(rootDir + sep)) {
    res.writeHead(403, { 'content-type': 'text/plain' });
    res.end('Forbidden');
    return;
  }

  try {
    const stat = await fs.stat(target);
    if (!stat.isFile()) throw new Error('not a file');
    res.writeHead(200, {
      'content-type': MIME[extname(target).toLowerCase()] ?? 'application/octet-stream',
      'content-length': stat.size,
      // The desktop app reinstalls over itself and the asset names are
      // content-hashed by Vite anyway; caching index.html would just mean
      // a stale shell after an upgrade.
      'cache-control': 'no-cache',
    });
    createReadStream(target).pipe(res);
  } catch {
    res.writeHead(404, { 'content-type': 'text/plain' });
    res.end('Not found');
  }
}

/**
 * Starts the backend. Returns a handle rather than running to process
 * exit, so Electron can own the lifecycle — it calls `stop()` from
 * `before-quit`, where a process signal never arrives.
 */
export function startBackend(opts: BackendOptions = {}): BackendHandle {
  const port = opts.port ?? parseInt(process.env.GHDL_WS_PORT ?? '9010', 10);
  const maxSessions = opts.maxSessions ?? parseInt(process.env.GHDL_MAX_SESSIONS ?? '32', 10);
  const serveDir = opts.serveDir ? resolve(opts.serveDir) : null;
  // Before anything can spawn.
  setGhdlExe(opts.ghdlExe ?? process.env.GHDL_EXE ?? 'ghdl');

  // Desktop mode is a single-user app on one machine; exposing a GHDL
  // spawner to the LAN there would be a gratuitous attack surface.
  const host = serveDir ? '127.0.0.1' : '0.0.0.0';

  const httpServer: Server = createServer((req, res) => {
    if (serveDir) {
      void serveStatic(serveDir, req, res);
    } else {
      // Matches what `new WebSocketServer({ port })` used to answer to a
      // plain GET: this endpoint speaks WebSocket, nothing else.
      res.writeHead(426, { 'content-type': 'text/plain' });
      res.end('Upgrade Required — this port speaks WebSocket at ' + WSPATH);
    }
  });

  /**
   * `noServer` rather than `{ port }`: the HTTP server above owns the
   * port, and the upgrade is routed by path so `/ghdlsim` is a socket
   * while everything else stays a normal request.
   */
  const wss = new WebSocketServer({ noServer: true });

  httpServer.on('upgrade', (req, socket: Duplex, head) => {
    const { pathname } = new URL(req.url ?? '/', 'http://localhost');
    if (pathname !== WSPATH) {
      socket.write('HTTP/1.1 404 Not Found\r\n\r\n');
      socket.destroy();
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, req));
  });

  /**
   * Every live session, so shutdown can reach them. Without this, killing
   * the backend (`stop.sh`, Ctrl-C, a restart) left each session's `ghdl -r`
   * child orphaned and spinning at 100 % CPU forever — the wrapper loops on
   * purpose (§ 5), so nothing ever ends it on its own, and § 7.2's teardown
   * only ever fired on a WebSocket close. Real incident, § 5.10.
   */
  const sessions = new Set<Session>();

  wss.on('connection', (ws: WebSocket) => {
    if (sessions.size >= maxSessions) {
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

  httpServer.listen(port, host, () => {
    console.log(`hdl-board GHDL backend listening on ws://${host}:${port}${WSPATH}`);
    if (serveDir) console.log(`hdl-board serving frontend from ${serveDir} on http://${host}:${port}/`);
  });

  let stopped = false;
  return {
    port,
    stop: (onClosed?: () => void) => {
      if (stopped) {
        onClosed?.();
        return;
      }
      stopped = true;
      for (const session of sessions) session.destroy();
      sessions.clear();
      // An open WebSocket is a live connection as far as the HTTP server
      // is concerned, so `httpServer.close()` would wait forever on it —
      // its callback only fires once every connection has ended.
      for (const client of wss.clients) client.terminate();
      wss.close();
      httpServer.close(() => onClosed?.());
    },
  };
}

/**
 * Script entry. `pathToFileURL` rather than string-concatenating
 * `file://`: on Windows `process.argv[1]` is `C:\…\server.js`, whose URL
 * form is `file:///C:/…/server.js`, so the naive comparison is never
 * equal there and the backend would silently refuse to start as a script.
 */
const invokedDirectly =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;

if (invokedDirectly) {
  const backend = startBackend();

  /**
   * A signalled backend must not outlive its GHDL children (§ 5.10). Node's
   * default SIGTERM/SIGINT disposition exits immediately without unwinding
   * anything, which is exactly how `stop.sh` (a plain `kill`) used to strand
   * them. Killing each child is synchronous, so it completes before the exit
   * below regardless of what the socket close is doing.
   *
   * Registered only for the script entry: an embedding host (Electron)
   * drives teardown through `stop()` on its own lifecycle and must not
   * inherit process-wide handlers for signals it never sends.
   */
  let shuttingDown = false;
  const shutdown = (signal: string): void => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`${signal} received — shutting down before exit.`);
    backend.stop(() => process.exit(0));
    // A socket that never finishes closing must not hold the process open.
    setTimeout(() => process.exit(0), 1000).unref();
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}
