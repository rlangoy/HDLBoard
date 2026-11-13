// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * WebSocket server entry point — ../../docs/ghdl_implementation_plan.md § 7.1,
 * § 5.8, § 11. Accepts connections, speaks HELLO/WELCOME, and dispatches
 * everything else to a per-connection Session.
 *
 * Two deployments, one code path:
 *
 *  - **Server mode** (`./scripts/start.sh`, `node dist/server.js`) — WebSocket
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
import { resolveGhdlExe } from './ghdlPath.js';
import { setToolPaths } from './verilog/tools.js';
import { hasShellSpecial, resolveToolPaths, withUsableBundledDir } from './verilog/toolPaths.js';
import { hasSpace, posixLinkPath, windowsShortPath } from './verilog/shortPath.js';
import { TOOL_ARGS_USAGE, parseToolArgs } from './cliArgs.js';
import { decodeClientFrame, encodeServerFrame, type ServerFrame } from './protocol.js';
import { IDLE_GRACE_SECONDS, MAX_SESSIONS, REPLACE_AFTER_MINUTES, TRUSTED_PROXIES, WS_PORT, readIntSetting } from './settings.js';
import {
  MS_PER_MINUTE,
  MS_PER_SECOND,
  ReplacementPolicy,
  closedIdleText,
  closedLogLine,
  closedSimulatingText,
  fullText,
  refusedLogLine,
  sessionsFrom,
  type Newcomer,
  type OpenSession,
} from './sessionLimit.js';
import { clientAddress } from './clientAddress.js';
import {
  GitHubAuthForwarder,
  credentialsFromEnv,
  handleGitHubAuthRequest,
  isGitHubAuthPath,
  type OAuthAppCredentials,
} from './githubAuth.js';
import { socketRequestAllowed } from './requestOrigin.js';

/**
 * The largest frame a client may send: a RUN with every source of a project. Far above
 * any course project, far below ws's default of 100 MiB, which one tab could make the
 * backend buffer.
 */
const MAX_FRAME_BYTES = 8 * 1024 * 1024;

const WSPATH = '/hdlsim';
// The path's name from when GHDL was the only simulator; still accepted so an
// older page or proxy config keeps working. New clients use WSPATH.
const LEGACY_WSPATH = '/ghdlsim';
// 2: the BOARD frame (docs/board_io_config_spec.md § 8). HELLO's version stays
// informational: any version a client names is accepted, and answered with this one.
// 3: board shapes — a JSON BOARD body, STIM and STATE lengths per board
// (docs/board_io_v2_spec.md § 6). A version-2 client's line body is still accepted.
// 4: timed STIM steps, `STIM <bits>/<holdNs> … <bits>` — a bouncing pushbutton.
// 5: `ERROR busy` — the server is full; this connection was refused, or closed for a new one.
// 6: `OPTIONS` — the project's compiler options (compilerOptions.ts), sent before RUN.
const PROTOCOL_VERSION = '6';
/**
 * How long a socket told `ERROR busy` gets to close before it is cut. A proxy may hold the
 * close frame back (Render's did: the tab kept a dead socket open), and cutting the
 * connection ends it there too.
 */
const BUSY_CLOSE_GRACE_MS = 1000;
/** RFC 6455's "Try Again Later". */
const CLOSE_TRY_AGAIN_LATER = 1013;

export interface BackendOptions {
  /** Defaults to `HDL_WS_PORT` (or the legacy `GHDL_WS_PORT`), then 9010. */
  port?: number;
  /**
   * A GHDL installation, the program in its `bin/` (the packaged app's `resources/ghdl`).
   * Set, it wins over `ghdlExe` and over the environment. Defaults to `GHDL_DIR`.
   */
  ghdlDir?: string;
  /** Absolute path to the GHDL executable. Defaults to `GHDL_EXE`, then `'ghdl'`. */
  ghdlExe?: string;
  /**
   * The flat Icarus Verilog tree the packaged app ships (`resources/iverilog`). Set, it
   * wins over the executables below and over the environment. Defaults to `IVERILOG_DIR`.
   */
  iverilogDir?: string;
  /** Absolute path to `iverilog`. Defaults to `IVERILOG_EXE`, then `'iverilog'` on PATH. */
  iverilogExe?: string;
  /** Absolute path to `vvp`. Defaults to `VVP_EXE`, then the one beside `iverilogExe`. */
  vvpExe?: string;
  /**
   * Directory of the built frontend to serve over HTTP. Unset (the
   * default) keeps today's WebSocket-only, LAN-bound behaviour.
   */
  serveDir?: string;
  /**
   * § 7.1/§ 11 — bounds how many students can simulate at once. Defaults to
   * `HDL_MAX_SESSIONS` (or the legacy `GHDL_MAX_SESSIONS`), then 32.
   */
  maxSessions?: number;
  /**
   * On a full server, when no idle session can be closed, a session open at least this many
   * minutes is closed for a new one (sessionLimit.ts); 0 closes nothing and refuses the new
   * one instead. Defaults to `HDL_REPLACE_AFTER_MINUTES`, then 9.
   */
  replaceAfterMinutes?: number;
  /**
   * On a full server, a session idle less than this is spared unless its address has another
   * (sessionLimit.ts). Defaults to `HDL_IDLE_GRACE_SECONDS`, then 60.
   */
  idleGraceSeconds?: number;
  /**
   * How many proxies in front of the backend append to `X-Forwarded-For`; 0 ignores the
   * header (clientAddress.ts). Defaults to `HDL_TRUSTED_PROXIES`, then 0.
   */
  trustedProxies?: number;
  /** The clock sessions' ages are measured on, in ms. Defaults to `Date.now`; tests move it. */
  now?: () => number;
  /**
   * The GitHub OAuth App the sign-in routes forward for (githubAuth.ts). Defaults to
   * `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET`, then HDLBoard's own app without a secret.
   */
  githubOAuthApp?: OAuthAppCredentials;
}

export interface BackendHandle {
  /**
   * Destroys every session (and its simulator child) and closes the socket.
   * `onClosed` fires once the listening socket is fully released — the
   * script entry uses it to exit only after teardown, rather than racing
   * the sessions' own async temp-directory cleanup.
   */
  stop(onClosed?: () => void): void;
  /** The port actually listening — useful to log. */
  port: number;
  /**
   * Resolves once the port is listening. Rejects with the listen error — `EADDRINUSE`
   * when something else holds the port — which `listen()` can only report
   * asynchronously, after `startBackend` has already returned.
   */
  ready: Promise<void>;
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
 * The request's path, percent-decoded, or `undefined` for a malformed escape such as
 * `/%E0%A4%A` — `decodeURIComponent` throws on those, and from inside a request handler
 * that is an unhandled rejection, which ends the process.
 */
function decodedPath(req: IncomingMessage): string | undefined {
  try {
    return decodeURIComponent((req.url ?? '/').split('?')[0]);
  } catch {
    return undefined;
  }
}

/**
 * An upgrade request's path, or `undefined` when it is no URL. `new URL` throws on some
 * request targets Node's parser lets through (`GET //`), and a throw inside the `upgrade`
 * handler ends the process: one request would take every session down.
 */
function upgradePathname(req: IncomingMessage): string | undefined {
  try {
    return new URL(req.url ?? '/', 'http://localhost').pathname;
  } catch {
    return undefined;
  }
}

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
  const urlPath = decodedPath(req);
  if (urlPath === undefined) {
    res.writeHead(400, { 'content-type': 'text/plain' });
    res.end('Bad request');
    return;
  }
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
    // A file removed between the stat and the read fails here, after the headers
    // went out; unhandled, that stream error would take the backend down.
    createReadStream(target)
      .on('error', () => res.destroy())
      .pipe(res);
  } catch {
    res.writeHead(404, { 'content-type': 'text/plain' });
    res.end('Not found');
  }
}

/** One open WebSocket and its session, as the choice of which to close for a new one sees it. */
class Connection implements OpenSession {
  constructor(
    readonly ws: WebSocket,
    readonly session: Session,
    readonly openedAt: number,
    readonly clientAddress: string,
  ) {}

  get simulating(): boolean {
    return this.session.simulating;
  }

  get idleSince(): number {
    return this.session.idleSince;
  }
}

/**
 * Starts the backend. Returns a handle rather than running to process
 * exit, so Electron can own the lifecycle — it calls `stop()` from
 * `before-quit`, where a process signal never arrives.
 */
export function startBackend(opts: BackendOptions = {}): BackendHandle {
  const port = opts.port ?? readIntSetting(WS_PORT);
  const maxSessions = opts.maxSessions ?? readIntSetting(MAX_SESSIONS);
  const replaceAfterMs = (opts.replaceAfterMinutes ?? readIntSetting(REPLACE_AFTER_MINUTES)) * MS_PER_MINUTE;
  const idleGraceMs = (opts.idleGraceSeconds ?? readIntSetting(IDLE_GRACE_SECONDS)) * MS_PER_SECOND;
  const trustedProxies = opts.trustedProxies ?? readIntSetting(TRUSTED_PROXIES);
  const replacementPolicy = new ReplacementPolicy(replaceAfterMs, idleGraceMs);
  const now = opts.now ?? Date.now;
  const serveDir = opts.serveDir ? resolve(opts.serveDir) : null;
  // Before anything can spawn.
  const ghdlExe = resolveGhdlExe(process.env, opts);
  setGhdlExe(ghdlExe);
  const shorten = process.platform === 'win32' ? windowsShortPath : posixLinkPath;
  const iverilogTools = withUsableBundledDir(resolveToolPaths(process.env, opts), shorten);
  setToolPaths(iverilogTools);
  if (process.platform === 'win32' && iverilogTools.bundledDir !== undefined && hasSpace(iverilogTools.bundledDir)) {
    console.warn(
      `hdl-board: the Icarus Verilog folder "${iverilogTools.bundledDir}" contains a space and has no 8.3 short name; ` +
        'Verilog compiles will fail. Install HDLBoard to a folder without spaces.',
    );
  }
  if (process.platform !== 'win32' && iverilogTools.bundledDir !== undefined && hasShellSpecial(iverilogTools.bundledDir)) {
    console.warn(
      `hdl-board: the Icarus Verilog folder "${iverilogTools.bundledDir}" contains a space or shell character and no link ` +
        'to it could be made in the temporary directory; Verilog compiles will fail. Move HDLBoard to a plainer folder.',
    );
  }

  // Desktop mode is a single-user app on one machine; exposing a simulator
  // spawner to the LAN there would be a gratuitous attack surface.
  const host = serveDir ? '127.0.0.1' : '0.0.0.0';

  const githubAuth = new GitHubAuthForwarder(opts.githubOAuthApp ?? credentialsFromEnv(process.env));

  const httpServer: Server = createServer((req, res) => {
    // GitHub sign-in for the page, in both modes: the page reaches it where it reaches the socket.
    if (isGitHubAuthPath(decodedPath(req) ?? '')) {
      // Unhandled, a rejection here (a client gone mid-answer) would end the process.
      handleGitHubAuthRequest(githubAuth, req, res).catch(() => res.destroy());
    } else if (serveDir) {
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
   * port, and the upgrade is routed by path so `/hdlsim` (or the legacy
   * `/ghdlsim`) is a socket
   * while everything else stays a normal request.
   */
  const wss = new WebSocketServer({ noServer: true, maxPayload: MAX_FRAME_BYTES });

  httpServer.on('upgrade', (req, socket: Duplex, head) => {
    const pathname = upgradePathname(req);
    if (pathname !== WSPATH && pathname !== LEGACY_WSPATH) {
      socket.write('HTTP/1.1 404 Not Found\r\n\r\n');
      socket.destroy();
      return;
    }
    // Only HDLBoard's own page may start simulations, never another site (requestOrigin.ts).
    if (!socketRequestAllowed(req, { loopbackOnly: serveDir !== null })) {
      socket.write('HTTP/1.1 403 Forbidden\r\n\r\n');
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
  const sessions = new Map<Session, Connection>();

  // `error` is normally followed by `close`, so this runs twice for one socket: `delete`
  // returning false is what tells the second call there is nothing left to tear down.
  const endSession = (session: Session) => {
    if (!sessions.delete(session)) return;
    session.destroy();
  };

  /** Logs it, tells the student why (`ERROR busy`), then closes — and cuts, if the close is held up. */
  const closeBusy = (ws: WebSocket, text: string, logLine: string) => {
    console.log(logLine);
    if (ws.readyState === WebSocket.OPEN) ws.send(encodeServerFrame({ verb: 'ERROR', stage: 'busy', text }));
    ws.close(CLOSE_TRY_AGAIN_LATER, 'server busy');
    setTimeout(() => ws.terminate(), BUSY_CLOSE_GRACE_MS).unref();
  };

  /** Closes the session the policy picks for `newcomer`; false when it picks none. */
  const makeRoomFor = (newcomer: Newcomer): boolean => {
    const open = [...sessions.values()];
    const closed = replacementPolicy.sessionToClose(open, newcomer);
    if (closed === undefined) return false;
    const sameAddress = sessionsFrom(closed.clientAddress, open, newcomer);
    const text = closed.simulating ? closedSimulatingText() : closedIdleText();
    closeBusy(closed.ws, text, closedLogLine(closed, sameAddress, newcomer.at));
    // Now, not on its close: the place is the new connection's at once.
    endSession(closed.session);
    return true;
  };

  wss.on('connection', (ws: WebSocket, req: IncomingMessage) => {
    const newcomer: Newcomer = { clientAddress: clientAddress(req, trustedProxies), at: now() };
    const hasPlace = sessions.size < maxSessions || makeRoomFor(newcomer);
    if (!hasPlace) {
      closeBusy(ws, fullText(maxSessions), refusedLogLine([...sessions.values()]));
      return;
    }

    let helloed = false;
    const send = (frame: ServerFrame) => {
      if (ws.readyState === WebSocket.OPEN) ws.send(encodeServerFrame(frame));
    };
    const sendBinary = (chunk: Buffer) => {
      if (ws.readyState === WebSocket.OPEN) ws.send(chunk, { binary: true });
    };
    const session = new Session(send, undefined, { sendBinary, now });
    sessions.set(session, new Connection(ws, session, newcomer.at, newcomer.clientAddress));

    ws.on('message', (data, isBinary) => {
      // Closed to make room for another, it is only waiting for its socket to close.
      if (!sessions.has(session)) return;
      if (isBinary) {
        // Binary frames only ever go to the client, with a waveform (docs/waveform_viewer_spec.md § 7.4).
        send({ verb: 'ERROR', stage: 'protocol', text: 'A client sends no binary frames.' });
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
          session.handleRun(frame.files, frame.topFile, frame.runTarget).catch((e) => {
            send({ verb: 'ERROR', stage: 'internal', text: `Internal server error:\n${String(e)}` });
          });
          break;
        case 'STIM':
          session.handleStim(frame.steps);
          break;
        case 'WAVE':
          session.handleWave(frame.on);
          break;
        case 'BOARD':
          // An invalid board is reported once, by the RUN that follows it (session.ts).
          session.handleBoard(frame.board);
          break;
        case 'OPTIONS':
          // Invalid options too: the RUN that follows says why.
          session.handleOptions(frame.options);
          break;
        case 'WAVE-GET':
          void session.handleWaveGet(frame.run);
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

    const teardown = () => endSession(session);
    ws.on('close', teardown);
    ws.on('error', teardown);
  });

  // Only a listen error belongs to `ready`; once listening, the listener is removed so
  // a later error is not silently absorbed by an already-settled promise.
  const ready = new Promise<void>((resolve, reject) => {
    httpServer.once('error', reject);
    httpServer.once('listening', () => {
      httpServer.off('error', reject);
      resolve();
    });
  });

  httpServer.listen(port, host, () => {
    console.log(`hdl-board simulation backend listening on ws://${host}:${port}${WSPATH}`);
    console.log(`hdl-board GHDL: ${ghdlExe}`);
    console.log(`hdl-board Icarus Verilog: ${iverilogTools.iverilog}${iverilogTools.bundledDir ? ' (bundled tree)' : ''}`);
    if (serveDir) console.log(`hdl-board serving frontend from ${serveDir} on http://${host}:${port}/`);
  });

  let stopped = false;
  return {
    port,
    ready,
    stop: (onClosed?: () => void) => {
      if (stopped) {
        onClosed?.();
        return;
      }
      stopped = true;
      for (const session of sessions.keys()) session.destroy();
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

// Re-exported for Electron, which reads the same flags from its own argv.
export { parseToolArgs };

if (invokedDirectly) {
  const parsed = parseToolArgs(process.argv.slice(2), { strict: true });
  if (!parsed.ok) {
    console.error(`hdl-board backend: ${parsed.error}\n${TOOL_ARGS_USAGE}`);
    process.exit(2);
  }
  const backend = startBackend(parsed.args);
  backend.ready.catch((err: unknown) => {
    console.error(`hdl-board backend could not listen on port ${backend.port}: ${String(err)}`);
    process.exit(1);
  });

  /**
   * A signalled backend must not outlive its simulator children (§ 5.10). Node's
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
