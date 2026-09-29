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
# The port the browser opens ws://<host>:<port>/hdlsim on. With nginx proxying
# /hdlsim, that is the public page port — compose passes HDLBOARD_PAGE_PORT.
# Declared after npm ci so changing it only redoes the build step.
ARG VITE_HDL_WS_PORT=80
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
