// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * Which port the desktop app's backend listens on. The first copy of the app
 * gets 9010, as it always has; a second copy running at the same time finds
 * 9010 taken and gets 9011, and so on. A short, fixed list rather than any free
 * port: the page's origin includes the port, and its stored settings (pane
 * sizes, …) belong to that origin, so a second copy should come back to the
 * same origin each time too.
 */

const FIRST_BACKEND_PORT = 9010;
const BACKEND_PORT_COUNT = 10;

const BACKEND_PORTS = Array.from({ length: BACKEND_PORT_COUNT }, (_, i) => FIRST_BACKEND_PORT + i);

function isPortInUse(err) {
  return Boolean(err) && err.code === 'EADDRINUSE';
}

/** Resolves once the failed backend has let go of everything it opened. */
function stopped(handle) {
  return new Promise((resolve) => handle.stop(resolve));
}

/**
 * Starts the backend on the first of `ports` that is free and returns its handle.
 * `start(port)` starts one and returns a handle whose `ready` rejects with
 * EADDRINUSE when that port is taken. Any other error ends the search at once;
 * when every port is taken, the last EADDRINUSE is the answer.
 */
async function startOnFirstFreePort(start, ports = BACKEND_PORTS) {
  let portInUse = new Error('no ports to try');
  for (const port of ports) {
    const handle = start(port);
    try {
      await handle.ready;
      return handle;
    } catch (err) {
      await stopped(handle);
      if (!isPortInUse(err)) throw err;
      portInUse = err;
    }
  }
  throw portInUse;
}

module.exports = { BACKEND_PORTS, isPortInUse, startOnFirstFreePort };
