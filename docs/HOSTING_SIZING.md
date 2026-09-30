# Hosting sizing — how many sessions a machine can serve

Recommended `HDL_MAX_SESSIONS` and per-simulation memory cap
(`HDLBOARD_SIM_MEMORY_MB`) for the machines HDLBoard has been sized for, how
those numbers were measured, and how to size a machine that is not listed.

> **Branches.** The Render.com deployment files — `render.yaml`, the
> `render` stage of `docker/Dockerfile` and the memory-cap script
> `docker/simlimit.sh` — live on the
> [`onrender`](https://github.com/rlangoy/HDLBoard/tree/onrender) branch.
> The sizing advice applies to any host.

- [Quick reference](#quick-reference)
- [Render.com Free](#rendercom-free)
- [Render.com Starter](#rendercom-starter)
- [Linode Nanode 1 GB](#linode-nanode-1-gb)
- [Sizing any other computer](#sizing-any-other-computer)
- [Turning on the memory cap outside the render image](#turning-on-the-memory-cap-outside-the-render-image)
- [How the numbers were measured](#how-the-numbers-were-measured)
- [Known issue: leaked `vvp` processes](#known-issue-leaked-vvp-processes)

---

## Quick reference

| Host | CPU | RAM | `HDL_MAX_SESSIONS` | `HDLBOARD_SIM_MEMORY_MB` | LED lag, all sessions running* |
|---|---|---|---|---|---|
| Render.com Free | 0.1 CPU | 512 MB | **4** | **96** | ~0.5 s |
| Render.com Starter | 0.5 CPU | 512 MB | **8** | **48** | ~0.2 s |
| Linode Nanode 1 GB | 1 shared vCPU (AMD EPYC 7713) | 1 GB + 512 MB swap | **12** | **32** | ~0.15–0.2 s |

\* Median time from flipping a switch to the LEDs following, with every
session running a design clocked by `CLOCK_50` (the worst case — such a design
runs as fast as the CPU allows). Designs on `CLOCK_500Hz` are paced to real
time and cost far less.

Two rules hold for every host:

1. **CPU decides the session count.** Memory for normal lab designs is small.
2. **Keep `HDL_MAX_SESSIONS` × `HDLBOARD_SIM_MEMORY_MB` under the memory left
   after the base load** (about 400 MB on a 512 MB machine), so that no mix of
   student designs can push the machine into swap or the OOM killer.

`HDL_MAX_SESSIONS` counts *open browser tabs* (WebSocket sessions), not only
running simulations. An idle tab costs no CPU, so real load is usually lower
than the worst case in the table.

---

## Render.com Free

**Plan:** 0.1 CPU, 512 MB RAM, spins down after 15 minutes idle.
**Deploy:** the `render` stage of `docker/Dockerfile`, via `render.yaml`
(both on the `onrender` branch).

```yaml
envVars:
  - key: HDL_MAX_SESSIONS
    value: "4"
  - key: HDLBOARD_SIM_MEMORY_MB
    value: "96"
```

These are the defaults in both `render.yaml` and the Dockerfile's render stage
on the `onrender` branch.

| Sessions running | LED lag (median / p90) | Time to start |
|---|---|---|
| 1 | 0.1 s / 0.2 s | ~0.7 s |
| 2 | 0.2 s / 0.3 s | ~1.2 s |
| **4** | **0.5–0.6 s / 1.1 s** | **2–3.5 s** |
| 8 | 1.1–1.6 s / 3.3 s | up to 11 s |

- Memory is not the limit: 8 sessions peaked at about 200 MB, 127 MB of it
  reclaimable page cache.
- The 96 MB cap stops a design at roughly 250 000 `std_logic` bits
  (an 8K × 32 RAM). Four capped designs at once peaked at 489 MB — under the
  limit. Without the cap, the same test filled the container and triggered the
  OOM killer.
- Cold start: the backend needs about 3 s to start at 0.1 CPU, on top of
  Render's own spin-up after an idle period.
- Fine for a demo or a small group; not for a full lab.

## Render.com Starter

**Plan:** 0.5 CPU, 512 MB RAM, always on. Set in the Render dashboard:

| Variable | Value |
|---|---|
| `HDL_MAX_SESSIONS` | `8` |
| `HDLBOARD_SIM_MEMORY_MB` | `48` |

| Sessions running | LED lag (median / p90) | Time to start |
|---|---|---|
| 4 | 0.1–0.2 s / 0.2 s | ~0.3 s |
| **8** | **0.2 s / 0.3–0.4 s** | **0.5–1.8 s** |

The cap drops to 48 MB because 8 × 48 = 384 MB still fits in the 512 MB
container. 48 MB holds about a 4K × 32 `std_logic` RAM.

## Linode Nanode 1 GB

**Machine:** 1 shared vCPU (AMD EPYC 7713), 961 MiB RAM, 511 MiB swap,
Ubuntu 24.04, native Linux. About 576 MiB was free before HDLBoard started.

| Variable | Value |
|---|---|
| `HDL_MAX_SESSIONS` | `12` |
| `HDLBOARD_SIM_MEMORY_MB` | `32` |

Estimated from the measurements above (not measured on the Nanode itself):
one full vCPU is about twice Render Starter, which served 8 sessions at
~0.2 s.

| `HDL_MAX_SESSIONS` | Expected LED lag, all running |
|---|---|
| 8 | ~0.1 s |
| **12** | **~0.15–0.2 s** |
| 16 | ~0.2–0.3 s, Start noticeably slower |

- 12 rather than 16 leaves headroom: a *shared* vCPU can lose time to other
  customers on the same host (CPU steal).
- Memory: about 130 MB base + ~7 MB per session ≈ 215 MB for 12 sessions.
- 12 × 32 MB = 384 MB, inside the ~576 MiB free. 32 MB holds about a
  2K × 32 `std_logic` RAM — every normal lab design needs under 10 MB. To allow
  larger RAMs, use 8 sessions and 48 MB instead.
- A native install has **no memory cap by default** — see
  [Turning on the memory cap](#turning-on-the-memory-cap-outside-the-render-image).
- Worth checking:
  - `ps aux --sort=-rss | head` — what already uses ~385 MiB of RAM.
  - `top` during a lab: if `st` (steal) is regularly above 10–20 %, drop to
    8 sessions.

---

## Sizing any other computer

Collect the hardware facts (read-only commands):

```bash
lscpu | grep -E 'Model name|^CPU\(s\)|Thread|Core|Socket|MHz'
free -h
nproc
cat /etc/os-release | grep PRETTY_NAME
uname -r
grep -qi microsoft /proc/version && echo "WSL" || echo "native Linux"
df -h /tmp
# If hosting with Docker:
docker info 2>/dev/null | grep -E 'CPUs|Total Memory|Cgroup Version'
```

Then:

1. **Sessions from CPU.** On a modern server core (~2.8 GHz Xeon or EPYC
   class), budget about **16 running sessions per full core** for ~0.2 s lag,
   or ~8 per core for ~0.1 s. Count physical cores, not hyperthreads, and
   subtract a little for anything else the machine runs. For a shared cloud
   vCPU, take about 75 % of that.
2. **Memory check.** Base load is about 130 MB (Node, nginx, page cache) plus
   about 7 MB per session. Use the RAM that is *free* before HDLBoard starts.
3. **Choose the cap.** `HDLBOARD_SIM_MEMORY_MB` ≈ (free RAM − base load −
   some margin) ÷ `HDL_MAX_SESSIONS`. Anything from 16 MB up runs every
   normal lab design. GHDL needs about **350 bytes per `std_logic` bit** of a
   signal; Icarus Verilog stores memories far more compactly.
4. **Disk.** Sessions write small files under the system temp directory; a
   few hundred MB free is plenty.

For a CPU that is not a server-class core, compare its single-core speed with
a ~2.8 GHz Xeon, or ask for a quick benchmark run.

---

## Turning on the memory cap outside the render image

The cap (`docker/simlimit.sh`, on the `onrender` branch) is built into the
Dockerfile's `render` stage only. A native install (and the compose `backend` service) runs without one.
To add it on a Linux host:

```bash
# from a checkout of the onrender branch
sudo mkdir -p /usr/local/lib/hdlboard
sudo cp docker/simlimit.sh /usr/local/lib/hdlboard/
sudo chmod 755 /usr/local/lib/hdlboard/simlimit.sh
for t in ghdl iverilog vvp; do sudo ln -sf simlimit.sh /usr/local/lib/hdlboard/$t; done
```

and start the backend with:

```bash
HDL_MAX_SESSIONS=12
HDLBOARD_SIM_MEMORY_MB=32
GHDL_EXE=/usr/local/lib/hdlboard/ghdl
IVERILOG_EXE=/usr/local/lib/hdlboard/iverilog
VVP_EXE=/usr/local/lib/hdlboard/vvp
```

The links' directory must **not** be on `PATH`: the script finds the real
`ghdl`, `iverilog` and `vvp` by name on `PATH`.

When a design exceeds the cap, GHDL stops without a message of its own; the
`onrender` backend then tells the student the simulation may have run out of
memory and what the per-simulation limit is (on `main` the message is only
"Simulation exited unexpectedly.").

---

## How the numbers were measured

- A 512 MB, no-swap memory cgroup with a CPU quota of 0.1 or 0.5 CPU,
  reproducing Render's container limits, running nginx (one worker, the
  `render` stage's `nginx.single.conf`) and the backend together.
- GHDL 6.0.0 (mcode, built from source) and Icarus Verilog 12, on a 2.8 GHz
  Intel Xeon core.
- Load: N browser-like WebSocket clients running the repository's fixtures
  (`tests/fixtures/`), flipping the switches once a second and timing how long
  the LEDs took to follow; plus `tools/verify-backend.mjs`.
- Memory: the cgroup's own peak counter (`memory.max_usage_in_bytes`; on
  cgroup v2, `memory.peak`), which the kernel updates on every allocation — no
  sampling gaps.
- GHDL signal cost: 64K × 32 `std_logic` RAM ≈ 690 MB; 16K × 32 ≈ 180 MB;
  4K × 32 ≈ 52 MB.

To check memory on a running Docker deployment:

```bash
docker compose exec backend cat /sys/fs/cgroup/memory.peak     # highest ever, bytes
docker compose exec backend cat /sys/fs/cgroup/memory.current  # now
docker compose exec backend grep oom_kill /sys/fs/cgroup/memory.events
```

---

## Known issue: leaked `vvp` processes

Stopping, resetting or closing the tab of a *Verilog* design that runs on
`CLOCK_500Hz` (paced to real time) can leave its `vvp` process running. `vvp`
catches SIGTERM while it is blocked reading its pacing input on stdin, and the
backend keeps that pipe open, so it never exits. Each leak holds a few MB until
the backend restarts; it uses no CPU.

Until this is fixed (closing the child's stdin in `kill()` in
`server/src/runtime.ts` resolves it), check with `pgrep -a vvp` and restart the
backend if leaks build up. Render Free's spin-down after idle clears them on
its own.
