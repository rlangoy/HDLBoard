# syntax=docker/dockerfile:1
# HDLBoard — container build. Docker counterpart of scripts/alpineInstall.sh;
# see docker/README.md. Built from the repository root by docker-compose.yml:
#
#   docker compose up -d --build
#
# Stages:
#   ghdl        GHDL mcode backend built from source (not packaged for Alpine)
#   server-build  server/ -> server/dist, production node_modules only
#   page-build  the page -> dist/, with the public port baked in
#   backend     node + GHDL + Icarus Verilog, runs as 'hdlboard'   (target)
#   web         nginx: serves dist/ and proxies /hdlsim to backend (target)
#   render      backend + nginx in one container, for single-container hosts
#               such as Render.com (the default target: it is the last stage)

ARG ALPINE_VERSION=3.24

# --- GHDL -------------------------------------------------------------------
FROM alpine:${ALPINE_VERSION} AS ghdl
ARG GHDL_REF=master
RUN apk add --no-cache build-base gcc-gnat zlib-dev git
RUN git clone --depth 1 --branch "${GHDL_REF}" https://github.com/ghdl/ghdl /src/ghdl
WORKDIR /src/ghdl
RUN ./configure --prefix=/usr/local \
 && make -j"$(nproc)" \
 && make install DESTDIR=/out

# --- backend build ----------------------------------------------------------
# Lockfile first, so a source edit doesn't redo the npm install.
FROM alpine:${ALPINE_VERSION} AS server-build
RUN apk add --no-cache nodejs npm
WORKDIR /src/server
COPY server/package.json server/package-lock.json ./
RUN npm ci --no-fund --no-audit
COPY server/tsconfig.json ./
COPY server/src/ src/
RUN npm run build \
 && npm prune --omit=dev \
 && test -f dist/server.js

# --- page build -------------------------------------------------------------
FROM alpine:${ALPINE_VERSION} AS page-build
RUN apk add --no-cache nodejs npm
WORKDIR /src
COPY package.json package-lock.json ./
RUN npm ci --no-fund --no-audit
COPY index.html vite.config.ts vitest.config.ts tsconfig.json tsconfig.app.json tsconfig.node.json ./
COPY src/ src/
# Projects published with the page (docs/PROJECTS.md): copied into dist/ by the build.
COPY public/ public/
# The port the browser opens /hdlsim on. Empty = the page's own origin (and
# scheme: wss:// on https://), which is where nginx proxies /hdlsim — so the
# page works on any public port, behind TLS too. Declared after npm ci so
# changing it only redoes the build step.
ARG VITE_HDL_WS_PORT=
RUN VITE_HDL_WS_PORT=${VITE_HDL_WS_PORT} npm run build \
 && test -f dist/index.html

# --- backend ----------------------------------------------------------------
FROM alpine:${ALPINE_VERSION} AS backend
# libgnat + zlib: what the GHDL binary links against. iverilog brings vvp.
RUN apk add --no-cache nodejs iverilog libgnat zlib \
 && addgroup -S hdlboard \
 && adduser -S -D -H -h /srv/HDLBoard -s /sbin/nologin -G hdlboard hdlboard
COPY --from=ghdl /out/usr/local/ /usr/local/
COPY --from=server-build /src/server/package.json  /srv/HDLBoard/server/package.json
COPY --from=server-build /src/server/node_modules/ /srv/HDLBoard/server/node_modules/
COPY --from=server-build /src/server/dist/         /srv/HDLBoard/server/dist/
# The tier-2 installation check (HOSTING.md § 11), runnable inside the container:
#   docker compose exec backend node tools/verify-backend.mjs
COPY tools/verify-backend.mjs /srv/HDLBoard/tools/verify-backend.mjs
COPY tests/fixtures/          /srv/HDLBoard/tests/fixtures/

ENV GHDL_EXE=/usr/local/bin/ghdl \
    IVERILOG_EXE=/usr/bin/iverilog \
    VVP_EXE=/usr/bin/vvp \
    HDL_WS_PORT=9010 \
    HDL_MAX_SESSIONS=32

USER hdlboard
WORKDIR /srv/HDLBoard

# Build-time probe,verify that the hdlboard account can 
#actually run GHDL (VHDL) and Icarus Verilog. If either
# tool fails, the build aborts and the image is never tagged.
RUN <<'PROBE'
set -eu
d=$(mktemp -d); cd "$d"
cat > probe.vhdl <<'VHDL'
entity probe is end;
architecture a of probe is begin
  process begin report "hdlboard-probe-ok"; wait; end process;
end;
VHDL
"$GHDL_EXE" -a --std=08 probe.vhdl
"$GHDL_EXE" -e --std=08 probe
"$GHDL_EXE" -r --std=08 probe 2>&1 | grep -q hdlboard-probe-ok
# Icarus, the way server/src/verilog uses it: -tstub to read the top's ports
# (needs /usr/lib/ivl/stub.tgt), a normal compile, then vvp -n -i.
echo 'module probe(input a, output y); assign y = a; initial $display("hdlboard-probe-ok"); endmodule' > probe.v
"$IVERILOG_EXE" -Wno-timescale -I. -s probe -tstub -o probe.stub probe.v
test -s probe.stub
"$IVERILOG_EXE" -Wall -Wno-timescale -I. -s probe -o probe.vvp probe.v
"$VVP_EXE" -n -i probe.vvp | grep -q hdlboard-probe-ok
cd /; rm -rf "$d"
"$GHDL_EXE" --version | head -1
"$IVERILOG_EXE" -V 2>/dev/null | head -1
PROBE

EXPOSE 9010
CMD ["node", "server/dist/server.js"]

# --- web --------------------------------------------------------------------
FROM nginx:alpine AS web
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=page-build /src/dist/ /usr/share/nginx/html/
EXPOSE 80

# --- render -----------------------------------------------------------------
# Render (and hosts like it) builds the last stage and runs one container; it
# ignores docker-compose.yml. So nginx and the backend share this one, nginx on
# Render's default PORT (10000) proxying /hdlsim to 127.0.0.1:9010. Compose
# names its targets, so this stage never affects it.
FROM backend AS render
USER root
# tini replaces compose's `init: true`: it reaps ghdl/vvp children of a dead
# session. /run/nginx holds the pid file; logs go to Render's log stream.
# One nginx worker: `auto` starts one per core of the host, not of the
# instance's CPU share, and each costs memory the 512 MB budget needs.
RUN apk add --no-cache nginx tini \
 && mkdir -p /run/nginx \
 && ln -sf /dev/stdout /var/log/nginx/access.log \
 && ln -sf /dev/stderr /var/log/nginx/error.log \
 && sed -i 's/^worker_processes .*;/worker_processes 1;/' /etc/nginx/nginx.conf \
 && grep -q '^worker_processes 1;' /etc/nginx/nginx.conf
COPY docker/nginx.single.conf /etc/nginx/http.d/default.conf
COPY --from=page-build /src/dist/ /usr/share/nginx/html/
# Every ghdl, iverilog and vvp run goes through docker/simlimit.sh, which caps
# its memory at HDLBOARD_SIM_MEMORY_MB: one link per tool, the link's name
# picking the real one on PATH.
COPY --chmod=755 docker/simlimit.sh /usr/local/lib/hdlboard/simlimit.sh
RUN for tool in ghdl iverilog vvp; do ln -s simlimit.sh "/usr/local/lib/hdlboard/$tool"; done
# Sizing, measured on 512 MB and 0.1 CPU (Render Free):
# - CPU is the limit, not memory. A design on CLOCK_50 runs flat out, so the
#   running sessions share the fraction of a core: with 4 running, LEDs follow
#   a switch in about 0.5 s (median); with 8, about 1.5 s, and Start can take
#   10 s. Starter (0.5 CPU) keeps 8 sessions around 0.2 s.
# - Memory: about 130 MB for nginx, node and their page cache, then about
#   7 MB per typical session. The cap stops one design taking the rest: GHDL
#   needs about 350 bytes per std_logic bit, so 96 MB still holds an 8K x 32
#   RAM. Keep HDL_MAX_SESSIONS x HDLBOARD_SIM_MEMORY_MB under about 400.
# render.yaml sets the first two again; override them in the Render dashboard.
# HDL_MAX_SESSIONS, not the older GHDL_ name: the backend stage sets
# HDL_MAX_SESSIONS=32, and the new name is read first.
ENV HDL_MAX_SESSIONS=4 \
    HDLBOARD_SIM_MEMORY_MB=96 \
    GHDL_EXE=/usr/local/lib/hdlboard/ghdl \
    IVERILOG_EXE=/usr/local/lib/hdlboard/iverilog \
    VVP_EXE=/usr/local/lib/hdlboard/vvp
# Build-time probe of the capped tools: they still run a design, and the cap
# is really applied (1 MB is too little for GHDL even to start).
RUN <<'PROBE'
set -eu
d=$(mktemp -d); cd "$d"
cat > probe.vhdl <<'VHDL'
entity probe is end;
architecture a of probe is begin
  process begin report "hdlboard-probe-ok"; wait; end process;
end;
VHDL
"$GHDL_EXE" -a --std=08 probe.vhdl
"$GHDL_EXE" -e --std=08 probe
"$GHDL_EXE" -r --std=08 probe 2>&1 | grep -q hdlboard-probe-ok
if HDLBOARD_SIM_MEMORY_MB=1 "$GHDL_EXE" -r --std=08 probe > /dev/null 2>&1; then
  echo "simlimit.sh: the memory cap is not applied" >&2; exit 1
fi
echo 'module probe; initial $display("hdlboard-probe-ok"); endmodule' > probe.v
"$IVERILOG_EXE" -o probe.vvp probe.v
"$VVP_EXE" -n probe.vvp | grep -q hdlboard-probe-ok
cd /; rm -rf "$d"
PROBE
EXPOSE 10000
ENTRYPOINT ["/sbin/tini", "--"]
# The backend runs as hdlboard and is restarted if it exits; nginx is the
# container's main process.
CMD ["/bin/sh", "-c", "(while :; do su -s /bin/sh hdlboard -c 'node server/dist/server.js'; echo 'backend exited, restarting' >&2; sleep 1; done) & exec nginx -g 'daemon off;'"]
