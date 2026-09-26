# Verilog Backend — Implementation Plan

> Licensed under the [GNU General Public License v2.0](../LICENSE).

**Status: researched and spiked, not implemented — 2026-09-26.** Nothing in
`src/`, `server/` or `winInstaller/` has been changed by this document. Every
"measured" claim below was run on the development machine (Windows 11 Pro
10.0.26200, x64) against real Icarus Verilog binaries, not read out of
documentation; § 4 is the record. Where something could only be read, or was
not tested, the text says so.

The end state this plan describes: a student drops or uploads a `.v` file,
it lands in a new **`verilog/`** folder, and when a file in that folder is the
selected top-level file, **Start** compiles and simulates it with a real
Verilog simulator instead of GHDL — driving the same board (switches, keys,
LEDs, 7-segment displays) and writing the simulator's own messages to the
same console. The frontend change is deliberately tiny; the work is in the
backend and the installer.

Same conventions as [`ghdl_implementation_plan.md`](ghdl_implementation_plan.md):
that document is the as-built reference for everything this one reuses (the
wire protocol § 6, the persistent-process design § 5, real-time pacing
§ 5.9/5.13, the Windows stdin pacing § 5.15). This one only describes what is
*different* for Verilog.

## Contents

- [0. Summary and recommendation](#0-summary-and-recommendation)
- [1. Requirements and non-goals](#1-requirements-and-non-goals)
- [2. Simulator evaluation](#2-simulator-evaluation)
- [3. Licensing and redistribution](#3-licensing-and-redistribution)
- [4. Spike results — what was measured](#4-spike-results--what-was-measured)
- [5. Design](#5-design)
- [6. Frontend changes](#6-frontend-changes)
- [7. Backend changes](#7-backend-changes)
- [8. Windows packaging](#8-windows-packaging)
- [9. Linux / server mode](#9-linux--server-mode)
- [10. Testing and verification](#10-testing-and-verification)
- [11. Security](#11-security)
- [12. Open decisions](#12-open-decisions)
- [13. Phased roadmap with acceptance criteria](#13-phased-roadmap-with-acceptance-criteria)
- [Appendix A: the verified testbench shape](#appendix-a-the-verified-testbench-shape)
- [Appendix B: real simulator output](#appendix-b-real-simulator-output)
- [Appendix C: sources](#appendix-c-sources)

---

## 0. Summary and recommendation

**Use Icarus Verilog 13.0** (`iverilog` to compile, `vvp` to run), bundled
into the Windows installer the same way GHDL is.

Why, in one paragraph each:

- **Mature.** Icarus is the long-standing open-source Verilog simulator
  (IEEE 1364 in full, a growing subset of SystemVerilog). 13.0 was released
  as *stable* on 2026-03-02 and the repository was still receiving commits on
  the day of writing. Debian stable ships 12.0, Debian testing and Alpine
  edge ship 13.0.
- **As easy to integrate as GHDL — in practice easier.** It is two small
  command-line programs with the same shape as GHDL's: compile, then run,
  diagnostics on stderr, `$display` on stdout. It needs no C++ compiler, no
  Perl, no MSYS2 at run time, and the compile step took 60–105 ms in the
  spike. It reads the testbench's file polling and blocking stdin reads
  exactly as the existing pacing design needs (§ 4).
- **Compatible licence.** GPL-2.0-or-later, the same family as GHDL and as
  HDLBoard itself (GPL-2.0-only). Separate programs launched with `spawn`, as
  GHDL already is. § 3 lists every file that would ship and its licence.
- **Small.** About 12 MB on disk, ~2.2 MB compressed: the installer would
  grow from 88.7 MB to roughly 91 MB.

The other candidates were evaluated in § 2 and rejected for concrete reasons:
**Verilator** needs a C++ toolchain and GNU Make on the student's machine and
has no official Windows binaries; **Yosys** is a synthesis tool that ships no
Windows binary outside a 600 MB suite; **CVC / GPL Cver** are old or
under a non-GPL licence; the commercial simulators cannot be redistributed.

### The traps found by actually running it

Each of these silently produces a *working-looking* build that fails on a
student's machine, so each gets a check in the plan (§ 10):

1. **stdout is block-buffered through a pipe.** Without `vvp -i`, a design's
   `$display` output never reaches the console while it runs — not even the
   time-0 message. `-i` (unbuffered) fixes it. (§ 4, S4)
2. **The runtime DLLs must sit next to `ivl.exe` too.** `iverilog.exe` launches
   `lib/ivl/ivl.exe`; copying the DLLs only into `bin/` gives
   `STATUS_DLL_NOT_FOUND` (exit `-1073741515`) unless `bin/` happens to be on
   `PATH`. (§ 4, S2)
3. **Absolute file names fail silently in a non-ASCII directory.** With
   `+input_file=C:\Users\Rune Langøy\…` the simulation runs but reads and
   writes nothing. Relative names with `cwd` set to the session directory
   work. Windows user names like *Langøy* are real. (§ 4, S11)
4. **Do not trim the `.vpi` files.** `iverilog.exe` has a fixed list of
   modules it loads on every compile (`system`, `vhdl_sys`, `vhdl_textio`,
   `va_math`, `v2005_math`, `v2009` — the names are compiled into the
   executable). Removing four of them from `lib/ivl/` made every compile print
   `error: Failed to open '…system.vpi'` while still exiting 0. (§ 4, S2)
5. **`$stop` ends the run with exit 0** under `-n`. The persistent-run exit
   handler currently only reports non-zero exits, so the UI would stay on
   "running" forever. (§ 4, S9, § 7.5)
6. **A file without `` `timescale `` runs at 1 s/1 s**, not nanoseconds, and
   inherits from the *previous* file in compile order. (§ 5.4)

### Assumptions to confirm (change these and the plan barely changes)

| # | Assumption | Where |
|---|---|---|
| A1 | "When files in the Verilog folder are *activated*" means: the file marked as top with the existing blue dot (click to set) — the engine is chosen by that file's folder. No new UI. | § 6.2 |
| A2 | The folder is displayed as `verilog/`, matching the existing `vhdl/` and `work/` (lower case with a trailing slash). | § 6.1 |
| A3 | Every Verilog file goes to `verilog/`, including `tb_*.v`. (Today `tb_*` VHDL goes to `work/`, whose files are never sent to a simulator.) | § 12 #3 |
| A4 | Scope is Verilog (`.v`, plus `.vh` include files). SystemVerilog (`.sv`) is not accepted in the first cut. | § 12 #1 |

---

## 1. Requirements and non-goals

Taken from the request:

| Requirement | Addressed by |
|---|---|
| Research which simulator to embed; maturity, ease of integration (like GHDL), licence for distribution, Windows binary in the installer | § 2, § 3, § 8 |
| Frontend: Verilog files go in a new **Verilog** folder (the VHDL folder already exists), when uploaded or dropped | § 6.1, § 6.3 |
| Frontend: when a Verilog-folder file is activated, use the Verilog simulator, not GHDL | § 5.1, § 6.2 |
| Minimum UI changes | § 6 — no new component, no new control, no protocol change |
| The terminal shows the simulator's own output messages, as it does for GHDL (not the same text — the simulator's) | § 5.5 |
| A new file `Verilog_implementation_plan.md` in `docs/` | this file |

**Non-goals** (each is a separate decision if wanted later):

- SystemVerilog (`.sv`) — § 12 #1.
- Verilog syntax highlighting in the editor — § 12 #6. Until then a `.v` file
  is highlighted by the VHDL tokenizer (`vhdlHighlight.ts`), which will
  colour it oddly (e.g. `--` is a comment there, `//` is not).
- Waveform capture (also out of scope for GHDL, `ghdl_implementation_plan.md`
  § 12 #5).
- Mixed-language projects (a VHDL top instantiating a Verilog module or the
  reverse). One run = one language. § 12 #4.
- A synthesis check (Yosys). § 2.3 notes why it is not the simulator, and
  § 12 #8 leaves the door open.

---

## 2. Simulator evaluation

### 2.1 Criteria

The three the request names, plus the two that decide whether the
*existing architecture* survives:

1. **Maturity** — years in use, release cadence, language coverage.
2. **Ease of integration, "like GHDL"** — one process to spawn, diagnostics on
   stderr, no toolchain the student must own.
3. **Licence** — may it be redistributed inside a GPL-2.0-only installer.
4. **Distributable as a Windows binary** — obtainable reproducibly, pinned,
   small, and relocatable (runs from wherever the installer put it).
5. **Fits the interactive model.** `ghdl_implementation_plan.md` § 5 settled on
   *one persistent free-running process* that polls an input file, publishes
   outputs to a file, and is held to real time by blocking reads. A candidate
   must be able to do all three, and be stoppable by killing it.

### 2.2 Comparison

| | Icarus Verilog | Verilator | Yosys (`sim`) | CVC / GPL Cver | ModelSim / Questa / Vivado xsim |
|---|---|---|---|---|---|
| Kind | Event-driven interpreter (compile to bytecode, `vvp` runs it) | Compiles Verilog to C++, then builds it | Synthesis suite; a `sim` pass simulates the netlist | Older interpreters | Commercial |
| Licence | GPL-2.0-or-later (verified in source headers and package metadata) | LGPL-3.0 **or** Artistic-2.0 | ISC | CVC: "modified Artistic"; Cver: GPL | Proprietary |
| Maturity | Decades; 13.0 stable 2026-03-02; active | Very mature, very fast, very active (5.052 docs) | Very active (v0.69, 2026-09-09) | Little evidence of recent maintenance | Very mature |
| Windows binary | Yes — MSYS2 package (13.0), bleyer.org installer (12.0 / a v14 snapshot); **no v13 Windows installer on bleyer.org** | None mentioned in the install guide, which describes building from source; needs Make + a C++ compiler | Releases carry a source tarball only; ready-made Windows builds come via the OSS CAD Suite (≈ 600 MB) | Not investigated further | Vendor installers |
| Toolchain needed on the student's PC | None | C++ compiler + GNU Make, on every run | None once packaged | — | Licence server / vendor install |
| Run-time model | 4-state, event-driven, real `#` delays, `$fopen`/`$fscanf`/`$fgets` | 2-state by default (4-state is "experimental, for developer use only"); C++ build per design | Netlist simulation, not a testbench-process model | — | — |
| Fit to § 2.1 #5 | **Verified (§ 4)** | Would need a C++ build on every Start | Not a live testbench model | — | Not redistributable |
| Verdict | **Recommended** | Rejected | Rejected as simulator; possible later lint/synth aid | Rejected | Rejected |

### 2.3 Notes per candidate

**Icarus Verilog.** README: "compile ALL of the Verilog HDL, as described in
the IEEE 1364 standard", plus "a (slowly growing) subset of the SystemVerilog
language". Default language generation is IEEE 1364-2005 (per the `iverilog`
man page); `-g2012` turns on the SystemVerilog subset. A `.sv` extension
does **not** switch it on by itself (tested: `always_comb`/`logic` in a `.sv`
file is a syntax error without `-g2012`). Verified working on 13.0 and 12.0.

**Verilator.** A different product: it turns Verilog into C++ and needs
`make` and a C++ compiler at build time; `--binary` is documented as an alias
for `--main --exe --build --timing`, and `--build` "requires GNU Make". Its
install guide lists Windows as tested with MSVC and built under
Cygwin/MinGW/WSL2, and mentions no prebuilt Windows binary. Two-state by
default. Excellent for large,
synthesizable designs — the wrong shape for "type code, press Start, see the
LED", where a per-run C++ build would turn a 100 ms compile into many
seconds and would put a C++ toolchain on every student's machine. It does
have a `--lint-only` mode that would make a good *optional* checker later; it
is not the simulator.

**Yosys.** ISC-licensed, excellent, and the natural home for a "synthesis
check" (the request mentions "synth"). But its releases carry only a source
tarball, and Windows binaries come from the OSS CAD Suite
(`oss-cad-suite-windows-x64-20260926.tgz`, ≈ 600 MB, of which Icarus would be
a few MB). Its `sim` command is documented as simulating the circuit with
waveform (VCD/FST) output; I did not spike it and do not expect it to host a
live, file-polling, stdin-paced testbench. Not a candidate for the
*simulator*; § 12 #8 keeps it as a possible later addition.

**CVC / GPL Cver.** OSS CVC is under a "modified Artistic" licence; GPL Cver
is a Verilog-1995 plus partial-2001 interpreter. I found no evidence of
recent maintenance for either and did not spike them.

**Commercial (ModelSim/Questa Intel FPGA, Vivado xsim).** Free-to-download is
not free-to-redistribute; these would each need a per-student install and a
licence check, which is the opposite of "the installer contains everything".

### 2.4 Version: 13.0

13.0 is the current stable. 12.0 (what Debian stable ships) was also tested
end-to-end with the same testbench, `-i` flag and diagnostics format and
behaves identically for everything in § 4, so the generated code has no
13-only dependence and a Linux server on 12.0 works. `bleyer.org` lists
`v14-20260804` (a development snapshot of master) — not recommended for a
course tool. The Windows binaries come from MSYS2's `ucrt64` package, the
same toolchain family as the vendored GHDL (`ghdl-mcode-5.0.1-ucrt64.zip`),
so both target the Windows 10+ system C runtime and nothing extra is needed
on a student's machine.

---

## 3. Licensing and redistribution

Not legal advice — the reasoning below is the same reasoning that already
covers GHDL in `winInstaller/electron/build/license.txt`.

### 3.1 What would ship

Licences below are the `license` field of the exact pinned MSYS2 packages
(§ 8.2), except where noted.

| Component | Files | Licence |
|---|---|---|
| Icarus Verilog 13.0 | `iverilog.exe`, `vvp.exe`, `ivl.exe`, `ivlpp.exe`, `*.vpi`, `*.tgt`, `*.conf` | GPL-2.0-or-later. Source-file headers read "either version 2 of the License, or (at your option) any later version" (checked in `vvp/main.cc`, `vpi_user.h`, `ivl_target.h` at tag `v13_0`). |
| GNU Readline 8.3 | `libreadline8.dll`, `libhistory8.dll` | **GPL-3.0-or-later** (linked by `vvp.exe` for its interactive prompt) |
| termcap 1.3.1 | `libtermcap-0.dll` | GPL / LGPL |
| GCC runtime | `libgcc_s_seh-1.dll`, `libstdc++-6.dll` | GPL-3.0-or-later **with GCC Runtime Library Exception 3.1** |
| winpthreads | `libwinpthread-1.dll` | MIT AND BSD-3-Clause-Clear |
| zlib | `zlib1.dll` | Zlib |
| bzip2 | `libbz2-1.dll` | bzip2 (custom, permissive) |

### 3.2 Why this is compatible with HDLBoard

- HDLBoard starts `iverilog.exe` and `vvp.exe` as **separate programs**
  through `spawn`, never linking them — the identical relationship it has
  with `ghdl.exe`, already accepted in `license.txt` ("They are separate
  works, distributed here only for convenience"). That is aggregation, not a
  combined work, so HDLBoard's GPL-2.0-only and the components' own licences
  do not have to be the same.
- The only GPL-3.0 piece, Readline, is linked *inside* `vvp.exe`. `vvp.exe`
  is GPL-2.0-or-later, and the "or later" clause is what lets that
  combination be distributed under GPL-3.0 — the ordinary situation for any
  GPL-2.0-or-later program that links Readline. How that is packaged is
  MSYS2's and Icarus's matter; it does not reach HDLBoard's own code,
  because of the process boundary. (I checked the licence fields, not how
  MSYS2 words the combined result — a reason for the not-legal-advice caveat
  at the top of this section.)
- HDLBoard's Node backend and frontend never load any of these libraries.

### 3.3 Obligations to meet when shipping

1. Add an **Icarus Verilog** section (and a line for the bundled runtime
   libraries) to `winInstaller/electron/build/license.txt`, in the same form
   as the GHDL section: version, copyright, licence, upstream URLs, "started
   as a separate program, not linked".
2. Install the licence texts: Icarus's `COPYING` (in the MSYS2 package at
   `share/licenses/iverilog/COPYING`) and the per-package licence folders,
   under `resources\iverilog\` — as `resources\ghdl\COPYING` is today.
3. `VERSION.txt` recording exact package versions and SHA-256s, like
   `vendor/ghdl/VERSION.txt`.
4. **Source availability.** MSYS2 publishes a matching source package for
   each binary — verified present:
   `https://repo.msys2.org/mingw/sources/mingw-w64-iverilog-1~13.0-2.src.tar.zst`
   (and `…readline-8.3.003-1…`, `…gcc-16.2.0-4…`), the recipe is
   `https://github.com/msys2/MINGW-packages/tree/master/mingw-w64-iverilog`,
   and upstream is `https://github.com/steveicarus/iverilog` at tag `v13_0`.
   `license.txt` should name these, as it names GHDL's tag.
5. The unsigned-installer caveat already documented for HDLBoard covers
   these binaries too. (The Icarus release notes themselves say Windows
   binaries "will be unsigned so Windows may have issues".)

---

## 4. Spike results — what was measured

All on the development machine, using the extracted MSYS2 `ucrt64` packages
(§ 8.2) with `PATH` reduced to `C:\Windows\System32` unless stated, from
`…\T Rune Langøy\iverilog\` — a path with a space and a non-ASCII letter on
purpose. The spike testbench is Appendix A; the harness was a Node script
that drives `vvp` exactly the way `session.ts` drives GHDL (spawn, stdin
grants, file polling).

| # | Question | Result |
|---|---|---|
| S1 | Does it run relocatably, with no install, no registry, no Cygwin? | **Yes**, once the DLLs are placed correctly (S2). `iverilog -V` → `Icarus Verilog version 13.0 (stable) (v13_0)`. |
| S2 | What DLLs, where? | `iverilog.exe` spawns `lib/ivl/ivl.exe`, and `ivl.exe` loads `system.vpi`; Windows resolves their imports from the *loading executable's own directory*. With DLLs only in `bin/`: `STATUS_DLL_NOT_FOUND` (`-1073741515`), and with `zlib1.dll`/`libbz2-1.dll` missing from `lib/ivl/`: `Failed to open '…system.vpi'` yet exit 0. **Fix: the full set beside both `vvp.exe` and `ivl.exe`** (≈ 3 MB duplicated, ≈ 1 MB compressed), or prepend `bin/` to the child's `PATH`. Also: the default `.vpi` module names (`system`, `vhdl_sys`, `vhdl_textio`, `va_math`, `v2005_math`, `v2009`) are baked into `iverilog.exe` (found by scanning its strings; `vvp.conf` is only four lines and does not list them) — keep every `.vpi`. |
| S3 | Speed | Compile (`iverilog -Wall -s … tb.v design.v`): **65–105 ms** warm, ≈ 280 ms cold. `vvp` start-up ≈ 100 ms. No comparison to GHDL's `-a`+`-e` was made. |
| S4 | Does `$display` reach the console live? | **No, not by default.** Through a pipe `vvp` block-buffers: with `-n` alone, `design says hi at 0` never arrived in 3.5 s. With **`vvp -n -i`** it arrived at 0.02 s and every later line within a few ms of when it was printed. `-i` is documented as "makes all stdout output unbuffered". (`$fflush` in the testbench also works, but `-i` needs no cooperation from student code.) |
| S5 | Does the stdin pacing design work? | **Yes.** The testbench blocks in `$fgets(line, 32'h8000_0000)` (Verilog's stdin descriptor) once per 20 ms of simulated time; the harness writes one line per 20 ms of real time. A clockless design with a 250 ms blink: **3520 ms simulated in 3517 ms real**, one blink every ≈ 250 ms real. Same design with 100 000 grants pre-loaded (no pacing): **≈ 74 s simulated in 4 s real (~18×)** — so the blocking read is what holds it to real time. |
| S6 | Throughput with a 50 MHz clock | ≈ **60 ms simulated in 4 s real (0.015×)**. Slow motion, as with GHDL (`ghdl_implementation_plan.md` § 5.5 reports ≈ 0.0015× for GHDL mcode on a different design/machine — **not a like-for-like comparison**). Same constraint, same `CLOCK_500Hz` remedy. |
| S7 | Input queue round trip | Queue file written at 1.08 s: applied and acknowledged (`<bits> 1`) in the very next output — within one 20–30 ms poll. Reading `input.txt` with `$fopen`/`$fscanf("%d %b")` per poll works. |
| S8 | Diagnostics format | On **stderr**, `file:line: error: …` / `warning: …`; exit 2 on error. Real examples in Appendix B. `-Wall` adds useful port-width warnings ("Port 2 (b) of module w expects 4 bit(s), given 10."). |
| S9 | `$stop`, `$finish`, `$fatal` | `vvp -n`: `$stop` prints `file:line: $stop called at 5 (1s)` and **exits 0**; `$finish` prints `file:line: $finish called at 200000 (1ps)` (stdout) and exits 0; `$fatal` prints `FATAL: file:line: boom` / `Time: 5  Scope: rt` and **exits 1**. (`-N` would make `$stop` exit 1.) |
| S10 | Can Icarus report a module's ports itself? | Yes: `iverilog -tstub -s Top …` lists each root-module port with direction, width and exact case for ANSI and old-style headers. It is a debug dump, not a stable interface, so § 7.2 uses a source scanner and keeps this only as a cross-check. |
| S11 | Non-ASCII directory | **Absolute** `+input_file=<path with ø>` etc.: the simulation ran but no output/heartbeat file was ever produced — **silent failure**. **Relative** names with `cwd` = that directory: fine (`0000000101 1` acked, 3520 ms simulated). |
| S12 | 12.0 vs 13.0 | Same testbench, same `-n -i`, same error format, same result on 12.0 (stable in Debian). |
| S13 | Default language | IEEE 1364-2005. `.sv` is not auto-detected. |
| S14 | Can the build machine unpack `.pkg.tar.zst` without extra tools? | Yes: Windows' built-in `System32\tar.exe` (bsdtar 3.8.8, libzstd 1.5.7) extracts them. 7-Zip 25.01 also does (two-step). |
| S15 | Can a design run shell commands? | No: `$system(...)` → `Error: System task/function $system() is not defined by any module` and the program is not runnable. |
| S16 | Size | The trimmed tree used in the spike (30 files, without the `*-s.conf` target variants the § 8.2 deny-list would keep — a few KB): ≈ 12 MB on disk, **2.2 MB** with LZMA2 (7-Zip `-mx=9`). Current installer 88.7 MB. |
| S17 | Timescale inheritance (§ 5.4) | Tested with `$printtimescale`: a file with no directive reports `1s / 1s` when compiled first, and `1ns / 1ps` when compiled after a file that has one. |
| S18 | Where does `$finish`'s message go? | **stdout** (`fin.v:1: $finish called at 5 (1s)` appeared with stderr discarded and not with stdout discarded), so it flows into `LOG` with the student's own output. |

**Not measured:** Linux (POSIX) behaviour of the stdin pacing — Windows
stdin is a pipe like the one used here, and POSIX pipes block the same way,
but § 10 makes it a gate. The interactive latency of a real *browser* click
through the full stack (the spike stopped at the file protocol). A student
machine with real-time antivirus. The behaviour of very large designs.

---

## 5. Design

### 5.1 Engine selection — no protocol change

The existing `RUN` frame already carries the top file's name
(`RUN <topFile>` + `@@FILE …@@` sections). **The backend picks the engine from
the top file's extension**: `.v` → Verilog, `.vhd`/`.vhdl` → GHDL. Nothing in
`server/src/protocol.ts` or `ghdlClient.ts`'s framing changes and
`PROTOCOL_VERSION` stays `'1'`.

The frontend's only job is to send the *right files*: those in the top file's
folder (§ 6.4). That is also what makes "`verilog/` file selected → Verilog
simulator" hold without any explicit "language" field. If the top file is
missing (nothing marked), the backend keeps today's behaviour: VHDL.

If the files sent are not all the top file's language (only possible through a
rename that changed an extension without moving the file — § 6.5 closes it),
the backend reports it as a clear `ERROR analyze` rather than guess.

### 5.2 The board contract for Verilog

Same board, same names — `ghdl_implementation_plan.md` § 3.2 — so a design
can be moved between languages by translating, not re-wiring:

| Port | Direction | Width | Notes |
|---|---|---|---|
| `CLOCK_50` | in | 1 | 20 ns period, generated only if the module declares it |
| `CLOCK_500Hz` | in | 1 | simulator-only convenience, 2 ms period, always generated |
| `SW` | in | 10 | |
| `KEY_N` | in | 4 | active low |
| `LEDR` | out | 10 | |
| `HEX0_N` … `HEX5_N` | out | 7 each | active low |

- **Matching is case-insensitive; connection uses the declared spelling.**
  Verilog identifiers are case-sensitive and VHDL's are not; a module that
  declares `Clock_50` or `key_n` should not fail to elaborate over
  capitalisation when the VHDL equivalent would not. The port scanner records
  the name as written and the generated instance connects by that exact
  spelling (`.Clock_50(clk_sig)`).
- Only ports the module declares are connected; each undeclared output is
  tied to its electrically "off" value (`LEDR` `0`, `HEX*` `7'h7F`) so it
  reads blank, exactly as the VHDL testbench's defaults do.
- **`rst` is not supported** (open decision § 12 #5). In VHDL it exists only
  as legacy tolerance for older files; there is no legacy Verilog.
- A width mismatch is Icarus's usual *warning* (padded/truncated), shown in
  the console — not an error — see Appendix B.
- **Terasic's own names** (`KEY`, `HEX0`, …) are not the course's names
  (`KEY_N`, `HEX0_N`); same as VHDL, a course convention, not new here.

### 5.3 Run modes — same two as VHDL

| | Trigger | What runs |
|---|---|---|
| **board** | The top module has at least one port | Generated `hdl_board_tb` wraps it; one persistent `vvp` for the life of the session, polling `input.txt`, publishing `output.txt`, paced from stdin. Identical protocol to today: `READY`, `STATE`, `STIM`, `RESET`, `STOP`. |
| **batch** | The top module has **no** ports (a self-contained testbench) | No wrapper. `iverilog -s <top>`, `vvp -n -i`, bounded by `BATCH_TIMEOUT_MS` (60 s). Ends with `DONE completed`. |

### 5.4 The compile pipeline

One invocation, in the session's temp directory (`cwd`), with **relative
names throughout** (S11):

```
iverilog -Wall -I. -s <top> -o sim.vvp  _hdlboard_ts.v  [hdl_board_tb.v]  <student .v files, submitted order>
vvp -n -i sim.vvp +input_file=input.txt +output_file=output.txt
                  +heartbeat_file=heartbeat-N.txt +poll_interval_ns=… +min_dwell_ns=…
```

- `-s hdl_board_tb` in board mode (the student's module is reached by
  instantiation); `-s <top>` in batch mode.
- **Timescale.** A file without `` `timescale `` runs at the default 1 s unit
  and inherits from whatever file was compiled *before* it. So the backend
  writes `_hdlboard_ts.v` containing only `` `timescale 1ns/1ps `` and passes
  it **first**; the generated wrapper carries its own directive as well. Files
  that specify a timescale keep it (and, being Verilog, pass it on to later
  files — a known language quirk; documented, not fought). Both halves of
  this were tested (S17).
- The first line of every `sim.vvp` is `#! /ucrt64/bin/vvp` — the path baked
  in at MSYS2 build time (`vvp.conf`'s `VVP_EXECUTABLE`). It is harmless
  because HDLBoard always runs `vvp.exe` explicitly and never executes the
  `.vvp` file directly.
- **`-Wall`** on: the request is that the console shows the simulator's own
  messages. Its noise level on typical student designs should be checked in
  Phase 2 (§ 13); dropping to `-Wall -Wno-…` is a one-line change.
- `.vh` include files are written to the directory (so `` `include "x.vh" ``
  resolves through `-I.`) but not listed as compile units.
- The compile step is bounded by `BUILD_TIMEOUT_MS` (30 s), as `ghdl -a` is.
- **No fixed-point ordering loop** (§ 7.2 of the GHDL plan needed one because
  `ghdl -a` is order-sensitive per file). Verilog resolves module references
  across all files in one `iverilog` run, so one invocation is enough.

### 5.5 What the console shows

The request: show the simulator's own messages, as GHDL's are. Mapping, every
row of which is real output (Appendix B):

| Source | Goes to | Notes |
|---|---|---|
| `iverilog -V`, first line | `LOG` at run start | e.g. `Icarus Verilog version 13.0 (stable) (v13_0)` — read from the binary, not hard-coded. (The GHDL path hard-codes `'GHDL 5.0.1 (mcode)'` at `session.ts:289`; Verilog should not repeat that.) |
| `iverilog` stderr on **success** (warnings) | `LOG`, line by line, verbatim | The GHDL path discards `ghdl -a` warnings on success. Verilog keeps them: they are the simulator's messages and the request is to show them. |
| `iverilog` stderr on **failure** | `ERROR analyze` (or `elaborate`, see below), verbatim | `file:line: error: …`, exit 2. |
| `vvp` stdout, each line | `LOG`, verbatim, blank lines dropped | Includes the student's `$display`/`$write`/`$monitor` and the simulator's own `…: $finish called at 200000 (1ps)` / `…: $stop called at …` lines. |
| `vvp` stderr + non-zero exit | `ERROR runtime` | `$fatal` → exit 1 with `FATAL: …` |
| `vvp` exit 0 in batch mode | `DONE completed` | |
| `vvp` exit 0 in board mode | `DONE completed` | New: today the handler is silent (§ 7.5). A `$finish` in the design ends the run. |

`stage` for compile failures: `elaborate` when the text contains
`error(s) during elaboration` or `Unable to find the root module`,
otherwise `analyze`. Icarus does both in one step, so the split is a
cosmetic mapping onto the two stages the frontend already prints
(`"<stage> error:\n<text>"`).

### 5.6 Board mode: what differs from VHDL

Everything engine-independent — the stimulus queue and its acknowledgements
(`writeStimQueue`, `pollOutput`), the 20 ms `PACING_STEP_MS`, the poll
intervals (10 µs with `CLOCK_50`, 1 ms without), the heartbeat, `RESET`,
`STOP`, teardown — is reused unchanged, because the *files and the pacing
grant* are the interface. The Verilog testbench (Appendix A) writes the same
`input.txt` grammar, the same `output.txt` (`<52 bits> <seq>`), and the same
heartbeat number.

Differences:

- **Generics → plusargs.** GHDL takes `-ginput_file=…`; Verilog takes
  `+input_file=…` read with `$value$plusargs`. No recompile per run — as with
  GHDL generics.
- **Pacing is stdin on every platform.** `session.ts` chooses
  `PACING = win32 ? 'stdin' : 'fifo'`. The Verilog engine always uses the
  stdin mechanism (`startStdinPacing`, `grantPacing`) — no `mkfifo`, no named
  pipe, one less platform split. Verified on Windows (S5); Linux is a gate.
- **`X`/`Z`.** Verilog prints unknown/high-impedance bits as `x`/`z`. The
  wire protocol's `STATE` allows `0`/`1`/`X`, so `pollOutput` normalises
  `[xXzZ]` → `X` before its length check (a one-line change that is a no-op
  for VHDL output).
- **Truncated reads.** As with GHDL's testbench, the output file is opened,
  written and closed on each change; a reader can catch it empty. `pollOutput`
  already ignores anything that is not exactly 52 bits (seen in the spike as
  blank reads; harmless).

---

## 6. Frontend changes

Deliberately minimal: no new component, prop, dialog or wire field. Line
numbers are at commit `2a630bf`.

### 6.1 The folder

`src/components/workbench/files.ts:14`

```ts
folder: 'vhdl' | 'verilog' | 'work';
```

`src/components/workbench/FileExplorer.tsx:25`

```ts
const FOLDER_ORDER: VhdlFile['folder'][] = ['vhdl', 'verilog', 'work'];
```

The folder label is already `{folder}/` (`:154`), so it renders `verilog/`
with no other change. A folder with no files is not drawn (`:142`), so the
starter project looks exactly as it does today — no empty `verilog/`.

### 6.2 "Activating" a Verilog file (assumption A1)

The existing control is the blue **top-file dot**, currently shown only for
`vhdl/` rows (`FileExplorer.tsx:163`, and the two `--has-top-dot` classes at
`:184`/`:205` that reserve its space). Show it for `verilog/` rows too:

```tsx
const hasTopDot = folder === 'vhdl' || folder === 'verilog';
```

and use `hasTopDot` in those three places (and update the comment at `:20`,
`:28`). One project-wide `topFileId` stays — so exactly one file is top, and
choosing a Verilog file makes the VHDL dot grey and vice versa. The engine
follows the top file's folder (§ 5.1, § 6.4). `SimulationCard` already prints
the top file's name.

If "activated" was meant as "the file in the *active editor tab*" rather than
the top dot, say so — it is a different (also small) change to
`handleStart`, and the top-dot approach would then be redundant. The
trade-off: the tab-based rule makes Start's behaviour depend on which tab
happens to be open, while the top file is already the concept the UI teaches.

### 6.3 Upload and drop routing

`src/components/workbench/Workbench.tsx:439-452` (`readAndAddFiles`, shared
by the picker and drag-and-drop):

```ts
const VHDL_EXT    = /\.(vhdl?|vhd)$/i;
const VERILOG_EXT = /\.(vh?)$/i;                    // .v and .vh

for (const file of incoming) {
  const isVhdl = VHDL_EXT.test(file.name);
  const isVerilog = VERILOG_EXT.test(file.name);
  if (!isVhdl && !isVerilog) {
    appendLog(`Skipped ${file.name}: not a .vhd/.vhdl/.v file.`, 'error');
    continue;
  }
  const reader = new FileReader();
  reader.onload = () => {
    const folder: VhdlFile['folder'] = isVerilog
      ? 'verilog'
      : /^tb_/i.test(file.name) ? 'work' : 'vhdl';
    addFile(file.name, String(reader.result ?? ''), folder);
  };
  reader.readAsText(file);
}
```

- `:540` `accept=".vhd,.vhdl"` → `accept=".vhd,.vhdl,.v,.vh"`.
- The two strings that name the file types — the drop hint
  (`FileExplorer.tsx:120`, `Drop .vhd / .vhdl files`) and the button label
  (`:130`, `Upload VHDL File`) — become `Drop .vhd / .vhdl / .v files` and
  `Upload File`. Cosmetic, two strings, recommended because the old ones
  would be wrong.

Note (A3): `tb_*` **VHDL** still goes to `work/`. Every `.v` goes to
`verilog/`, testbenches included — a `tb_*.v` in `work/` would be dead
weight, since only the top file's folder is ever sent to a simulator (§ 6.4).

### 6.4 What Start sends

`src/components/workbench/ghdlClient.ts:146-154`, `run()` currently filters
`folder === 'vhdl'`. Change to *the top file's folder*, defaulting to `vhdl`:

```ts
run(files: VhdlFile[], topFileName?: string): void {
  const ws = this.ensureSocket();
  const top = files.find((f) => f.name === topFileName);
  const folder = top?.folder === 'verilog' ? 'verilog' : 'vhdl';
  const sources = files.filter((f) => f.folder === folder);
  …                                   // unchanged: body, head, send
}
```

`Workbench.tsx:488` (`getClient().run(files, topFile?.name)`) is unchanged.
The wire format, `RUN <topFile>`, is unchanged (§ 5.1). `work/` files are
still never sent, exactly as today.

### 6.5 Two small consistency fixes

- **Delete the top file** — `Workbench.tsx:413-415` hands the role to "the
  first `vhdl/` file". Make it the first file *in the deleted file's folder*
  (`f.folder === deleted.folder`), so deleting the last Verilog top does not
  silently switch the engine.
- **Rename across languages** — `handleRenameFile` (`Workbench.tsx:400`)
  keeps the folder, so renaming `x.v` to `x.vhd` would leave a VHDL name in
  `verilog/`. Recommended: on rename, if the new extension implies the other
  language, move the file to that language's folder. Six lines. Without it
  the backend's mismatch error (§ 5.1) is the safety net.

`New File` (`handleNewFile`, `untitledN.vhd`) is unchanged: a new file is
VHDL until renamed to `.v` (which, with the fix above, moves it).

### 6.6 What deliberately does not change

`CodeEditor` (highlighting — § 12 #6), `SimulationCard`, the board, the
console, the protocol, dialogs (`About` could gain an Icarus credit next to
GHDL's — optional; the installer's licence page already carries the notice).

---

## 7. Backend changes

### 7.1 Modules

New, alongside the GHDL ones:

| File | Role | Mirrors |
|---|---|---|
| `server/src/verilog.ts` | Spawn helpers: `runCmd`-based compile, `startPersistentRun`, `runBatch`, exe resolution (`setIverilogExe`, `getVvpExe`), banner | `ghdl.ts` |
| `server/src/vlogTb.ts` | `generateVerilogTestbench(top, ports)` | `tbTemplate.ts` |
| `server/src/vlogPorts.ts` | `findTopModule(files, preferred)` | `portDetect.ts` |

`ghdl.ts` already exports the two interfaces the run machinery is written
against — `RunHandle` (`kill`, `onExit`, `onOutput`, `grantPacing`) and
`BatchHandle` (`kill`, `done`). The Verilog spawn helpers return the same
shapes, which is what lets `session.ts` stay engine-agnostic. Move those two
interfaces (and `CmdResult`/`runCmd`) to a shared `runtime.ts` and re-export
from `ghdl.ts` so nothing that imports them changes.

### 7.2 `vlogPorts.ts` — finding the top module

Text analysis on a comment-stripped copy, same discipline as
`portDetect.ts` (the source handed to the compiler is never modified):

1. Strip `// …`, `/* … */`, string literals and `(* attributes *)`.
2. Find every `module <name>` (skip `endmodule`, `macromodule` treated as
   `module`).
3. For each, read its header: skip an optional balanced `#( … )` parameter
   list, then the balanced `( … )` port list.
4. Split the list at **top-level** commas; in each piece drop `= default`,
   drop any `[range]`, and take the **last identifier** — this handles ANSI
   lists (`output reg [9:0] LEDR = 0, …`), lists where a direction applies to
   several names (`output wire [6:0] HEX0_N, HEX1_N`), and old-style headers
   (`module M(CLOCK_50, SW, LEDR);`) with one rule.
5. Record `{ name, declaredSpelling }` and match against the board list
   case-insensitively.

Selection: an explicit top file (`RUN <topFile>`) → the module in that file
scoring highest on board ports, else the first declared (a file may define a
helper before its top; VHDL's "first entity" rule does not carry over
cleanly). No explicit top → best board-port score across all modules, and an
error naming the ports it looked for if none scores (same message shape as
`portDetect.ts`). A top with **zero** ports → batch mode.

S10's `-tstub` output is a possible cross-check in tests; it is not used at
run time because it is a debug dump whose format is not a promise.

### 7.3 `vlogTb.ts` — the generated wrapper

Appendix A is the verified shape. The generator's conditional parts, all
decided at generation time from the port set:

- `always #10 clk_sig = ~clk_sig;` only if `CLOCK_50` is declared.
- The `CLOCK_500Hz` generator always (`#1000000` = 1 ms half-period at
  `1ns/1ps`).
- One `.PortName(signal)` per declared board port, using the declared
  spelling; each *undeclared* output gets an `assign … = <off value>;`.
- No `rst` handling (§ 5.2).

Written as Verilog-2005 only (`reg [1023:0]` for file names rather than
`string`), so it compiles with the default generation and no `-g` flag.

### 7.4 `session.ts` — the seam

`handleRun` (`session.ts:204-298`) is GHDL-specific from "write files" to
"elaborated"; `startRun`/`startBatchRun` (`:300`, `:508`) are generic except
for *which spawn function they call*. The change:

```ts
async handleRun(files, topFile) {
  const engine = engineFor(topFile);            // 'vhdl' | 'verilog', by extension
  return engine === 'verilog' ? this.handleRunVerilog(files, topFile)
                              : this.handleRunVhdl(files, topFile);   // today's body, untouched
}
```

- `handleRunVhdl` is the current `handleRun` moved verbatim, so GHDL
  behaviour is byte-identical (this codebase needed a dozen field-found fixes
  to get here; do not refactor it under the feature).
- `handleRunVerilog` does § 5.4: write files, compile, pick top, generate the
  wrapper (board mode), then call the existing `startRun`/`startBatchRun`
  with the Verilog spawn functions.
- `startRun` gains one parameter, a `spawnPersistent` function, and
  `startBatchRun` one, `spawnBatch`; the GHDL ones are the defaults. Inside
  `startRun`, `PACING` becomes a per-engine value (Verilog: always `stdin`).

### 7.5 One shared behaviour fix

`startRun`'s `onExit` (`session.ts:349-359`) only reports `code !== 0`. A
persistent `vvp` that ends with exit 0 — the design called `$finish`, or
`$stop` under `-n` — leaves the UI on "running" with a frozen board. Send
`DONE completed` when a run that was `running` exits 0. For GHDL this only
changes a corner case that today is silent (`std.env.finish`).

### 7.6 `server.ts`

`BackendOptions` (`:37-49`) gains `iverilogExe?` and `vvpExe?`; env vars
`IVERILOG_EXE` (default `iverilog`) and `VVP_EXE` (default: `vvp` beside
`IVERILOG_EXE` if that is an absolute path, else `vvp` from `PATH`), set next
to `setGhdlExe` (`:130`). The startup log line gains the Icarus path.

---

## 8. Windows packaging

Same recipe as GHDL (`fetch-ghdl.ps1` → `vendor/ghdl` → `resources/ghdl` →
`extraResources`), with one difference: Icarus has no self-contained release
zip, so the tree is *assembled* from pinned MSYS2 packages. That assembly is
the whole of the packaging risk, which is why it is spiked (§ 4) and
smoke-tested at build time (§ 8.4).

### 8.1 Layout

```
resources/iverilog/
  bin/      iverilog.exe  vvp.exe  + runtime DLLs (8)
  lib/ivl/  ivl.exe  ivlpp.exe  *.vpi  vvp.conf vvp.tgt (+ -s variants)  null/stub tgt+conf
            + the same runtime DLLs again (S2)
  COPYING   licenses/<package>/…   VERSION.txt
```

Runtime DLLs (all found by scanning the binaries' imports and confirmed by
running with a clean `PATH`): `libgcc_s_seh-1.dll`, `libstdc++-6.dll`,
`libwinpthread-1.dll`, `zlib1.dll`, `libbz2-1.dll`, and for `vvp.exe`
`libreadline8.dll`, `libhistory8.dll`, `libtermcap-0.dll`.

### 8.2 `winInstaller/fetch-iverilog.ps1` (new)

Behaves like `fetch-ghdl.ps1`: idempotent by a stamp in `VERSION.txt`,
`-Force` to refetch, downloads with `Invoke-WebRequest`, **verifies SHA-256
before unpacking**, refuses on mismatch. Pinned at research time (all from
`https://repo.msys2.org/mingw/ucrt64/`; sizes in bytes):

| Package file | SHA-256 |
|---|---|
| `mingw-w64-ucrt-x86_64-iverilog-1~13.0-2-any.pkg.tar.zst` (1 988 347) | `FD4D7D7CB60CDA1EB437F5476673503D92964CF47CE6C11B460EB3BD05C43582` |
| `mingw-w64-ucrt-x86_64-readline-8.3.003-1-any.pkg.tar.zst` (513 820) | `DE2423C2E10FCD88272A0AB2F833F6A082CFE613D4C17C2F548CC50A5D2190C4` |
| `mingw-w64-ucrt-x86_64-termcap-1.3.1-7-any.pkg.tar.zst` (27 912) | `17B78EB63E89458A6AE4D56AA1DC357E1DECB2F845B29FDED79BCCDD628D9D41` |
| `mingw-w64-ucrt-x86_64-zlib-1.3.2-2-any.pkg.tar.zst` (111 475) | `841401182976D2F9E17E5C0EBAAC51F2A8014140EA53D67625E91C8FB3C85EA0` |
| `mingw-w64-ucrt-x86_64-bzip2-1.0.8-4-any.pkg.tar.zst` (94 396) | `F03A2174034DDD2D96CECD34F617C5F8E2EF86C812B8D2BB3B8875257F2C8BFA` |
| `mingw-w64-ucrt-x86_64-libwinpthread-14.0.0.r426.g4564ee4b5-1-any.pkg.tar.zst` (30 667) | `F8DE8153BBC0E47BA244A423C12C426FA1D9F56395117ECAA34C6AD6EBED6CA3` |
| `mingw-w64-ucrt-x86_64-libgcc-16.2.0-4-any.pkg.tar.zst` (77 220) | `DE65B4ADAE899D9278427402E29D03860BACBA481794460F3A1D078610CBB783` |
| `mingw-w64-ucrt-x86_64-libstdc%2B%2B-16.2.0-4-any.pkg.tar.zst` (795 771) | `2211DBBF1220287E49F5D66BB6CB09EE5A157901A485197553C9A940CC902D5B` |

(The last URL needs the `+` percent-encoded. Recompute these if any pin is
bumped; do not paste from here without re-verifying.)

Steps: download → verify → unpack each with `$env:SystemRoot\System32\tar.exe -xf`
(S14; a build-machine-only requirement, Windows 10 1803+/11) → copy
`ucrt64\bin\{iverilog,vvp}.exe` and the DLLs into `bin/`, `ucrt64\lib\ivl\*`
into `lib/ivl/`, the DLLs again into `lib/ivl/` (S2) → **deny-list, not
allow-list**: drop `vhdlpp.exe`, `include/`, `libvpi.a`, `iverilog-vpi.exe`,
and the `blif`/`pcb`/`sizer`/`vlog95`/`vhdl` targets, keeping everything else
(an allow-list is how the missing `.vpi` files of S2 happened) → copy licence
texts from each package's `share\licenses\` → write `VERSION.txt` with the
package list, URLs, SHA-256s and the source-package URLs of § 3.3.

**Availability risk.** `repo.msys2.org` currently retains old versions
(several `readline` and `libwinpthread` builds were listed), but nothing
promises it will. Mitigations, in order of effort: the build caches
`vendor/iverilog` (gitignored, like `vendor/ghdl`); re-host the *assembled*
tree as a GitHub release asset of the HDLBoard repository and fetch that
instead (GHDL's own zip is a release asset, which is why it is stable). This
is § 12 #7.

### 8.3 Wiring

| File | Change |
|---|---|
| `winInstaller/build.ps1` step 0 | fetch `vendor/iverilog` if missing, as for GHDL; step 5 copy to `resources/iverilog`; fail if `COPYING`/`VERSION.txt` is missing |
| `winInstaller/electron/electron-builder.yml` `extraResources` | `- from: resources/iverilog` / `to: iverilog` |
| `winInstaller/electron/main.js` `resolvePaths()` (`:37-57`) | packaged: `iverilogExe: <res>/iverilog/bin/iverilog.exe`, `vvpExe: <res>/iverilog/bin/vvp.exe`; dev: `IVERILOG_EXE`/`VVP_EXE` or `PATH` (as for `GHDL_EXE`); pass to `startBackend` |
| `winInstaller/electron/build/license.txt` | the § 3.3 section |
| `winInstaller/README.md`, `.gitignore` | document the step; ignore `vendor/iverilog/` and the download cache |

Teardown needs no change: Electron calls the backend's `stop()` on
`before-quit`, which destroys every session and kills its children
(`server.ts`, `stop`), and `vvp.exe` is just another child of a `Session`.
§ 10 #3 still checks for orphans.

### 8.4 Build-time smoke test (do not skip)

After assembling `resources/iverilog`, `build.ps1` compiles and runs a
three-line design **with `PATH` reduced to `System32`, from a directory whose
name contains a space and `ø`**, and fails the build if it does not print the
expected line. That single step catches S2, the `.vpi` trap and the DLL trap
before anything is packaged — each of which otherwise looks fine on the
build machine (where `PATH` usually contains an MSYS2 or GHDL directory that
masks it; the spike's first "success" was exactly that).

---

## 9. Linux / server mode

`scripts/alpineInstall.sh` builds GHDL from source; `scripts/start.sh` installs
it (`start.sh:71-95`) through whichever of `apt-get`/`dnf`/`pacman`/`zypper`/
`apk`/`brew` the machine has, and stops with a pointer to `docs/BUILDING.md`
otherwise. Icarus is simply a package in all of those: Alpine `edge/community`
carries `iverilog` 13.0-r0 (GPL-2.0-or-later); Debian stable carries 12.0-2,
testing/unstable 13.0-2 (package presence verified, not installation). So both
scripts gain an `iverilog` step of the same shape (`apk add iverilog` in
`alpineInstall.sh`; one more `command -v iverilog` block in `start.sh` using
the same package-manager ladder — Homebrew's formula is named
`icarus-verilog`, to be confirmed when implementing), and `docs/BUILDING.md`
/ `HOSTING.md` list the commands. The backend needs only `iverilog` and `vvp`
on `PATH` (or `IVERILOG_EXE`/`VVP_EXE`).

12.0 and 13.0 behave identically for everything the backend relies on (S12).
Pacing is stdin on Linux as well (§ 5.6); **verify it there** (§ 10 #6) — it
is the one behaviour measured only on Windows.

---

## 10. Testing and verification

There is still no test runner in the repo (the GHDL plan hit the same and used
scripts). Same approach; every item below is a script or a manual gate, and
"run it" is the standard, per the GHDL plan's § 10.

1. **`vlogPorts.ts` unit script.** ANSI and old-style headers, `#(…)`
   parameter lists, `output reg [9:0] LEDR = 0`, shared-direction lists,
   comments containing `module`/`input`, two modules in one file, mixed-case
   port names, a portless testbench module.
2. **Generator round trip.** For each port subset (`SW`+`LEDR` only; full
   board; `CLOCK_500Hz` only; `CLOCK_50` present): generate → `iverilog` →
   `vvp` for a fixed time → assert `output.txt` content. (Appendix A is the
   baseline.)
3. **Raw protocol client** (a Node script over `ws`, as in the GHDL plan),
   cases: clean `RUN`→`READY`→`STIM`→`STATE`; syntax error (`ERROR analyze`
   with the real `file:line: error:` text); unknown module
   (`ERROR elaborate`); warnings on a successful compile arrive as `LOG`
   *before* `READY`; multi-file project with a cross-file instantiation in
   either order; a partial interface; `RESET`; `STOP`; a design that calls
   `$finish` in board mode (→ `DONE completed`); `$fatal` (→ `ERROR
   runtime`); a portless testbench (batch → `LOG` lines → `DONE completed`);
   an infinite loop with no delay (→ the 60 s `ERROR runtime`, or `STOP`
   returning promptly); disconnect mid-run (no orphan `vvp`/`iverilog`
   process: `Get-Process vvp`); VHDL → Verilog → VHDL on one connection.
4. **VHDL regression.** Re-run every existing GHDL case unchanged; § 7.4
   promises byte-identical behaviour and this is the proof.
5. **Headless browser end-to-end** (Playwright, already a dev dependency):
   drop a `.v` file → it appears under `verilog/`; drop `.vhd` → under
   `vhdl/`; set the `.v` file as top; Start; flip a switch; assert the real
   `Leds` DOM. **The decisive test is `assign LEDR = ~SW;`** — it passes only
   if the Verilog simulator is genuinely driving the board (the same
   reasoning as `LEDR <= not SW` in the GHDL plan). Then set a VHDL file as
   top and confirm GHDL is used again. Assert the console shows the
   `Icarus Verilog version …` line and a design `$display`.
6. **Linux gate.** The raw-client suite under a real Linux (Alpine or
   Debian) with the distribution's `iverilog`, specifically the pacing
   measurement of S5 (a clockless 250 ms blink tracks real time and the
   unpaced run does not).
7. **Windows gates** (run on a clean machine/VM; the existing open installer
   gates in the project notes are the same ones): install → a Verilog design
   with `$display` shows live output; the S11 case (user name with a
   non-ASCII letter) end to end; uninstall leaves nothing; the installer's
   licence page shows the new section.
8. **The build-time smoke test** of § 8.4 runs on every `build.ps1`.

---

## 11. Security

Same posture as the GHDL plan's § 11: the desktop app binds loopback and
runs the student's own code on the student's own machine; server mode is a
LAN service whose trust boundary is "people you would hand a shell prompt to
a simulator". Carried over: `spawn` with an argument array only, never a
shell string (§ 7.1's `ghdl.ts` header comment applies verbatim to
`verilog.ts`); no source content or file name on a command line; session
directory per connection, deleted on teardown; session cap.

Verilog-specific:

- **`$system` is not available** (S15) — a design cannot run shell commands
  with the shipped modules.
- Verilog can still **open arbitrary paths** (`$fopen`, `$readmemh`) and
  `` `include `` arbitrary files, as VHDL's `textio` can — an existing
  property of running student code, not a new class. Do not describe the
  server mode as a sandbox.
- File names given to the simulator are **fixed, generated, relative** names
  (`input.txt`, `output.txt`, `heartbeat-N.txt`); student-supplied file names
  are written into the session directory but only ever passed as compile
  arguments after being validated as plain file names (no path separators, no
  leading `-`). GHDL's path has the same requirement; the backend should
  reject `..`/absolute `@@FILE` names for both engines.
- No `-m`/`-M`/`-p` options are ever taken from the client, so a design cannot
  load an arbitrary VPI module.

---

## 12. Open decisions

| # | Decision | Recommendation |
|---|---|---|
| 1 | **SystemVerilog (`.sv`)** | Not in the first cut (the request says Verilog). To add it later: accept `.sv/.svh`, pass `-g2012` *to the whole compile* when any `.sv` is present (`-g` is per invocation; `.sv` is not auto-detected — § 2.3). Cost: SV keywords (`logic`, `bit`, `do`, `final`, …) become reserved for the `.v` files in that run. |
| 2 | **Terasic port names** (`KEY`, `HEX0`, …) as aliases | No — course convention `KEY_N`/`HEX0_N` (`ghdl_implementation_plan.md` § 12 #6). Revisit only if students paste Terasic templates a lot. |
| 3 | **`tb_*.v` placement** | Everything `.v` → `verilog/` (§ 6.3). Alternative: mirror VHDL and send `tb_*.v` to `work/` — but `work/` is never simulated, which is arguably a wart of the VHDL flow, not something to copy. |
| 4 | **Mixed VHDL + Verilog in one run** | Out of scope. Icarus's `vhdlpp` (bundled in the MSYS2 package, dropped by § 8.2) translates a small VHDL subset, not something to rely on. |
| 5 | **`rst` for Verilog** | Not supported; add only if a course template needs it (one `assign`). |
| 6 | **Verilog syntax highlighting** | Out of scope by request; the VHDL tokenizer mis-colours `.v` (`--` vs `//`). A ~40-line `verilogHighlight.ts` selected by file extension is the follow-up. |
| 7 | **Where the Windows binaries come from long-term** | Start with pinned MSYS2 URLs + the `vendor/` cache; re-host the assembled tree as a release asset if `repo.msys2.org` ever drops a pin (§ 8.2). |
| 8 | **Synthesis / lint check** (Yosys `synth`, Verilator `--lint-only`) | Later, separately, and not on the Start path. Both are open-source with permissive-enough licences (§ 2.3) but no small Windows binary is published for either. |
| 9 | **A starter Verilog example** | None by default (the `verilog/` folder stays hidden until used, § 6.1). If wanted, add a `DE1_SoC.v` to `STARTER_FILES` — but that makes the folder visible on first launch. |
| 10 | **`-Wall` noise** | Start with `-Wall`; measure on the starter-style designs in Phase 2 and relax if it is chatty. |
| 11 | **Adjacent, existing:** the GHDL path passes *absolute* file names to `-ginput_file=` etc. (`session.ts`) | S11 shows Icarus fails silently on them under a non-ASCII directory; GHDL was not tested for the same. Worth a check on a profile such as `C:\Users\Rune Langøy\…` — it may be a latent bug in the shipped GHDL path. |

---

## 13. Phased roadmap with acceptance criteria

**Phase 0 — spike — done (this document, § 4).**

**Phase 1 — packaging.** `fetch-iverilog.ps1`, `vendor/iverilog`, the
build-time smoke test of § 8.4 as a standalone script first.
*Gate:* from a clean `PATH`, in a directory with a space and `ø`, compile and
run a small design; `iverilog -V` prints 13.0; `VERSION.txt` lists every pin
and its SHA-256; tree ≈ 12 MB.

**Phase 2 — backend.** `runtime.ts` extraction, `vlogPorts.ts`, `vlogTb.ts`,
`verilog.ts`, the `session.ts` seam (§ 7.4), the `onExit` fix (§ 7.5),
`server.ts` options.
*Gate:* § 10 items 1–4 pass against `iverilog`/`vvp` on `PATH`; the GHDL
regression is identical; the `-Wall` noise question (§ 12 #10) is answered.

**Phase 3 — frontend.** § 6.1–6.5.
*Gate:* `npm run typecheck` clean; § 10 item 5 (`assign LEDR = ~SW;` in a
real browser, then switching top to VHDL and back); starter project looks
exactly as before.

**Phase 4 — installer.** § 8.3.
*Gate:* an installed build on a clean Windows VM: a Verilog design runs with
live `$display` output in the console; § 10 item 7. (The project's existing
open installer gates — Linux paced timing, clean VM — are the same
machines; combine the runs.)

**Phase 5 — Linux and docs.** `alpineInstall.sh`/`start.sh`/`HOSTING.md`,
`winInstaller/README.md`, `changelog.txt`, the licence page.
*Gate:* § 10 item 6 on a real Linux.

Estimated order of effort, smallest to largest: Phase 3 (a handful of edits),
Phase 1, Phase 5, Phase 4, Phase 2 (the port scanner, the generator, and
keeping the GHDL path untouched while adding the seam).

---

## Appendix A: the verified testbench shape

This is the file the spike compiled and drove (`tb3.v`), reproduced here as
the generator's target. `NOCLK50` stands for the generator's decision not to
emit the `CLOCK_50` process; the design under test in the spike declared
`CLOCK_50`, `CLOCK_500Hz`, `SW`, `KEY_N`, `LEDR`. Two edits for production:
undeclared board outputs get `assign … = <off value>;`, and the instance
lists whichever ports the module declares.

```verilog
`timescale 1ns/1ps
module hdl_board_tb;
  reg clk = 0, clk500 = 0;
  reg [9:0] sw = 0; reg [3:0] key = 4'hF;
  wire [9:0] ledr;
  reg [1023:0] input_file, output_file, hb_file;
  integer poll_ns = 1000;
  integer fin, fout, fhb, r, seq, applied = 0, last_seq = -1;
  reg [13:0] rec;
  reg [255:0] line;
  reg [9:0] last_led = 10'bx;

  DE1_SoC uut(.CLOCK_50(clk), .CLOCK_500Hz(clk500), .SW(sw), .KEY_N(key), .LEDR(ledr));

`ifndef NOCLK50
  always #10 clk = ~clk;                  // only if CLOCK_50 is declared
`endif
  always #1000000 clk500 = ~clk500;       // 1 ms half period = 500 Hz

  initial begin                           // run-time parameters (+name=value)
    if (!$value$plusargs("poll_interval_ns=%d", poll_ns)) poll_ns = 1000;
    if (!$value$plusargs("input_file=%s", input_file)) input_file = "";
    if (!$value$plusargs("output_file=%s", output_file)) output_file = "";
    if (!$value$plusargs("heartbeat_file=%s", hb_file)) hb_file = "";
  end

  // Pacing: after every 20 ms of simulated time, report progress and BLOCK on
  // one line from stdin (32'h8000_0000). The Node side writes one line per
  // 20 ms of real time — a late Node side can only slow the run down.
  initial begin
    #1;
    forever begin
      #20000000;
      fhb = $fopen(hb_file, "w"); $fdisplay(fhb, "%0d", $time / 1000000); $fclose(fhb);
      r = $fgets(line, 32'h8000_0000);
    end
  end

  // I/O: apply at most one queued "<seq> <SW9..SW0 KEY3..KEY0>" line per poll,
  // publish "<LEDR> <last applied seq>" whenever either changes.
  initial begin
    #1;
    forever begin
      #(poll_ns * 1);
      fin = $fopen(input_file, "r");
      if (fin != 0) begin
        r = 1;
        while (r == 1 && !$feof(fin)) begin
          r = $fscanf(fin, "%d %b\n", seq, rec);
          if (r == 2) begin
            if (seq > applied) begin sw = rec[13:4]; key = rec[3:0]; applied = seq; r = 0; end
            else r = 1;
          end else r = 0;
        end
        $fclose(fin);
      end
      if (ledr !== last_led || applied != last_seq) begin
        fout = $fopen(output_file, "w"); $fdisplay(fout, "%b %0d", ledr, applied); $fclose(fout);
        last_led = ledr; last_seq = applied;
      end
    end
  end
endmodule
```

The production version also writes the full 52-bit `LEDR`+`HEX0..5` string
(`%b` of a concatenation) and applies the `min_dwell_ns` rule of
`tbTemplate.ts`; both are direct translations of the VHDL `io` process and
are not repeated here because the spike did not exercise them.

Driving it (what `verilog.ts` will do, as run in the spike):

```
iverilog -Wall -DNOCLK50 -s hdl_board_tb -o sim.vvp tb3.v design.v
vvp -n -i sim.vvp +input_file=input.txt +output_file=output.txt +heartbeat_file=hb.txt +poll_interval_ns=1000000
```

## Appendix B: real simulator output

Captured from the spike, Icarus 13.0 on Windows.

**Banner** (`iverilog -V`, first line): `Icarus Verilog version 13.0 (stable) (v13_0)`

**Live output of a running design** (arrival time in real seconds, `vvp -n -i`,
paced, clockless design, 250 ms blink):

```
[0.020s] design says hi at 0
[0.243s] blink=0 at 249000000000
[0.493s] blink=1 at 499000000000
[0.742s] blink=0 at 749000000000
[0.990s] blink=1 at 999000000000
```

**Syntax error** (stderr, exit 2):

```
syntax.v:2: syntax error
syntax.v:2: error: Syntax error in continuous assignment
```

**Unknown module** (stderr, exit 2):

```
unk.v:2: error: Unknown module type: missing_mod
2 error(s) during elaboration.
*** These modules were missing:
        missing_mod referenced 1 times.
***
```

**Warnings on a successful `-Wall` compile** (stderr, exit 0):

```
warn.v:5: warning: Port 1 (a) of module w expects 8 bit(s), given 4.
warn.v:5:        : Padding 4 high bits of the port.
warn.v:5: warning: Port 2 (b) of module w expects 4 bit(s), given 10.
warn.v:5:        : Padding 6 high bits of the expression.
```

**`$stop` under `vvp -n`** (exit 0) and **`$fatal`** (exit 1):

```
run
warn.v:5: $stop called at 5 (1s)

x
FATAL: fatal.v:1: boom
       Time: 5  Scope: rt
```

**`$finish`** (stdout, exit 0): `tb.v:6: $finish called at 200000 (1ps)`

**Missing `.vpi` (the packaging trap, S2)** — exit 0, printed on every compile:

```
error: Failed to open '…\lib\ivl\system.vpi' because:
     : The specified module could not be found.
```

(The message text comes from the OS and is localised: on this Norwegian
Windows it read *"Den angitte modulen ble ikke funnet."* — a reason for the
smoke test to check the *result*, not match text.)

## Appendix C: sources

Primary sources consulted (2026-09-26). Facts about releases, licences and
package versions were read from the GitHub API, the MSYS2 repository
metadata, and upstream source headers, not from summaries.

- Icarus Verilog repository and README — <https://github.com/steveicarus/iverilog>
- Icarus Verilog releases (v13_0 published 2026-03-02) — <https://github.com/steveicarus/iverilog/releases>
- Icarus Verilog documentation, `vvp` flags (`-i`, `-n`, `-N`) — <https://steveicarus.github.io/iverilog/usage/vvp_flags.html>
- Icarus Verilog for Windows (installer list; v12-20220611, v14-20260804) — <https://bleyer.org/icarus/>
- MSYS2 package `mingw-w64-ucrt-x86_64-iverilog` — <https://packages.msys2.org/packages/mingw-w64-ucrt-x86_64-iverilog>
- MSYS2 binary repository (packages, hashes computed locally) — <https://repo.msys2.org/mingw/ucrt64/>
- MSYS2 source packages — <https://repo.msys2.org/mingw/sources/>
- MSYS2 build recipe — <https://github.com/msys2/MINGW-packages/tree/master/mingw-w64-iverilog>
- Alpine `iverilog` package (edge/community, 13.0-r0) — <https://pkgs.alpinelinux.org/packages?name=iverilog&branch=edge>
- Debian `iverilog` package versions — <https://packages.debian.org/search?keywords=iverilog&searchon=names&suite=all&section=all>
- Verilator installation guide (no prebuilt Windows binaries; Windows support statement) — <https://verilator.org/guide/latest/install.html>
- Verilator command reference (`--binary`, `--build`, four-state is experimental) — <https://verilator.org/guide/latest/exe_verilator.html>
- Verilator overview (LGPL-3.0 or Artistic-2.0) — <https://verilator.org/guide/latest/overview.html>
- Yosys repository (ISC; releases carry source only) — <https://github.com/YosysHQ/yosys>
- Yosys `sim` command — <https://yosyshq.readthedocs.io/projects/yosys/en/0.47/cmd/sim.html>
- OSS CAD Suite builds (windows-x64 ≈ 600 MB) — <https://github.com/YosysHQ/oss-cad-suite-build>
- OSS CVC — <https://github.com/cambridgehackers/open-src-cvc> · GPL Cver — <https://github.com/omasanori/gplcver>
- The GHDL plan this builds on — [`ghdl_implementation_plan.md`](ghdl_implementation_plan.md)
