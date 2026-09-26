# Verilog Backend — Implementation Plan

> Licensed under the [GNU General Public License v2.0](../LICENSE).

**Status: implemented on branch `feature/verilog-backend` (2026-09-26); phases A–H built, phase I
(quality verification) and the manual gates (Linux 12.0/13.0, clean-VM installer run, V-9) still open.**
This document was written before the code; § 4 is the record of the measurements it rests on. Every "measured" claim was run on the development machine (Windows 11
Pro 10.0.26200, x64) against real Icarus Verilog binaries; § 4 is the record.
Where something could only be read, or was not tested, the text says so.

**Deviations from the plan as built** (small, deliberate): the compile-every-fixture check of C5 moved to D2; process code is split into `verilog/process.ts` (compile) and `verilog/run.ts` (vvp); pure language rules live in `engines/language.ts` and the registry in `engines/selectEngine.ts`; the bundled tree is flat (`resources/iverilog`, run with `-B`/`-M`), not `bin/`+`lib/`; I-V12's runaway case is `initial forever` (Icarus rejects a zero-delay `always` at compile time); a missing or declined Icarus install on Linux warns rather than stops `start.sh` (VHDL still runs); the flood limiter is checked per run (I-V21 for both engines); E-8 renames of `tb_*.vhd` go to `work/`; G5 (installed self-test) was not built; the starter project shows the `verilog/` twins too (a later request), so the old "starter shows `vhdl/` only" check no longer applies (V-1 now expects both folders).

**The end state:** a student drops or uploads a `.v` file, it lands in a new
**`verilog/`** folder, and when a file in that folder is the selected top-level
file, **Start** compiles and simulates it with a real Verilog simulator
instead of GHDL — driving the same board and writing the simulator's own
messages to the same console. The frontend change is deliberately tiny.

**How to use this document.** §§ 0–5 say *what* and *why* (read once). § 6 is
the code standard every step must meet. § 7 is the test strategy. **§ 8 is the
work order: 48 small steps, committed in about twenty groups.** Do them in the build order set out at the top of § 8; every step has
a "Done when" you can check.

Same conventions as [`ghdl_implementation_plan.md`](ghdl_implementation_plan.md),
which remains the as-built reference for everything reused here (wire protocol
§ 6, persistent process § 5, pacing § 5.9/5.13/5.15).

## Contents

- [Revision history](#revision-history)
- [0. Summary and recommendation](#0-summary-and-recommendation)
- [1. Requirements and non-goals](#1-requirements-and-non-goals)
- [2. Simulator evaluation](#2-simulator-evaluation)
- [3. Licensing and redistribution](#3-licensing-and-redistribution)
- [4. Measurements — what was run](#4-measurements--what-was-run)
- [5. Design](#5-design)
- [6. Code standard (Clean Code)](#6-code-standard-clean-code)
- [7. Testing](#7-testing)
- [8. Implementation steps](#8-implementation-steps)
- [9. Open decisions](#9-open-decisions)
- [Appendix A: the verified testbench](#appendix-a-the-verified-testbench)
- [Appendix B: real simulator output](#appendix-b-real-simulator-output)
- [Appendix C: converted starter designs (test fixtures)](#appendix-c-converted-starter-designs-test-fixtures)
- [Appendix D: sources](#appendix-d-sources)

---

## Revision history

**Revision 3.2 (2026-09-26)** — the browser end-to-end tests use **the Chrome
extension instead of Playwright**: Claude drives a real Chrome window from a
checked-in runbook (§ 7.7, step F6). The approach was checked first against
today's app: dropped and uploaded files reach the real handler and the tree,
console and controls are readable from the DOM. Consequences recorded in § 7.7:
native `confirm` dialogs must be stubbed, timing is asserted inside the page,
and the run is an acceptance run, not a CI test. Also found: the console panel
is titled "GHDL Output / Status" (F3 makes it engine-neutral).

**Revision 3.1 (2026-09-26)** — build order made explicit. § 8 is now nine
phases (A–I) listed in the order they must be built, each with its goal, what it
needs, the working state it leaves and its gate, plus a dependency sketch and a
critical path. The one real reordering: **the simulator tree moved from the
installer phase to the second phase (B)**, because this machine has no
`iverilog` and every integration test needs one. Step ids were renumbered to
match; the golden wrapper and `IVERILOG_DIR` were added to A1/A4 so phases B and
C do not wait for code that comes later.

**Revision 3 (2026-09-26)** — response to an outside review of revision 2
(written by a less experienced reviewer; assessed point by point, and **each
point tested where it could be**). Outcome:

| # | Review point | Verdict | What changed |
|---|---|---|---|
| 1 | The custom Verilog parser is the largest long-term risk | **Adopted — and validated.** `iverilog -E` resolves `` `include``/`` `ifdef``/macros, and `iverilog -tstub` reported the exact ports of a design a regex gets wrong (an `` `ifdef``'d-out port, macro-sized widths, a generate loop, attributes), identically on 12.0 and 13.0 (M22). | Ports now come from Icarus. What HDLBoard still reads is a ~10-line module-name scan of the top file. C1–C3 rewritten; the ANSI/old-style/parameter parsing cases are gone. |
| 2 | Top detection by scoring is a heuristic | **Adopted — and the scoring was never needed.** A Verilog run always has an explicit top *file* (that is how the engine is chosen), so the fallback could not be reached. | One deterministic rule (§ 5.1); scoring and its cases removed. |
| 3 | `SimEngine` leaks simulator knowledge into `Session` | **Partly adopted.** `hasClock50` was a real leak → the plan now carries the engine's `timing`. Reducing `Session` to `start()/stop()` was **not** adopted: the stimulus queue, output polling and pacing are the same for every engine that speaks the file protocol, and moving them into each engine would duplicate them for engines that do not exist. | § 5.7 |
| 4 | 46 commits is overhead for a solo project | **Adopted.** | Steps stay as work and verification units; commits are per *group* (§ 6.5). The behaviour-changing steps keep their own commit so a regression bisects to one change. |
| 5 | Test infrastructure may outgrow the feature | **Partly adopted.** | 100 % coverage is now a report, not a gate; break-it checks are limited to the logic modules; tests are ranked Must/Should/Optional (§ 7.10). The characterization tests stay — they are the refactor's safety net. |
| 6 | "Has ports" is not "is a board design" | **Adopted, refined.** | Board mode iff the top declares a board port; a portful top with none runs standalone with a hint, so a misspelled design is told why (§ 5.3). |
| 7 | Heavy dependence on current Icarus behaviour | **Adopted.** | Startup version check with a non-blocking warning (§ 5.5, C6). |
| 8 | Duplicated DLLs invite version skew | **Adopted, with a better fix than the suggested `PATH`.** `PATH` would need every spawn to carry a modified environment. **One flat directory with `iverilog -B` and `vvp -M`** has one DLL copy, no `PATH` dependence and is smaller (M21). | § 5.8, D2, D5, B2, B3 |
| 9 | VHDL and Verilog select the top differently | **Adopted** (follows from #2). | § 5.1 parity table |
| 10 | Important stress tests are missing | **Adopted, and run first.** Nested, circular and missing includes, a 101-file project and a `$display`-per-clock flood were measured (M23–M25). The flood is a **real, unprotected weakness — on both languages.** | New steps E7 and F7; cases I-V17…I-V23 |

**Revision 2 (2026-09-26)** — review of revision 1. What the review found and
changed:

| # | Finding | Change |
|---|---|---|
| 1 | Revision 1 was a design description with phases, not a work order. | New § 8: 48 small steps, each with files, action, test-first cases and a "Done when". |
| 2 | The `session.ts` seam was "move `handleRun` verbatim and add two function parameters" — smaller diff, but it leaves a 640-line class branching on language. | Replaced by a `SimEngine` interface (§ 5.7), introduced **under characterization tests** written first (steps A5–A6, E1–E3), so the refactor is safe *and* clean. |
| 3 | Frontend logic (extension → folder, which folder to send) was inline in a React component. | Extracted to a pure `fileKinds.ts` module with unit tests (§ 8, F1). |
| 4 | Appendix A was a spike sketch: no 52-bit output, no dwell rule, no tie-offs. | Replaced by the **full generated wrapper, verified** on all three converted starters (M20). |
| 5 | Open question: `-Wall` noise. | **Measured:** `-Wall` warns "timescale inherited" for *every* ordinary design. Use `-Wall -Wno-timescale` (M19). |
| 6 | A student file named like a generated one (`hdl_board_tb.v`) or with a path would clash or escape the session directory. | New file-name validation module and tests (C6). |
| 7 | Nothing said how to test, or how to verify an *installation*. | New § 7 and § 8 phases A, B, G, I. |
| 8 | No code-quality standard. | New § 6, with a per-step Definition of Done and a post-implementation quality phase (H). |
| 9 | VHDL starter designs were not available as Verilog. | Converted and **run** (Appendix C); they become the shared test fixtures. |
| 10 | Spike ids `S1…S18` collided with step ids. | Measurements renamed `M1…M20`. |
| 11 | Parity between languages needs care: `blinkTest.vhdl` leaves `HEX*` undriven (GHDL reports `X`, the frontend coerces it to "off"). | Parity rule stated in § 7.6; the Verilog twin blanks them explicitly. |

---

## 0. Summary and recommendation

**Use Icarus Verilog 13.0** (`iverilog` to compile, `vvp` to run), bundled into
the Windows installer the same way GHDL is.

- **Mature.** Long-standing open-source Verilog simulator (IEEE 1364 in full, a
  growing subset of SystemVerilog). 13.0 was released as *stable* on
  2026-03-02; the repository was still receiving commits on the day of
  writing. Debian stable ships 12.0; Debian testing and Alpine edge ship 13.0.
- **As easy to integrate as GHDL.** Two small command-line programs of the
  same shape as GHDL's: compile, then run, diagnostics on stderr, `$display`
  on stdout. No C++ compiler, Perl or MSYS2 at run time; compiles took
  60–105 ms. It supports the file polling and blocking stdin reads the
  existing pacing design needs (§ 4).
- **Compatible licence.** GPL-2.0-or-later, the same family as GHDL and
  HDLBoard (GPL-2.0-only), launched as separate programs with `spawn` (§ 3).
- **Small.** ≈ 8 MB on disk (one flat directory), ≈ 2 MB compressed: the installer grows from
  88.7 MB to roughly 91 MB.

Rejected, with reasons in § 2: **Verilator** (needs a C++ toolchain and Make on
the student's machine; no Windows binary mentioned), **Yosys** (synthesis tool,
Windows builds only inside a ≈ 600 MB suite), **CVC / GPL Cver** (old, or a
different licence), **commercial simulators** (not redistributable).

### The traps found by actually running it

Each silently produces a working-looking build that fails on a student's
machine, so each gets a check in the plan:

1. **stdout is block-buffered through a pipe.** Without `vvp -i`, a design's
   `$display` never reaches the console while it runs. (M4)
2. **The runtime DLLs must be findable from `ivl.exe` too**, not only from
   `bin/`, or `iverilog.exe` fails with `STATUS_DLL_NOT_FOUND`
   (`-1073741515`) unless `bin/` happens to be on `PATH`. Solved by one flat
   tool directory (M21) — and `iverilog -B` needs a **backslash** path there:
   with `C:/…` it fails with `'C:' is not recognized as an internal or
   external command`. (M2, M21)
3. **Absolute file names fail silently in a non-ASCII directory** (a user
   named *Langøy*): the simulation runs but reads and writes nothing.
   Relative names with `cwd` = the session directory work. (M11)
4. **Do not trim the `.vpi` files.** `iverilog.exe` loads a fixed module list
   compiled into it; missing ones print `error: Failed to open '…system.vpi'`
   on every compile while still exiting 0. (M2)
5. **`$stop` ends the run with exit 0** under `-n`. The persistent-run exit
   handler only reports non-zero exits, so the UI would stay on "running".
   (M9, step E5)
6. **A file without `` `timescale `` runs at 1 s** and inherits from the
   *previous* file in compile order. (M17, § 5.4)
7. **`-Wall` alone is noisy**: "timescale inherited" on every ordinary
   design. Use `-Wall -Wno-timescale`. (M19)
8. **Output is unthrottled.** A `$display` on every clock edge is ≈ 215 000
   lines/s; nothing limits it on the server or in the console. (M25, steps
   E7, F7)

### Assumptions to confirm (change these and the plan barely changes)

| # | Assumption | Where |
|---|---|---|
| AS1 | "When files in the Verilog folder are *activated*" means: the file marked as top with the existing blue dot. The engine follows that file's folder. No new UI. | step F2 |
| AS2 | The folder shows as `verilog/`, matching `vhdl/` and `work/`. | step F2 |
| AS3 | Every Verilog file goes to `verilog/`, including `tb_*.v`. (Today `tb_*` VHDL goes to `work/`, whose files are never simulated.) | § 9 #3 |
| AS4 | Scope is Verilog (`.v`, plus `.vh` include files). SystemVerilog is not in the first cut. | § 9 #1 |

---

## 1. Requirements and non-goals

| Requirement | Addressed by |
|---|---|
| Research which simulator to embed: maturity, ease of integration (like GHDL), licence, Windows binary in the installer | §§ 2, 3, phases B and G |
| Frontend: Verilog files go in a new **Verilog** folder when uploaded or dropped | steps F1–F3 |
| Frontend: activating a Verilog-folder file uses the Verilog simulator, not GHDL | § 5.1, steps F4, E3 |
| Minimum UI changes | phase F — no new component, control or wire field |
| The terminal shows the simulator's own messages, as it does for GHDL | § 5.5, step E4 |
| Convert the static VHDL examples and use them later to test and verify the installation | Appendix C, § 7.3, § 7.8, phases B and G |
| Clean Code; test the modules after implementation for quality and readability | § 6, § 7.9, phase I |

**Non-goals** (each a separate decision): SystemVerilog `.sv` (§ 9 #1);
Verilog syntax highlighting (§ 9 #6 — until then `.v` is coloured by the VHDL
tokenizer); waveform capture; mixed-language projects (§ 9 #4); a Yosys
synthesis check (§ 9 #8).

---

## 2. Simulator evaluation

### 2.1 Criteria

The three in the request, plus two that decide whether the existing
architecture survives: (1) **maturity**; (2) **ease of integration "like
GHDL"** — one process, diagnostics on stderr, nothing for the student to
install; (3) **licence** — redistributable inside a GPL-2.0-only installer;
(4) **a Windows binary** that is reproducible, pinned, small and relocatable;
(5) **fit to the interactive model** of `ghdl_implementation_plan.md` § 5 —
one persistent process that polls an input file, publishes an output file,
and is held to real time by blocking reads, stoppable by killing it.

### 2.2 Comparison

| | Icarus Verilog | Verilator | Yosys (`sim`) | CVC / GPL Cver | ModelSim / Questa / Vivado xsim |
|---|---|---|---|---|---|
| Kind | Event-driven interpreter (`iverilog` → bytecode → `vvp`) | Compiles Verilog to C++, then builds it | Synthesis suite with a `sim` pass | Older interpreters | Commercial |
| Licence | GPL-2.0-or-later (source headers, MSYS2 metadata) | LGPL-3.0 **or** Artistic-2.0 | ISC | CVC "modified Artistic"; Cver GPL | Proprietary |
| Maturity | Decades; 13.0 stable 2026-03-02; active | Very mature, very active | Very active (v0.69, 2026-09-09) | No sign of recent maintenance (not tested) | Very mature |
| Windows binary | Yes — MSYS2 package (13.0); bleyer.org (12.0 / a v14 snapshot); **no v13 installer on bleyer.org** | None mentioned in the install guide; build from source; Make + C++ compiler | Releases carry a source tarball; Windows builds via the OSS CAD Suite (≈ 600 MB) | Not investigated | Vendor installers |
| Needed on the student's PC | Nothing extra | C++ compiler + GNU Make, every run | Nothing once packaged | — | Vendor install + licence |
| Run-time model | 4-state, event-driven, real `#` delays, `$fopen`/`$fscanf`/`$fgets` | 2-state by default (4-state "experimental, for developer use only"); C++ build per design | Netlist simulation, not a testbench-process model | — | — |
| Fit to § 2.1 #5 | **Verified (§ 4)** | Would need a C++ build on every Start | Not a live testbench model (not spiked) | — | Not redistributable |
| Verdict | **Recommended** | Rejected | Rejected as simulator | Rejected | Rejected |

### 2.3 Notes

**Icarus.** README: "compile ALL of the Verilog HDL, as described in the IEEE
1364 standard" plus "a (slowly growing) subset of the SystemVerilog language".
Default generation is IEEE 1364-2005; `-g2012` enables the SystemVerilog
subset, and a `.sv` extension does **not** switch it on (tested, M13).

**Verilator.** Turns Verilog into C++; `--binary` is an alias for `--main
--exe --build --timing`, and `--build` "requires GNU Make". Its install guide
lists Windows as tested with MSVC and built under Cygwin/MinGW/WSL2. Excellent
for large synthesizable designs; the wrong shape for "press Start, see the
LED", where a per-run C++ build would turn a 100 ms compile into many seconds
and put a C++ toolchain on every student's PC. Its `--lint-only` mode would be
a good *optional* checker later.

**Yosys.** ISC-licensed and the natural home of a "synthesis check", but
releases carry only a source tarball and Windows builds come from the OSS CAD
Suite (`oss-cad-suite-windows-x64-20260926.tgz`, ≈ 600 MB). Its `sim` command
is documented as simulating the circuit with VCD/FST output; not spiked, and
not expected to host a live file-polling, stdin-paced testbench.

**CVC / GPL Cver.** OSS CVC is under a "modified Artistic" licence; GPL Cver is
a Verilog-1995 plus partial-2001 interpreter. No evidence of recent
maintenance found; not spiked.

**Commercial (ModelSim/Questa Intel FPGA, Vivado xsim).** Free to download is
not free to redistribute; each would need a per-student install.

### 2.4 Version: 13.0

13.0 is the current stable. 12.0 (Debian stable) was tested end to end with the
same testbench, `-i` flag and diagnostics and behaves identically for
everything in § 4 (M12), so a Linux server on 12.0 works. `bleyer.org` lists
`v14-20260804` (a master snapshot) — not for a course tool. The Windows
binaries come from MSYS2's `ucrt64` packages, the same toolchain family as the
vendored GHDL (`ghdl-mcode-5.0.1-ucrt64.zip`); both target the Windows 10+
system C runtime.

---

## 3. Licensing and redistribution

Not legal advice — the same reasoning that already covers GHDL in
`winInstaller/electron/build/license.txt`.

### 3.1 What would ship

Licences are the `license` field of the exact pinned MSYS2 packages (§ 5.8).

| Component | Files | Licence |
|---|---|---|
| Icarus Verilog 13.0 | `iverilog.exe`, `vvp.exe`, `ivl.exe`, `ivlpp.exe`, `*.vpi`, `*.tgt`, `*.conf` | GPL-2.0-or-later (headers read "either version 2 of the License, or (at your option) any later version", checked in `vvp/main.cc`, `vpi_user.h`, `ivl_target.h` at tag `v13_0`) |
| GNU Readline 8.3 | `libreadline8.dll`, `libhistory8.dll` | **GPL-3.0-or-later** (linked by `vvp.exe` for its interactive prompt) |
| termcap 1.3.1 | `libtermcap-0.dll` | GPL / LGPL |
| GCC runtime | `libgcc_s_seh-1.dll`, `libstdc++-6.dll` | GPL-3.0-or-later **with GCC Runtime Library Exception 3.1** |
| winpthreads | `libwinpthread-1.dll` | MIT AND BSD-3-Clause-Clear |
| zlib | `zlib1.dll` | Zlib |
| bzip2 | `libbz2-1.dll` | bzip2 (custom, permissive) |

### 3.2 Why this is compatible with HDLBoard

- HDLBoard starts `iverilog.exe` and `vvp.exe` as **separate programs**
  through `spawn`, never linking them — the relationship it already has with
  `ghdl.exe` and states in `license.txt` ("separate works, distributed here
  only for convenience"). That is aggregation, so the components' licences
  need not match HDLBoard's.
- The one GPL-3.0 piece, Readline, is linked *inside* `vvp.exe`, which is
  GPL-2.0-or-later; the "or later" clause is what lets that combination be
  distributed under GPL-3.0 — the ordinary situation for any such program.
  It does not reach HDLBoard's own code because of the process boundary. (I
  checked the licence fields, not how MSYS2 words the combined result — hence
  the caveat above.)
- HDLBoard's Node backend and frontend never load any of these libraries.

### 3.3 Obligations (each is a step — G3)

1. An **Icarus Verilog** section (and a line for the runtime libraries) in
   `license.txt`, in the GHDL section's form.
2. The licence texts installed under `resources\iverilog\` (Icarus's `COPYING`
   is in the package at `share/licenses/iverilog/COPYING`).
3. A `VERSION.txt` with exact package versions and SHA-256s.
4. **Source availability.** MSYS2 publishes a source package for each binary —
   verified present:
   `https://repo.msys2.org/mingw/sources/mingw-w64-iverilog-1~13.0-2.src.tar.zst`
   (and `…readline-8.3.003-1…`, `…gcc-16.2.0-4…`); recipe
   `https://github.com/msys2/MINGW-packages/tree/master/mingw-w64-iverilog`;
   upstream `https://github.com/steveicarus/iverilog` at tag `v13_0`.
   `license.txt` names these, as it names GHDL's tag.
5. The existing unsigned-installer note covers these binaries (the Icarus
   release notes themselves say Windows binaries "will be unsigned").

---

## 4. Measurements — what was run

On the development machine, with the extracted MSYS2 `ucrt64` packages, `PATH`
reduced to `C:\Windows\System32` unless stated, from
`…\T Rune Langøy\iverilog\` (a space and a non-ASCII letter, on purpose). The
harness was a Node script that drives `vvp` the way `session.ts` drives GHDL
(spawn, stdin grants, file polling).

| # | Question | Result |
|---|---|---|
| M1 | Runs relocatably — no install, registry or Cygwin? | **Yes**, once the DLLs are placed correctly (M2). `iverilog -V` → `Icarus Verilog version 13.0 (stable) (v13_0)`. |
| M2 | What DLLs, where? | `iverilog.exe` spawns `lib/ivl/ivl.exe`, which loads `system.vpi`; Windows resolves their imports from the *loading executable's own directory*. DLLs only in `bin/` → `STATUS_DLL_NOT_FOUND` (`-1073741515`); `zlib1.dll`/`libbz2-1.dll` missing from `lib/ivl/` → `Failed to open '…system.vpi'` yet exit 0. Fixes that work: the DLLs duplicated beside both (≈ 3 MB extra), a `PATH` prepend (needs every spawn to carry the environment), and **one flat directory with `iverilog -B` / `vvp -M` — chosen (M21)**. The default `.vpi` names (`system`, `vhdl_sys`, `vhdl_textio`, `va_math`, `v2005_math`, `v2009`) are compiled into `iverilog.exe` (`vvp.conf` is four lines and does not list them) — keep every `.vpi`. |
| M3 | Speed | Compile (`iverilog -Wall -s … tb.v design.v`): **65–105 ms** warm, ≈ 280 ms cold. `vvp` start-up ≈ 100 ms. Not compared with GHDL's `-a`+`-e`. |
| M4 | Does `$display` reach the console live? | **Not by default.** Through a pipe `vvp` block-buffers: with `-n` alone `design says hi at 0` never arrived in 3.5 s. With **`vvp -n -i`** it arrived at 0.02 s and later lines within milliseconds. `-i` is documented as "makes all stdout output unbuffered". |
| M5 | Does stdin pacing work? | **Yes.** The testbench blocks in `$fgets(line, 32'h8000_0000)` (Verilog's stdin) once per 20 ms of simulated time; the harness writes one line per 20 ms of real time. Clockless design, 250 ms blink: **3520 ms simulated in 3517 ms real**. With 100 000 grants pre-loaded: **≈ 74 s simulated in 4 s real (~18×)** — so the blocking read is what holds it to real time. |
| M6 | Throughput with a 50 MHz clock | ≈ **60 ms simulated in 4 s real (0.015×)**. Slow motion, as with GHDL (`ghdl_implementation_plan.md` § 5.5 reports ≈ 0.0015× for GHDL on a different design/machine — **not like-for-like**). Same `CLOCK_500Hz` remedy. |
| M7 | Input queue round trip | Written at 1.08 s, applied and acknowledged in the very next output (one 20–30 ms poll). |
| M8 | Diagnostics | On **stderr**, `file:line: error: …` / `warning: …`; exit 2 on error (Appendix B). |
| M9 | `$stop`, `$finish`, `$fatal` | `vvp -n`: `$stop` prints `file:line: $stop called at 5 (1s)` and **exits 0**; `$finish` prints `… $finish called at … (1ps)` and exits 0; `$fatal` prints `FATAL: file:line: boom` and **exits 1**. |
| M10 | Can Icarus report ports itself? | Yes: `iverilog -tstub -s Top …` lists each root-module port with direction, width and exact case. A debug dump, not a stable interface — revision 2 therefore planned a source scanner; **revision 3 uses this as the source of the ports** after M22 showed the scanner would get real designs wrong (§ 5.4, steps C1–C3). |
| M11 | Non-ASCII directory | **Absolute** `+input_file=<path with ø>`: runs, but no output/heartbeat file is ever produced — **silent failure**. **Relative** names with `cwd` = that directory: fine. |
| M12 | 12.0 vs 13.0 | Same testbench, `-n -i`, error format and result on 12.0. |
| M13 | Default language | IEEE 1364-2005; `.sv` not auto-detected. |
| M14 | Unpack `.pkg.tar.zst` with no extra tools? | Yes: Windows' `System32\tar.exe` (bsdtar 3.8.8, libzstd 1.5.7). 7-Zip 25.01 also (two steps). |
| M15 | Can a design run shell commands? | No: `$system(...)` → `Error: System task/function $system() is not defined by any module`. |
| M16 | Size | The spike tree (30 files, without the `*-s.conf` variants the deny-list keeps — a few KB): ≈ 12 MB on disk, **2.2 MB** LZMA2 (7-Zip `-mx=9`). Installer today 88.7 MB. |
| M17 | Timescale inheritance | Tested with `$printtimescale`: a file with no directive reports `1s / 1s` when compiled first, `1ns / 1ps` after a file that has one. |
| M18 | Where does `$finish`'s message go? | **stdout** — so it flows into `LOG` with the student's output. |
| M19 | `-Wall` noise | `-Wall` warns `timescale for X inherited from another file` for **every** design that lacks a directive — i.e. every normal synthesizable file, on every run. **`-Wall -Wno-timescale`** is clean on all fixtures and still reports real problems (port-width padding, Appendix B). |
| M20 | Do the converted starters work end to end? | **Yes.** All three (Appendix C) compiled clean under `-Wall -Wno-timescale` and were driven through the full board protocol (52-bit state, input queue with acknowledgements, dwell rule, pacing) by a throwaway driver: `DE1_SoC.v` 4/4, `counter8` 5/5, `blinkTest.v` 3/3 (blink on at **241 ms**, off **247 ms** later, target 250). The self-checking `tb_counter8.v` ran in batch mode and printed `PASS`. |
| M21 | Can one flat directory with a single DLL copy work? | **Yes.** `iverilog.exe`, `vvp.exe`, `ivl.exe`, `ivlpp.exe`, the eight DLLs (one copy each) and the `.vpi`/`.tgt`/`.conf` files in one directory; `iverilog -B<dir>` and `vvp -M<dir>`; `PATH` = `System32` only; from `…\T Rune Langøy\…`: compiled and passed the full `DE1_SoC` scenario (4/4). **8.3 MB** (against ≈ 12 MB with duplicated DLLs). **`-B` must be a backslash path**: with `C:/Users/…`, `iverilog` starts `ivl` through `cmd.exe`, which answers `'C:' is not recognized as an internal or external command`. |
| M22 | Can Icarus supply the ports instead of a hand-written parser? | **Yes.** `iverilog -E` resolves `` `include``, `` `ifdef`` and macros but **keeps comments**. `iverilog -tstub -s <top>` on a test design with an `` `ifdef``'d-out port (`NEVER_PORT`), macro-sized widths (`` [`BOARD_W-1:0] ``), a generate loop, a parameter list and `(* keep *)` reported exactly the ports that exist (`CLOCK_50`, `KEY_N`, `LEDR`, `SW`, with widths), **identically on 12.0 and 13.0**; child scopes (`top.g[0]`…) follow and are ignored. A design that does not elaborate fails with the ordinary compile error. |
| M23 | Includes | A nested chain six deep works. A missing include: `miss.v:2: Include file nope.vh not found`, exit 1 in ≈ 0.1 s. A circular include fails fast (≈ 0.1 s, no hang) with `./a.vh:2: Include file b.vh not found` — findable, though it does not say "circular"; shown verbatim. |
| M24 | Large project | 101 files (a chain of 100 modules, each instantiating the next, plus a top): compile **93 ms**, `-tstub` **120 ms** (a 12 106-line stub file). |
| M25 | Output flood | A design printing on every edge of a 50 MHz clock produced **≈ 215 000 lines/s (2.8 MB/s)** into Node through `vvp -n -i`. **Nothing throttles it:** `session.ts` forwards each line as a `LOG` frame (lines 366 and 510) and `Workbench.tsx`'s `appendLog` copies the whole console array per line (`[...prev, line]`, no cap). The browser's reaction was not measured — expected to stall within seconds. GHDL's `report` in a clocked process has the same path (likely at a lower rate; not measured). |

**Not measured:** POSIX behaviour of the stdin pacing (Windows and POSIX pipes
block the same way, but step H2 makes it a gate); a browser click through the
whole stack; real-time antivirus on a student machine; very large designs beyond 101 files; the browser's behaviour under an output flood (M25); high-frequency board-state updates (bounded by the poll interval and Node's 20 ms read, so no flood path — analysed, not stress-tested);
GHDL behaviour on the Verilog-equivalent scenarios (parity, § 7.6, is
specified but was not run).

---

## 5. Design

### 5.1 Engine and top selection — no protocol change

`RUN <topFile>` already carries the top file's name, and that one fact decides
both questions below. `protocol.ts`, the framing and `PROTOCOL_VERSION`
(`'1'`) do not change.

**Which engine.** By the top file's extension: `.v` → Verilog; `.vhd`/`.vhdl`
→ GHDL. The frontend's only job is to send the *right files* — those in the
top file's folder. Files that do not all belong to the top file's language get
a clear `ERROR analyze`, not a guess.

**Which design unit is the top.** The selected top file names it. One
deterministic rule per language, the same idea in both — *the top file
decides* — and no scoring anywhere on the Verilog side:

| | VHDL (today) | Verilog (new) |
|---|---|---|
| Top file marked (`RUN <topFile>`) | the **first entity** declared in that file | the module in that file that is **the only one, or is named like the file** (case-insensitive) |
| Several modules, none named like the file | — | **an error that lists the candidates** and says how to fix it |
| No top file marked | entities are scored against the board ports (the existing fallback) | **cannot happen**: without a `.v` top file the engine is VHDL |

Example message: `Top file blink.v declares 2 modules (counter, blink_top) and
none is named "blink". Name the top module after its file, or move the helper
modules into their own files.`

The two rules differ in one detail — VHDL takes the *first* entity, Verilog the
*named-or-only* module — because a Verilog file that holds helpers before its
top is common and "first declared" would pick the wrong one. Both answer "which
unit does this file stand for", and neither guesses.

### 5.2 The board contract for Verilog

Same board, same names as `ghdl_implementation_plan.md` § 3.2, so a design
moves between languages by translating, not re-wiring.

| Port | Dir | Width | Notes |
|---|---|---|---|
| `CLOCK_50` | in | 1 | 20 ns period, generated only if declared |
| `CLOCK_500Hz` | in | 1 | simulator-only, 2 ms period, always generated |
| `SW` | in | 10 | |
| `KEY_N` | in | 4 | active low |
| `LEDR` | out | 10 | |
| `HEX0_N` … `HEX5_N` | out | 7 each | active low |

- **Matching is case-insensitive; connection uses the declared spelling** —
  `Clock_50` must not fail over capitalisation where VHDL would not.
- Only declared ports are connected; each undeclared output is tied to its
  "off" value (`LEDR` `0`, `HEX*` `7'h7F`).
- **No `rst`** (§ 9 #5): in VHDL it is legacy tolerance; Verilog has no legacy.
- A width mismatch is Icarus's usual *warning* (padded/truncated), shown in the
  console.

### 5.3 Run modes — the same two as VHDL

| | Trigger | What runs |
|---|---|---|
| **board** | The top module declares **at least one board port** — `CLOCK_50`, `CLOCK_500Hz`, `SW`, `KEY_N`, `LEDR`, `HEX0_N`…`HEX5_N`, matched case-insensitively | Generated `hdl_board_tb` wraps it; one persistent `vvp` polls `input.txt`, publishes `output.txt`, paced from stdin. Same `READY`/`STATE`/`STIM`/`RESET`/`STOP`. |
| **batch** | Anything else: no ports (a self-contained testbench), or ports that are none of the board's (e.g. `output reg done`) | No wrapper; `iverilog -s <top>`, `vvp -n -i`, bounded by the 60 s batch timeout. Ends with `DONE completed`. |

"Has ports" is not the test, because a testbench can have ports. A **portful
top with no board port** runs standalone, and the console says so first, so a
misspelled board design (`LEDS` for `LEDR`) is told why nothing lights up:
`Top module 'x' declares none of the board's ports (CLOCK_50, CLOCK_500Hz, SW,
KEY_N, LEDR, HEX0_N…HEX5_N), so it runs as a standalone testbench. If it is a
board design, check the port names.` VHDL treats that case as an error today;
the difference is recorded in § 9 #14.

### 5.4 The compile pipeline

Everything happens in the session's temp directory (`cwd`), with **relative
file names only** (M11). Up to three tool runs. `<flags>` is empty for a system
install (Linux: `iverilog` and `vvp` on `PATH`) and, for the bundled Windows
build, `-B<dir>` (`iverilog`) or `-M<dir>` (`vvp`) with the flat tool directory
as a **backslash Windows path** (M21).

```
1. iverilog <flags> -Wno-timescale -I. -s <top> -tstub -o ports.stub  _hdlboard_ts.v <student .v files>
2. iverilog <flags> -Wall -Wno-timescale -I. -s <run target> -o sim.vvp  _hdlboard_ts.v [hdl_board_tb.v] <student .v files>
3. vvp <flags> -n -i sim.vvp +input_file=input.txt +output_file=output.txt
                    +heartbeat_file=heartbeat-N.txt +poll_interval_ns=… +min_dwell_ns=…
```

- **Step 1 asks Icarus what the top's ports are** instead of HDLBoard parsing
  Verilog. Icarus resolves `` `include``, `` `ifdef``, macros, parameters,
  generate blocks and attributes; a hand-written scanner gets those wrong
  (M22). If the design does not elaborate, step 1's diagnostics *are* the
  compile error the student sees — once, from the student's own top.
- **The only Verilog text HDLBoard reads** is the top file's module names
  (`moduleNames`: strip comments and strings, match `module <name>`), to apply
  the rule of § 5.1. Nothing else is parsed.
- **Format dependence.** `-tstub` is a debug dump, not a stable interface. It
  was identical on 12.0 and 13.0 (M22); it is guarded by golden sample files
  (Appendix B), the version check (§ 5.5) and the integration tests, so a
  future change fails a test instead of a student.
- **Run target.** Board mode: `hdl_board_tb` (the student's module is reached
  by instantiation). Batch mode: the top itself, with no wrapper in step 2.
- **Timescale.** A file without `` `timescale `` runs at 1 s and inherits from
  the file compiled before it (M17). The backend writes `_hdlboard_ts.v` — only
  `` `timescale 1ns/1ps `` — and passes it **first**; the wrapper carries its
  own directive too. Files that set a timescale keep it and pass it on to later
  files (a language quirk; documented, not fought).
- **`-Wall -Wno-timescale`** (M19): the simulator's own warnings, minus the one
  that fires on every ordinary design.
- **Reserved names.** `_hdlboard_ts.v`, `hdl_board_tb.v`, `ports.stub`,
  `sim.vvp` are generated; a student file with one of those names, a path
  separator, `..`, a leading `-`, or an absolute path is rejected before
  anything is written (step C6). `.vh` files are written (so `` `include "x.vh" ``
  resolves through `-I.`) but not listed as compile units.
- Each tool run is bounded by the 30 s build timeout. **No fixed-point ordering
  loop** (the GHDL flow needs one): `iverilog` resolves module references across
  all files in one run.
- `sim.vvp`'s first line is `#! /ucrt64/bin/vvp` (baked in by MSYS2). Harmless:
  HDLBoard always runs `vvp.exe` explicitly.

### 5.5 What the console shows

Every row is real output (Appendix B).

| Source | Goes to | Notes |
|---|---|---|
| `iverilog -V`, first line | `LOG` at run start | Read from the binary, not hard-coded (the GHDL path hard-codes `'GHDL 5.0.1 (mcode)'` at `session.ts:289`). |
| An Icarus major version outside the tested set (12.x, 13.x) | one `LOG` warning at run start | `Icarus Verilog 14.0 has not been tested with HDLBoard (tested: 12.x, 13.x); if compiling or running misbehaves, install 13.0.` **Never blocks a run.** |
| `iverilog` stderr on **success** (warnings) | `LOG`, per line, verbatim | The GHDL path discards `ghdl -a` warnings on success; Verilog keeps them — they are the simulator's messages. |
| `iverilog` stderr on **failure** | `ERROR analyze` / `elaborate`, verbatim | `file:line: error: …`, exit 2. |
| `vvp` stdout, per line | `LOG`, verbatim, blank lines dropped | The student's `$display`/`$write`/`$monitor` and the simulator's own `…: $finish called at …` / `$stop called at …`. |
| `vvp` stderr + non-zero exit | `ERROR runtime` | `$fatal` → exit 1, `FATAL: …` |
| `vvp` exit 0, batch mode | `DONE completed` | |
| `vvp` exit 0, board mode | `DONE completed` | New: today's handler is silent (E5). |

Stage for a compile failure: `elaborate` if the text contains `error(s) during
elaboration` or `Unable to find the root module`, else `analyze` (Icarus does
both in one step; this is a cosmetic mapping onto the two stages the frontend
prints as `"<stage> error:\n<text>"`).

**Output limits (found by M25).** A design that prints on every clock edge
produces ≈ 215 000 lines/s and nothing throttles it today. Two small,
engine-independent guards:

- **Server** (`Session`, one place for both engines): at most
  `LOG_LINES_PER_SECOND` (200) lines are forwarded per one-second window; the
  rest are counted and summarised with one line when the window ends —
  `… 84 213 more lines not shown (output limit: 200 lines/s)`.
- **Console** (`Workbench.appendLog`): keeps the newest `MAX_CONSOLE_LINES`
  (2 000); older lines drop off. No visible UI change.

The numbers are starting points, tuned by case I-V21. This also protects GHDL
runs (a `report` in a clocked process) — a behaviour change only under flood.

### 5.6 Board mode: what differs from VHDL

The stimulus queue and acknowledgements, `PACING_STEP_MS`, poll intervals
(10 µs with `CLOCK_50`, 1 ms without), heartbeat, `RESET`, `STOP` and teardown
are engine-independent and reused unchanged: the *files and the pacing grant*
are the interface. Differences:

- **Generics → plusargs** (`+input_file=…` read with `$value$plusargs`); no
  recompile per run.
- **Pacing is stdin on every platform** (no `mkfifo`). Verified on Windows
  (M5); Linux is gate H2.
- **`X`/`Z`**: Verilog prints `x`/`z`; `STATE` allows `0`/`1`/`X`, so
  `pollOutput` normalises `[xXzZ]` → `X` (E5; a no-op for VHDL output).
- **Truncated reads**: as with GHDL's testbench, the output file is opened,
  written and closed on each change; `pollOutput` already ignores anything not
  exactly 52 bits.

### 5.7 The engine seam

`session.ts` (641 lines) does two jobs: *orchestrate a session* (stimulus queue,
pacing, polling, teardown — engine-independent) and *drive GHDL* (analysis
loop, top detection, testbench, elaboration). Adding Verilog by branching would
bury the first under the second. Instead the second becomes an interface:

```ts
export type Language = 'vhdl' | 'verilog';

export interface PrepareRequest {
  readonly dir: string;                       // the session's temp directory
  readonly files: readonly SourceFile[];
  readonly topFile?: string;
}

export interface RunPlan {
  readonly mode: 'board' | 'batch';
  readonly runTarget: string;                 // what the simulator is told to run
  readonly timing: BoardTiming;               // poll interval and dwell: the engine's policy, not the session's
  readonly pacing: 'fifo' | 'stdin';
  readonly messages: readonly string[];       // banner and compile warnings → LOG
}

export type PrepareResult =
  | { readonly ok: true; readonly plan: RunPlan }
  | { readonly ok: false; readonly stage: ErrorStage; readonly text: string };

export interface SimEngine {
  readonly language: Language;
  prepare(request: PrepareRequest): Promise<PrepareResult>;
  startBoardRun(plan: RunPlan, files: BoardFiles, timing: BoardTiming): RunHandle;
  startBatchRun(plan: RunPlan, onOutput: (line: string) => void, timeoutMs: number): BatchHandle;
}
```

`Session` asks `selectEngine(topFile)` once, calls `prepare`, forwards
`plan.messages` as `LOG`, then starts a board or batch run. `GhdlEngine` is the
current GHDL code *moved*, not rewritten; `VerilogEngine` is new. `RunHandle`
and `BatchHandle` already exist in `ghdl.ts` (moved to `runtime.ts`, D1). The
refactor is done **after** characterization tests pin today's GHDL behaviour
(A5–A6), so "byte-identical" is checked, not hoped for.

**What the seam deliberately does not hide.** `mode` (board or batch) and
`pacing` stay in the plan because the stimulus queue, output polling and
pacing loop are the same for every engine that speaks the file protocol —
moving them into each engine would duplicate them for engines that do not
exist. A future engine fits the seam if it can honour the file protocol; one
that cannot (a remote executor, say) needs its own adaptation, which is a new
design and not something to pre-build now.

### 5.8 Windows packaging (reference for phases B and G)

Same recipe as GHDL (`fetch-ghdl.ps1` → `vendor/ghdl` → `resources/ghdl` →
`extraResources`), except Icarus has no self-contained zip, so the tree is
*assembled* from pinned MSYS2 packages — the whole of the packaging risk,
hence spiked (§ 4) and smoke-tested at build time (B3).

```
resources/iverilog/            <- ONE flat directory (M21)
  iverilog.exe  vvp.exe  ivl.exe  ivlpp.exe
  libgcc_s_seh-1.dll  libstdc++-6.dll  libwinpthread-1.dll  zlib1.dll  libbz2-1.dll
  libreadline8.dll  libhistory8.dll  libtermcap-0.dll        <- one copy of each
  *.vpi   vvp.conf vvp.tgt   null/stub tgt+conf (+ -s variants)
  COPYING   licenses/<package>/…   VERSION.txt
```

Run as `iverilog -B<dir> …` and `vvp -M<dir> …`, with `<dir>` a **backslash**
Windows path (M21). ≈ 8 MB on disk, ≈ 2 MB compressed. One copy of every DLL
means a later package bump cannot leave two versions behind, and nothing depends
on `PATH`.

Pins (all from `https://repo.msys2.org/mingw/ucrt64/`; recompute if any pin is
bumped — do not paste from here without re-verifying):

| Package file | Bytes | SHA-256 |
|---|---|---|
| `mingw-w64-ucrt-x86_64-iverilog-1~13.0-2-any.pkg.tar.zst` | 1 988 347 | `FD4D7D7CB60CDA1EB437F5476673503D92964CF47CE6C11B460EB3BD05C43582` |
| `mingw-w64-ucrt-x86_64-readline-8.3.003-1-any.pkg.tar.zst` | 513 820 | `DE2423C2E10FCD88272A0AB2F833F6A082CFE613D4C17C2F548CC50A5D2190C4` |
| `mingw-w64-ucrt-x86_64-termcap-1.3.1-7-any.pkg.tar.zst` | 27 912 | `17B78EB63E89458A6AE4D56AA1DC357E1DECB2F845B29FDED79BCCDD628D9D41` |
| `mingw-w64-ucrt-x86_64-zlib-1.3.2-2-any.pkg.tar.zst` | 111 475 | `841401182976D2F9E17E5C0EBAAC51F2A8014140EA53D67625E91C8FB3C85EA0` |
| `mingw-w64-ucrt-x86_64-bzip2-1.0.8-4-any.pkg.tar.zst` | 94 396 | `F03A2174034DDD2D96CECD34F617C5F8E2EF86C812B8D2BB3B8875257F2C8BFA` |
| `mingw-w64-ucrt-x86_64-libwinpthread-14.0.0.r426.g4564ee4b5-1-any.pkg.tar.zst` | 30 667 | `F8DE8153BBC0E47BA244A423C12C426FA1D9F56395117ECAA34C6AD6EBED6CA3` |
| `mingw-w64-ucrt-x86_64-libgcc-16.2.0-4-any.pkg.tar.zst` | 77 220 | `DE65B4ADAE899D9278427402E29D03860BACBA481794460F3A1D078610CBB783` |
| `mingw-w64-ucrt-x86_64-libstdc%2B%2B-16.2.0-4-any.pkg.tar.zst` (`+` percent-encoded) | 795 771 | `2211DBBF1220287E49F5D66BB6CB09EE5A157901A485197553C9A940CC902D5B` |

**Availability risk.** `repo.msys2.org` currently retains old versions (several
`readline` and `libwinpthread` builds were listed) but promises nothing.
Mitigations: cache `vendor/iverilog` (gitignored, like `vendor/ghdl`); or
re-host the *assembled* tree as a GitHub release asset (GHDL's zip already is
one). § 9 #7.

### 5.9 Linux / server mode

`scripts/start.sh` (lines 71–95) installs GHDL through whichever of `apt-get`,
`dnf`, `pacman`, `zypper`, `apk`, `brew` exists; `alpineInstall.sh` builds it.
Icarus is simply a package in all of those: Alpine `edge/community` carries
`iverilog` 13.0-r0; Debian stable 12.0-2, testing/unstable 13.0-2 (package
presence verified, not installation; Homebrew's formula is `icarus-verilog`,
to confirm when implementing). The backend needs only `iverilog` and `vvp` on
`PATH`, or `IVERILOG_EXE` / `VVP_EXE`.

### 5.10 Security

Same posture as `ghdl_implementation_plan.md` § 11: the desktop app binds
loopback and runs the student's own code on the student's own machine; server
mode is a LAN service whose trust boundary is "people you would hand a shell
to". Carried over: `spawn` with an argument array only, never a shell string;
no source content or file name on a command line; one session directory per
connection, deleted on teardown; the session cap. Verilog-specific:

- **`$system` is unavailable** (M15).
- Verilog can still **open arbitrary paths** (`$fopen`, `$readmemh`) and
  `` `include `` arbitrary files, as VHDL's `textio` can. Server mode is not a
  sandbox.
- Simulator-facing file names are **fixed, generated and relative**;
  student-supplied names are validated (C6) before being written or passed.
- No `-m`/`-M`/`-p` option ever comes from the client, so a design cannot load
  an arbitrary VPI module.

---

## 6. Code standard (Clean Code)

Code quality is a requirement, not a preference. The standard is *Clean Code*
(Robert C. Martin), adapted to TypeScript/Node/React and to conventions this
repository already follows. **Every step in § 8 must meet it; § 6.4 is the
checklist; phase I verifies it after the fact.**

### 6.1 The rules

Each rule is written so it can be checked, and names where this plan applies it.

| # | Rule | How it is checked | Applied here |
|---|---|---|---|
| 1 | **Names reveal intent.** Types and modules are nouns, functions are verbs, booleans read as predicates (`isBoardDesign`, `isReservedName`). No cryptic abbreviations beyond the board's own vocabulary (`sw`, `key`, `ledr`, `hex`, `tb`). | Cold read (§ 7.9) — any name that needs a comment is renamed | `chooseTopModule`, `buildBoardTestbench`, `classifyCompileFailure`, `folderForUpload` |
| 2 | **Small functions, one thing each.** Aim ≤ 20 lines; hard cap 40 (the Verilog template literal in `testbench.ts` is data, not logic, and is exempt). One level of abstraction per function. If describing it needs "and", split it. | Lint rule `max-lines-per-function` (§ 6.3) + cold read | `ports.ts` = `moduleNames`, `parseStubPorts`, `isBoardDesign`, `chooseTopModule` |
| 3 | **At most three parameters.** More → a named options type. **No boolean flag parameters** — two functions instead. | Lint `max-params` | `PrepareRequest`, `BoardFiles`, `BoardTiming` |
| 4 | **Single responsibility per module; pure logic apart from I/O.** Parsing, generation, classification and validation are pure functions (no `fs`, no `spawn`, no `Date`), so they are unit-testable without a simulator. Processes and files live in a thin layer around them. | Import scan: pure modules import nothing from `node:*` | `ports`, `testbench`, `diagnostics`, `fileNames`, `fileKinds` are pure; `process.ts` is the thin process layer |
| 5 | **Polymorphism over conditionals.** One dispatch point (`selectEngine`) — no `if (language === 'verilog')` scattered through `Session`. | Grep for the language literal outside `selectEngine` and the engines | § 5.7 |
| 6 | **No duplication (DRY).** Shared code is extracted (`runtime.ts`), not copied; the two engines share by composition. | Cold read; `/simplify` pass (I3) | D1 |
| 7 | **Dependencies point one way.** `Session` → `SimEngine`; engines never import `Session`; pure modules import no process code. | Import graph read in I1 | § 5.7 |
| 8 | **Comments explain *why*, never *what*.** Match the repository's existing style (its comments carry the reason a decision was made, with the measurement behind it). No commented-out code; no `TODO` without a written follow-up; every exported symbol gets a doc comment saying what a caller may rely on. | Cold read | every step |
| 9 | **No magic numbers or strings.** Named constants with the reason, as `PACING_STEP_MS` already does. | Lint `no-magic-numbers` (warn) on new files | `BUILD_TIMEOUT_MS`, `RESERVED_FILE_NAMES`, `VVP_STDIN_FD` |
| 10 | **Expected failures are values; only bugs throw.** A compile error is a `PrepareResult` with `ok: false`, not an exception. Nothing is swallowed silently except where a comment says why (the existing `EPIPE` guard). | Review; tests assert the failure *values* | § 5.7 |
| 11 | **Types carry meaning.** No `any`, no non-null `!` without a comment, `readonly` on data that is not mutated, discriminated unions instead of flag fields. | `tsc` strict + lint `no-explicit-any` | `PrepareResult`, `Language` |
| 12 | **Tests are first-class code** — Fast, Independent, Repeatable, Self-validating, Timely (F.I.R.S.T.); one behaviour per test; a test name reads as a sentence; no logic (loops, conditionals) inside a test body; arrange-act-assert. | Read the spec-reporter output (§ 7.9) | § 7 |
| 13 | **Leave it cleaner, but do not refactor what you are not changing.** GHDL logic moves only under characterization tests (A5–A6), and only its structure changes, never its behaviour. | A5–A6 stay green through E2 | E2 |
| 14 | **Consistency with the surrounding code.** SPDX header and copyright on every new file (as every existing file has); 2-space indent, single quotes, semicolons; `.js` suffix on server imports (NodeNext); `spawn(cmd, argsArray)` only, never a shell string. | Diff review; `tsc` | every step |

### 6.2 Structure of the new code

```
server/src/
  runtime.ts              shared: CmdResult, runCmd, RunHandle, BatchHandle, lineSplitter   (moved from ghdl.ts)
  outputLimiter.ts        pure — per-second LOG line budget (clock injected)
  engines/
    types.ts              SimEngine, PrepareRequest, RunPlan, PrepareResult, …      (interfaces only)
    selectEngine.ts       language from top file name; the single dispatch point
    ghdlEngine.ts         the current GHDL logic, moved
    verilogEngine.ts      compile → plan → runs, composed from the modules below
  verilog/
    ports.ts              pure — module names, stub-port parsing, board detection, top choice
    testbench.ts          pure — generate hdl_board_tb
    diagnostics.ts        pure — compile-failure stage, banner parsing
    fileNames.ts          pure — reserved / unsafe name validation
    toolPaths.ts          pure — which iverilog/vvp to run and whether to pass -B/-M
    process.ts            thin — iverilog and vvp spawning (RunHandle/BatchHandle)
src/components/workbench/
  fileKinds.ts            pure — extension → folder, top → source folder, rename → folder
  consoleLines.ts         pure — append with a newest-N cap
tests/fixtures/           the shared fixture set (§ 7.3)
```

(File names in § 8 follow this layout. Move `ghdl.ts`/`tbTemplate.ts`/
`portDetect.ts` under `engines/ghdl/` only if it can be done as pure renames in
its own commit; it is not required.)

### 6.3 Enforcement

1. **`tsc` strict** — already on in both packages (`strict`, `noUnusedLocals`,
   `noUnusedParameters`, `noImplicitReturns`); a step is not done with a
   single error.
2. **Scoped lint rules** (step A3, recommended): ESLint with
   `typescript-eslint`, applied **only to the new files** so existing code is
   not churned —
   `max-lines-per-function: 40`, `max-params: 3`, `complexity: 8`,
   `max-depth: 3`, `@typescript-eslint/no-explicit-any`,
   `@typescript-eslint/no-non-null-assertion`, `no-magic-numbers` (warn).
   A `// eslint-disable` needs a comment saying why; the goal is zero.
   (§ 9 #12 if you would rather not add the dependency: the checklist and the
   cold read then carry the load.)
3. **Per-step self-review** against § 6.4.
4. **After implementation, phase I**: metrics, cold read, break-it checks,
   `/simplify`, `/code-review`.

### 6.4 The checklist (apply to every step's diff)

- [ ] Every function does one thing and fits on a screen; none takes a boolean flag or more than three parameters.
- [ ] Every name says what it is without a comment.
- [ ] No duplication with existing code (I looked in `ghdl.ts` / `session.ts` first).
- [ ] Pure logic is in a pure module; the process layer has no parsing in it.
- [ ] No `if (language …)` outside `selectEngine`.
- [ ] Expected failures return values; nothing is swallowed without a comment.
- [ ] No `any`, no unexplained `!`, no magic numbers.
- [ ] Comments say *why*; no dead code; SPDX header present.
- [ ] Tests were written first, seen failing, and read like a specification.
- [ ] `typecheck` clean, all tests green, GHDL characterization tests unchanged.

### 6.5 Definition of Done — applies to **every** step in § 8

1. The step's tests were written first and seen to fail for the right reason.
2. All tests pass: `npm test` in `server/` (and at the root for frontend steps),
   plus the characterization suite (A5–A6) once it exists.
3. `npm run typecheck` is clean in the affected package.
4. The § 6.4 checklist was applied to the diff.
5. **Commit per group** of closely related steps — the commit points are
   listed at the top of § 8 — as `Verilog <first id>–<last id>: <title>`,
   ending with the attribution line this repository uses. Never commit with a
   red test. The behaviour-changing steps (D1, E2, E3, E5, E7) keep a commit
   of their own so a regression bisects to one change.

---

## 7. Testing

### 7.1 Principles

- **Test the behaviour a student sees**, at the lowest level that can show it.
  Pure logic → unit tests; process behaviour → integration tests against the
  *real* simulators; the browser path → a few end-to-end tests; an installed
  build → a verification run (§ 7.8).
- **Real simulators, not mocks.** Every claim in § 4 came from running
  `iverilog`/`vvp`; the integration tests re-run those scenarios so a wrong
  assumption fails a test instead of a student's session.
- **One source of truth for expected behaviour**: the fixture set and its
  scenario file (§ 7.3) feed the integration, parity, end-to-end and
  installation tests alike.
- **Write the test first**; a test never seen to fail proves nothing (§ 6.5).
- **The GHDL path is protected before it is touched** (A5–A6).

### 7.2 Tooling and layout

The repository has no test runner, linter or formatter today (checked). The
plan adds the least that does the job:

| Layer | Runner | New dependency | Where | Command |
|---|---|---|---|---|
| Server unit | Node's built-in `node:test` | none | `server/src/**/*.test.ts`, compiled to `dist/` | `npm test` (in `server/`) |
| Server integration (real GHDL/Icarus) | `node:test`; each test **skips itself** if its simulator is not on `PATH` | none | `server/src/integration/*.test.ts` | `npm run test:integration` |
| Frontend unit (pure modules) | `vitest` | `vitest` (dev) — § 9 #11 | `src/**/*.test.ts` | `npm test` (root) |
| End to end (browser) | **Claude driving Chrome through the Chrome extension**, following a checked-in runbook (§ 7.7) — no Playwright | none (needs Chrome, the extension and a Claude session; not CI) | `tests/e2e/verilog-browser.md` | "run the runbook" (F6, I4) |
| Installation | `tools/verify-backend.mjs` (WebSocket client) + a clean-VM checklist | none | `tools/`, § 7.8 | § 7.8 |

`server/package.json` gains `"test": "tsc -b && node --test dist/"` and
`"test:integration": "tsc -b && node --test dist/integration/"`. Tests compile
into `dist/` but are never bundled: the installer's `build-backend.mjs` bundles
from the `server.ts` entry only.

Shared test helpers (each small, each tested by use): `WsTestClient` (connect,
`HELLO`, `run(files, top)`, `until(verb)`, `stim(bits)`), `requireTool(name)`
(skip-if-missing), `fixture(language, name)` (load from `tests/fixtures`),
`sessionDir()` (temp dir with cleanup).

### 7.3 The fixture set — the converted starter designs

`STARTER_FILES` in `files.ts` holds three VHDL designs. They are converted to
Verilog (Appendix C — **already converted and run**, M20) and both sets are
kept as fixtures, so the same scenario runs against GHDL and Icarus.

```
tests/fixtures/
  vhdl/     DE1_SoC.vhdl   blinkTest.vhdl   keyCouter2Led.vhdl        ← copies of the starters
  verilog/  DE1_SoC.v      blinkTest.v      keyCouter2Led.v   tb_counter8.v
  scenarios.json                                                     ← expected behaviour, both languages
```

| Fixture | Top | Ports used | Purpose | Verified (M20) |
|---|---|---|---|---|
| `DE1_SoC` | `DE1_SoC` | `CLOCK_50 SW KEY_N LEDR HEX0_N…HEX5_N` | Full board interface; combinational `LEDR = SW`; blank `HEX` | 4/4 checks |
| `blinkTest` | `blinkTest` | `CLOCK_500Hz SW KEY_N LEDR HEX*` | Sequential logic and **real-time pacing** (250 ms toggle) | 3/3, 241 / 247 ms |
| `keyCouter2Led` | `counter8` | `CLOCK_50 KEY_N LEDR` | Edge-triggered counting on the keys; partial interface; `CLOCK_50` present (slow-clock regime) | 5/5 |
| `tb_counter8` | `tb_counter8` | none | **Batch mode**: self-checking testbench, prints `PASS` | `PASS`, exit 0 |

`scenarios.json` holds, per fixture, an ordered list of steps
`{ "stim": "<SW10><KEY4>", "expect": { "ledr": "<10 bits>", "hex": "blank" } }`
and, for timed fixtures, `{ "within_ms": [150, 400] }`. It is the only place
expected values live. **A guard test asserts the `vhdl/` fixtures equal
`STARTER_FILES`** so the two cannot drift.

### 7.4 Unit test catalog

Written first (§ 6.5). "Case" ids are referenced by the steps.

**Port and top logic — `verilog/ports.ts` (steps C1–C3)**

| Id | Input | Expected |
|---|---|---|
| P-1 | `// module fake(input x);` and `/* module fake2; */` | Not module names |
| P-2 | A string literal containing `module fake;` | Not a module name |
| P-3 | `module A(...)`, `macromodule B`, two modules in one file | `A`, `B`, in source order |
| P-4 | Golden `-tstub` text, 13.0, a simple design (`DE1_SoC`) | Ports with declared spelling, direction and width |
| P-5 | Golden `-tstub` text, **12.0 and 13.0**, the tricky design (`` `ifdef``, macro widths, generate, parameters, attributes) | Exactly `CLOCK_50`, `KEY_N`, `LEDR`, `SW`; nothing from the `` `ifdef``'d-out port; child scopes (`top.g[0]`…) ignored |
| P-6 | Stub text containing two root modules | Only the requested top's ports |
| P-7 | Stub text of a portless module | Empty port list |
| P-8 | Text that is not stub output | A failure value naming the problem (not an exception) |
| P-9 | Board detection for `{SW, LEDR}`, `{Clock_50}`, `{done}`, `{}` | board; board (case-insensitive, spelling preserved); **not** board; not board |
| P-10 | Top choice: one module in the top file | That module |
| P-11 | Several modules, one named like the file (case-insensitive) | That one |
| P-12 | Several modules, none named like the file | A failure value listing the candidates and the fix |
| P-13 | The top file declares no module | A failure value naming the file |

**Testbench generator — `verilog/testbench.ts` (steps C4–C5)**

| Id | Input | Expected |
|---|---|---|
| T-1 | Full-board port set | Golden file equals Appendix A byte for byte |
| T-2 | `SW` + `LEDR` only | Only those two connections; all `HEX` tied to `7'h7F`; no clock process |
| T-3 | `CLOCK_50` declared | `always #10` clock process present |
| T-4 | `CLOCK_50` not declared | No `always #10` process |
| T-5 | `CLOCK_500Hz` declared or not | 500 Hz process present in both cases |
| T-6 | `ledr` not declared | `assign ledr_sig = 10'b0;` |
| T-7 | Declared spelling `Clock_50` | Connection is `.Clock_50(clk_sig)` |
| T-8 | Top module name | Used verbatim in the instance line |
| T-9 | The 52-bit concatenation order | `{ledr, hex0 … hex5}` (matches the protocol) |
| T-10 | Generated text | Contains no `rst` handling (§ 5.2) |

**Diagnostics — `verilog/diagnostics.ts` (step C6)**

| Id | Input | Expected |
|---|---|---|
| D-1 | `… 2 error(s) during elaboration.` | stage `elaborate` |
| D-2 | `error: Unable to find the root module "Top"` | stage `elaborate` |
| D-3 | `x.v:2: syntax error` | stage `analyze` |
| D-4 | Empty stderr with non-zero exit | stage `analyze`, generic message |
| D-5 | First line of `iverilog -V` output | Banner extracted verbatim |
| D-6 | `Icarus Verilog version 13.0 (stable) (v13_0)` | Major 13, supported |
| D-7 | `Icarus Verilog version 12.0 (stable) ()` | Major 12, supported |
| D-8 | Versions 11.0 and 14.0 | Not supported → the warning text of § 5.5 |
| D-9 | A banner that is not a version line | Unknown → the same warning, never a throw |

**File names — `verilog/fileNames.ts` (step C6)**

| Id | Input | Expected |
|---|---|---|
| N-1 | `hdl_board_tb.v`, `_hdlboard_ts.v`, `sim.vvp` | Rejected (reserved) |
| N-2 | `../x.v`, `a/b.v`, `a\b.v`, `C:\x.v`, `/x.v` | Rejected (path) |
| N-3 | `-x.v` | Rejected (leading `-`) |
| N-4 | `led.v`, `Top_1.v`, `defs.vh` | Accepted |
| N-5 | Reserved-name check is case-insensitive | `HDL_BOARD_TB.V` rejected |

**Output limiter — `outputLimiter.ts` (step E7) and console cap — `consoleLines.ts` (step F7)**

| Id | Input | Expected |
|---|---|---|
| L-1 | 10 lines inside one window | All 10 forwarded |
| L-2 | 1 000 lines inside one window | 200 forwarded, then one summary line stating the count dropped |
| L-3 | A new window after a flood | The budget resets; nothing carried over |
| L-4 | No line dropped in a window | No summary line |
| C-1 | 5 000 lines appended to the console | The newest 2 000 remain, in order |
| C-2 | Fewer than the cap | Unchanged |

**Frontend — `fileKinds.ts` (step F1)**

| Id | Input | Expected |
|---|---|---|
| K-1 | `a.v`, `A.V`, `defs.vh` | folder `verilog` |
| K-2 | `a.vhd`, `a.vhdl` | folder `vhdl` |
| K-3 | `tb_a.vhd` | folder `work` |
| K-4 | `tb_a.v` | folder `verilog` (AS3) |
| K-5 | `a.txt`, `a` | not accepted |
| K-6 | Top file in `verilog` → sent folder | `verilog` |
| K-7 | Top file in `vhdl`, in `work`, or none → sent folder | `vhdl` |
| K-8 | Rename `x.vhd` → `x.v` (currently in `vhdl`) | moves to `verilog` |
| K-9 | Rename within the same language; rename to an unknown extension | stays put |
| K-10 | Guard: `tests/fixtures/vhdl` equals `STARTER_FILES` | equal |

### 7.5 Integration test catalog

Raw WebSocket client against the real backend and the real simulators. Each
skips itself if its simulator is absent. Ids `I-G*` run on GHDL (they are the
characterization suite, written **before** the refactor); `I-V*` run on Icarus.

| Id | Case | Expected |
|---|---|---|
| I-G1 | Clean VHDL board run (`DE1_SoC.vhdl`) | `READY`; `STIM` → `STATE` matches `scenarios.json` |
| I-G2 | VHDL syntax error | `ERROR analyze` with GHDL's text |
| I-G3 | Misspelled board port | `ERROR elaborate` |
| I-G4 | Multi-file project, cross-file entity reference, either order | `READY` |
| I-G5 | VHDL portless testbench | `LOG` lines, `DONE completed` |
| I-G6 | `RESET`, `STOP` | fresh run; `DONE stopped` |
| I-G7 | Disconnect mid-run | no orphan `ghdl` process |
| I-V1 | Clean Verilog board run (`DE1_SoC.v`) | `READY`; banner `LOG` first; `STATE` per scenario |
| I-V2 | Verilog syntax error | `ERROR analyze` with `file:line: error:` text |
| I-V3 | Unknown module | `ERROR elaborate` |
| I-V4 | Warning on a successful compile (port-width mismatch) | warning arrives as `LOG` **before** `READY` |
| I-V5 | Multi-file, module defined after the file that instantiates it | `READY` |
| I-V6 | Partial interface (`SW` + `LEDR` only) | `READY`; `STATE` correct; `HEX` blank |
| I-V7 | `$display` in a running design | `LOG` line arrives **within 200 ms** (guards `-i`, M4) |
| I-V8 | `$finish` in board mode | `DONE completed` (guards E5) |
| I-V9 | `$stop` in board mode | `DONE completed` |
| I-V10 | `$fatal` | `ERROR runtime` with `FATAL:` text |
| I-V11 | Portless testbench (`tb_counter8.v`) | `LOG` lines including `PASS`, then `DONE completed` |
| I-V12 | Runaway loop with no delay in batch mode | `ERROR runtime` after the timeout, or prompt `DONE stopped` on `STOP` |
| I-V13 | `RESET`, `STOP` | as GHDL |
| I-V14 | Disconnect mid-run | no orphan `vvp` / `iverilog` process |
| I-V15 | Student file named `hdl_board_tb.v` or `../x.v` | `ERROR analyze`, nothing written outside the session directory |
| I-V16 | Session directory containing a non-ASCII letter | `STATE` still flows (guards M11) |
| I-X1 | VHDL → Verilog → VHDL on one connection | each run uses the right engine |
| I-X2 | Mixed extensions in one `RUN` | `ERROR analyze` naming the mismatch |
| I-V17 | Nested include chain six deep | The macro from the deepest file takes effect; run succeeds |
| I-V18 | Missing include | `ERROR analyze` with `Include file … not found`, within 1 s |
| I-V19 | Circular include | `ERROR analyze` within 1 s — no hang |
| I-V20 | 101-file project (a chain of 100 modules) | `READY` within 1 s of `RUN` |
| I-V21 | **Flood:** `$display` on every clock edge for 5 s | At most `LOG_LINES_PER_SECOND` lines plus one summary per second reach the client; backend memory stays flat; `STOP` still returns promptly |
| I-V22 | A testbench top with ports but no board port (`output reg done`) | Runs standalone; the hint line comes first; `DONE completed` |
| I-V23 | A board design with a misspelled port (`LEDS`) | Runs standalone; the hint line names the board ports |

### 7.6 Parity tests

The same scenario run against the `vhdl/` and `verilog/` twin of each fixture
must give the same board. Rule: **`LEDR` compared bit for bit; `HEX` compared
after the frontend's own coercion** (`X` → "off", `ghdlClient.ts`'s
`parseState`). This matters: `blinkTest.vhdl` leaves `HEX0_N`…`HEX5_N`
undriven, so GHDL reports `X`, while the Verilog twin blanks them explicitly;
both render blank. Ids `I-P1…P3` (one per twin). A parity failure means either
the conversion or an engine differs — both are worth knowing.

### 7.7 End-to-end tests (browser, driven through the Chrome extension)

The browser path is tested by **Claude driving a real Chrome window through the
Claude-in-Chrome extension**, following a checked-in runbook
(`tests/e2e/verilog-browser.md`, step F6). This replaces the Playwright script
of earlier revisions; it adds no dependency and no `npm` script. (The
`playwright` dev dependency and `tools/screenshot.mjs` already in the repository
are untouched — removing them is a separate decision.)

**Feasibility — verified 2026-09-26** against today's app (Vite dev server,
real Chrome, extension connected):

- **Dropping files works.** A synthetic `dragenter` / `dragover` / `drop` on
  `.wb-files`, carrying a `DataTransfer` with `File` objects built in the page,
  ran the app's real upload handler: `probe.vhd` → `vhdl/`, `tb_probe.vhd` →
  `work/`, `notes.txt` rejected with the console line `Skipped notes.txt: not a
  .vhd/.vhdl file.`
- **The native `file_upload` tool works** on the hidden `<input type=file>`
  (found with `find`) for a file in the repository and one in the scratchpad,
  and reaches the same handler — `Skipped DE1_SoC.v: not a .vhd/.vhdl file.`
  today, which is exactly what E-1 flips once `verilog/` exists.
- **State is readable from the DOM**: the file tree, console lines, top-file
  label and the roles/labels of switches and LEDs.

**Prerequisites** for a run: the frontend (`npx vite --port 5173 --strictPort`)
and the backend (`cd server && npm run dev`, with `ghdl` on `PATH` and
`IVERILOG_DIR=winInstaller\vendor\iverilog` on Windows) both running.

**How the runbook uses the extension**

| Tool | Used for |
|---|---|
| `tabs_context_mcp`, `tabs_create_mcp`, `tabs_close_mcp` | Its own tab, created at the start and closed at the end |
| `navigate` | `http://localhost:5173/` (or the address of a served build) |
| `find` / `read_page` | Locate elements and confirm the selectors below at the start of every run |
| `javascript_tool` | Assertions (DOM reads), the drop helper, the in-page timing sampler |
| `file_upload` | The hidden `<input type=file>` — **never click it** (a native picker the extension cannot see) |
| `computer` | Real clicks where a click is the point: Start/Stop, the top-file dot, a switch (E-3) |
| `read_console_messages` | Browser-console errors (`pattern: error`) |
| `gif_creator` | A recording of E-3, E-4 and E-6, named for what it shows |

**DOM hooks** (role- and class-based; re-confirm with `read_page` each run):

| What | Selector |
|---|---|
| Folders and files | `.wb-files__folder` → label `.wb-files__folder-label`, rows `.wb-files__file .wb-files__label-text`. The label is upper-cased by CSS: assert on `textContent`, compared case-insensitively |
| Top-file dot | `.wb-files__top-dot` (`aria-pressed`; `aria-label` says which file) |
| Top file shown | `.wb-simcard__top` |
| Start / Stop, status | `.wb-simcard__button.is-start` / `.is-stop`; `.wb-simcard__status.is-running` |
| Console | `.wb-console__body[role=log] .wb-console__line` |
| Switches | `.pb-switches button[role=switch]` with `aria-checked` |
| LEDs | `.pb-leds [role=img]` whose `aria-label` ends in `on` / `off` |

**The drop helper** (the snippet that was verified; it is what E-1, E-2 and E-8
use, with fixture text passed in):

```js
const panel = document.querySelector('.wb-files');
const dt = new DataTransfer();
dt.items.add(new File([fixtureText], 'DE1_SoC.v', { type: 'text/plain' }));
for (const type of ['dragenter', 'dragover', 'drop']) {
  panel.dispatchEvent(new DragEvent(type, { dataTransfer: dt, bubbles: true, cancelable: true }));
}
await new Promise(r => setTimeout(r, 400));   // the app reads files asynchronously
```

**Rules that keep the extension working**

- **Native dialogs block it.** Deleting a file calls `window.confirm` (in
  `FileExplorer.tsx`). Before E-7, run `window.confirm = () => true` in the
  page, so no dialog ever opens.
- **Timing is asserted inside the page.** Each tool call adds a noticeable
  delay, so anything time-sensitive (a 250 ms blink, LEDs following a switch)
  is measured by a `setInterval` sampler in the page whose collected array is
  returned in one call — never by timing across calls.
- **Time-critical, flood and process checks stay in the integration suite**
  (I-V7, I-V21, …); the browser runbook proves the wiring, not the speed.

**Cases**

| Id | Case | Expected | Method |
|---|---|---|---|
| E-1 | Drop `DE1_SoC.v` on the Files panel | Appears under `verilog/`, not `vhdl/` | drop helper, or `file_upload` |
| E-2 | Drop `.vhd`, `tb_x.vhd`, `.v`, `.txt` | `vhdl/`, `work/`, `verilog/`, rejected with a console line | drop helper |
| E-3 | Mark the `.v` as top; Start; click a real switch | The `Leds` DOM follows | `computer` clicks; DOM read |
| E-4 | **Decisive:** a design with `assign LEDR = ~SW;` | LEDs are the *inverse* of the switches — possible only if the simulator drives the board | `computer` + DOM read |
| E-5 | Console after Start | Contains the `Icarus Verilog version …` line and the design's `$display` | DOM read |
| E-6 | Mark a VHDL file top; Start | GHDL banner; LEDs follow; switching back to Verilog works | `computer` + DOM read |
| E-7 | Delete the Verilog top (with `confirm` stubbed) | Top falls to another `verilog/` file; the VHDL dot is not lit | `javascript_tool` + `computer` |
| E-8 | Rename `x.v` to `x.vhd` | File moves to `vhdl/` | double-click rename + DOM read |

**What this trades away, honestly.** It is not repeatable by a machine on
every commit: a run needs Chrome, the extension and a Claude session, and its
result is a recorded pass/fail table plus GIF evidence rather than an exit
code. In exchange there is no browser download, no test dependency, and the
run exercises a real Chrome with real drag events. The unit, integration and
installer tiers are what CI-style regression rests on; the runbook is the
acceptance run at F6 and again at I4.

### 7.8 Verifying an installation

The converted fixtures are also the acceptance test for an *installed* build.
Three tiers, cheapest first:

**Tier 1 — build-time smoke test (B3), every build.** `build.ps1` compiles and
runs `DE1_SoC.v` and `tb_counter8.v` from the freshly assembled
`resources/iverilog` with `PATH` reduced to `System32`, from a directory whose
name contains a space and `ø`, and fails the build otherwise. It checks the
*result* (`PASS`, expected state), not message text (the OS text is localised —
Appendix B). This catches M2, the `.vpi` trap and the DLL trap before
anything is packaged; on the build machine `PATH` usually contains an MSYS2 or
GHDL directory that masks all three (the spike's first "success" was exactly
that).

**Tier 2 — `tools/verify-backend.mjs <ws-url>`, any backend.** Runs the whole
scenario file (both languages) over the WebSocket and prints a pass/fail table
with exit code. It works against a dev backend, a Linux server, and **the
installed app** (`ws://127.0.0.1:9010/ghdlsim` while HDLBoard is running). It
needs Node, so it is for developers and CI, not a student VM.

**Tier 3 — clean-VM acceptance, by hand** (the project's existing open
installer gates are the same machines; combine them). Install, then:

| Id | Action | Expected |
|---|---|---|
| V-1 | Launch HDLBoard | Starter project shows `vhdl/` and `verilog/` |
| V-2 | Drag a `.v` file (e.g. a renamed copy of `DE1_SoC.v`) onto the Files panel | Appears under `verilog/` |
| V-3 | Click its dot to make it top; Start | Console: `Icarus Verilog version 13.0 …`, then `Simulation running ...` |
| V-4 | Flip switches | LEDs follow the switches; displays stay blank |
| V-5 | Drop `keyCouter2Led.v`, make it top, Start; press KEY0 three times | `LEDR[7:0]` = 3; press KEY1 → 0 |
| V-6 | Drop `blinkTest.v`, make it top, Start | All ten LEDs toggle about every 250 ms |
| V-7 | Drop `tb_counter8.v`, make it top, Start | Console shows the count lines and `PASS`, then `Simulation complete.` |
| V-8 | Make `DE1_SoC.vhdl` top again; Start | GHDL banner; LEDs follow |
| V-9 | Repeat V-3 on a Windows account whose name contains a non-ASCII letter | Identical (M11) |
| V-10 | Uninstall | `resources\iverilog` and the session directories are gone; the licence page showed the Icarus section |

**Optional stretch (G5):** an in-app `HDLBoard.exe --self-test` that runs the
scenario file headlessly against the *installed* binaries and exits 0/1 — the
only tier that verifies a student's machine without Node or a human. Costs a
small exported function and a flag in `main.js`; § 9 #10.

### 7.9 Quality verification after implementation

The request: test the modules once implemented for quality and readability.
This is phase I, and it is a different activity from functional tests:

1. **Coverage report** for the pure modules
   (`node --test --experimental-test-coverage`; `fileKinds`/`consoleLines` under
   vitest). Read the uncovered lines: each is tested or deleted. A report to
   learn from, **not a gate** — chasing a percentage is how a test suite comes
   to cost more than the code it protects.
2. **Break-it checks, limited to the logic that decides things** —
   `ports.ts`, `outputLimiter.ts`, `testbench.ts`. Three deliberate faults in
   each (flip a comparison, drop a `.toLowerCase()`, delete a branch); **at
   least one test must fail each time**. A fault no test notices is a missing
   test. Revert every fault.
3. **Cold read.** Read each new file top to bottom without running it. For every
   function write one sentence of what it does; if the sentence has "and", or
   a name needs explaining, or the reader has to scroll to keep context,
   refactor. Record the result in the I1 commit message.
4. **Tests as specification.** Run with `--test-reporter=spec` and read the
   output aloud as sentences; a test whose name does not say what behaviour it
   guarantees is renamed.
5. **Metrics / lint.** The scoped ESLint rules (§ 6.3) report zero violations on
   the new files, with no unexplained disables.
6. **Import graph.** Confirm rule 7: pure modules import no `node:*`; engines
   do not import `Session`; nothing outside `selectEngine` names a language.
7. **Two review passes** on the branch diff: `/simplify` (reuse, simplification,
   efficiency) and `/code-review high` (correctness). Every finding is fixed
   or answered in writing.
8. **Regression.** The whole suite — unit, integration (both simulators),
   parity, e2e — run once from a clean checkout, then Tier 1–3 of § 7.8.

### 7.10 What to cut if time is short

Tests ranked by what they protect. **Cut from the bottom; nothing above the
line is ever cut.** The review that prompted this ranking was right that a test
suite can grow past the code it guards.

| Priority | Tests | Protects |
|---|---|---|
| **Must** | Integration cases I-V\* (simulator interaction, multi-file, includes, flood); characterization I-G\*; fixture scenarios; installer Tier 1 smoke test; file-name validation; top choice and stub parsing; output limiter | What a student actually does, and the refactor's safety |
| **Should** | Parity I-P\*; e2e E-1…E-4; Tier 2 verify script; the Linux gate (H2) | Cross-language behaviour; the browser path; the server deployment |
| **Optional** | Coverage report; break-it checks; scoped ESLint (A3); installed self-test (G5); e2e E-5…E-8 | Polish |

---

## 8. Implementation steps

Forty-eight steps in **nine phases, A to I, listed in build order**: each phase
leaves the project in a working, testable state, and no phase needs anything a
later one builds. **Every step also obeys § 6.5.** Size: **S** ≈ under an hour,
**M** ≈ a few hours. "Files" are relative to the repository root.

### Build order

**Step 0 — decide (no code).** Answer the four assumptions (§ 0) and three
open decisions that add or drop steps: § 9 #12 (ESLint → A3), § 9 #11 (`vitest`
→ A7) and § 9 #10 (installed self-test → G5). Settling them first keeps the
step list stable.

| # | Phase | Steps | When it is done you can… | Needs | Can overlap with |
|---|---|---|---|---|---|
| 1 | **A** Safety net | A1–A7 | Run any test; today's GHDL behaviour is pinned | — | — |
| 2 | **B** The simulator on hand | B1–B3 | Run Icarus from a clean `PATH` on this machine, so integration tests can run | A1 | C |
| 3 | **C** Pure Verilog logic | C1–C6 | Unit-test port reading, top choice and testbench generation | A4 (C2, C5: B2) | B (except C2, C5) |
| 4 | **D** Process layer | D1–D5 | Compile, read ports and run a design from Node | B, C | F1–F5, F7 |
| 5 | **E** Engine seam and Verilog engine | E1–E7 | Run Verilog end to end through a raw WebSocket client; GHDL unchanged; floods contained | D, A5–A6 | F1–F5, F7 |
| 6 | **F** Frontend | F1–F8 | Drop a `.v`, mark it top, Start in the browser | F1–F5, F7: A7 · F6: E | C–E |
| 7 | **G** Installer | G1–G5 | Install the app and run Verilog in it | B, E, F | H |
| 8 | **H** Linux and docs | H1–H3 | Run the server deployment on Linux; docs current | E (H3: G) | G |
| 9 | **I** Quality | I1–I4 | Sign off | all | — |

```
          ┌──► B  simulator on hand ──┐
   A ─────┤                           ├──► D ──► E ──► F6 (e2e) ──┐
          └──► C  pure logic ─────────┘                            ├──► G ──► I
   A7 ──────► F1–F5, F7  (pure frontend, any time after A7) ───────┘
                                     E ──► H (Linux, docs) ──────────────► I
```

**Critical path:** A → B (or C) → D → E → F6 → G → I. B and C are independent
of each other, and the pure-frontend steps are independent of everything from B
to E, so a second pair of hands (or a quiet hour) can be spent there.

**Why this order.**
1. *Tests before code (A).* The GHDL path is refactored in E; it must be pinned
   first, or "unchanged" is a hope.
2. *The simulator before its users (B).* Icarus was originally an installer
   concern. But this machine has none, and phases D and E cannot be tested
   without one, so the tree is built second.
3. *Pure before impure (C before D).* Everything that can be decided without a
   process is decided in a unit test first; the process layer then only spawns
   and pipes.
4. *Backend before frontend for the end-to-end path (E before F6)*, while the
   pure frontend steps run whenever convenient.
5. *Packaging last among features (G)*, because it needs a working backend and
   frontend to be worth verifying, and the risky part of it (B) was already
   done early.
6. *Quality verification last (I)*, over finished code.

**Commit points** (one commit per group; § 6.5): after **A3, A6, A7, B3, C3, C6,
D1, D5, E2, E3, E4, E5, E6, E7, F3, F6, F8, G3, G5, H3, I4** — twenty-one
commits for forty-eight steps. D1, E2, E3, E5 and E7 change existing behaviour
or move existing code, so each stands alone.

### Phase A — Safety net (no behaviour change)

> **Goal.** Pin today's behaviour and set up testing before any feature code exists.  
> **Needs.** nothing.  
> **Working state after.** Fixtures and scenarios exist; both test runners work; the GHDL characterization tests pass on the unchanged backend.  
> **Gate.** A5–A6 green on the current `main`.

**A1 — Convert the starters; create the fixtures.** *S*
Files: `tests/fixtures/verilog/{DE1_SoC,blinkTest,keyCouter2Led,tb_counter8}.v`
(from Appendix C), `tests/fixtures/vhdl/{DE1_SoC,blinkTest,keyCouter2Led}.vhdl`
(the three template strings of `files.ts`, verbatim).
Done when: the files match Appendix C byte for byte. (Icarus is not on this
machine yet, so the compile-clean and `PASS` check is done by B3, which lists
it.)
Also check in the verified wrapper of Appendix A as
`tests/fixtures/verilog/golden/hdl_board_tb.DE1_SoC.v` — the golden file for
C5's generator test **and** for the smoke test B3, which both run before or
without the generator.

**A2 — Scenario file.** *S*
Files: `tests/fixtures/scenarios.json` (schema and entries from § 7.3 and
Appendix C).
Done when: every fixture file it references exists. (The 15-line schema check
that validates it arrives as a test with A4's helpers.)

**A3 — Quality tooling (recommended).** *S*
Files: `server/eslint.config.js` (new files only — the config lists the
`verilog/`, `engines/` and `runtime.ts` globs), `server/package.json`
(`"lint"`).
Done when: `npm run lint` passes on an empty set of new files and *fails* on a
scratch file with a 50-line function (then delete it).

**A4 — Server test runner and helpers.** *M*
Files: `server/package.json` (`test`, `test:integration`),
`server/src/testSupport/{WsTestClient,requireTool,fixture,sessionDir}.ts`.
Test first: a trivial `WsTestClient` test against the real backend
(`HELLO` → `WELCOME`).
Done when: `npm test` and `npm run test:integration` run, and skip cleanly when
`ghdl`/`iverilog` are absent. `requireTool` finds Icarus through
`IVERILOG_DIR`, then `IVERILOG_EXE`, then `PATH`.

**A5 — Characterization tests for the VHDL path: protocol cases.** *M*
Files: `server/src/integration/ghdl.characterization.test.ts`.
Cases: I-G1, I-G2, I-G3, I-G4. **Run against the unchanged backend** — they
must pass today; they *are* the specification of today's behaviour.
Done when: green on the current `main`, and each was seen failing when the
backend is deliberately broken (e.g. wrong stage string).

**A6 — Characterization tests: batch, control, teardown.** *M*
Files: same file (or `…control.test.ts`). Cases: I-G5, I-G6, I-G7.
Done when: green on the current `main`.

**A7 — Frontend test runner.** *S*
Files: `package.json` (`vitest` dev dependency, `"test": "vitest run"`),
`src/components/workbench/files.fixtures.test.ts` (case K-10, the
fixtures-equal-starters guard).
Done when: `npm test` passes; changing one character of a fixture fails it.

### Phase B — The simulator on hand

> **Goal.** Get Icarus onto this machine, reproducibly and from a clean `PATH`. This machine has no `iverilog` (checked), and every integration test from phase D on needs one — so this comes *before* the code that uses it, not with the installer.  
> **Needs.** A1 (the fixtures and the golden wrapper). Can overlap with C.  
> **Working state after.** `winInstaller/vendor/iverilog` exists and the smoke test passes. **From here on, run integration tests on this machine with `IVERILOG_DIR=winInstaller\vendor\iverilog`.**  
> **Gate.** B3 passes on the tree and fails on each deliberate break.

**B1 — `fetch-iverilog.ps1`: download and verify.** *M*
Files: `winInstaller/fetch-iverilog.ps1`.
Model on `fetch-ghdl.ps1`: idempotent by a stamp, `-Force`, per-package
SHA-256 (§ 5.8), refuse on mismatch, download cache.
Done when: a corrupted byte in one download is refused with the expected/actual
hash, and a second run is a no-op.

**B2 — Assemble the tree.** *M*
Files: same.
Unpack with `$env:SystemRoot\System32\tar.exe -xf` (M14); build the § 5.8 layout
as **one flat directory** — every `.exe`, each DLL **once**, the `.vpi`/`.tgt`/
`.conf` files, no `bin/` or `lib/ivl/` split; **deny-list** (drop `vhdlpp.exe`,
`include/`, `libvpi.a`, `iverilog-vpi.exe`, and the
`blif`/`pcb`/`sizer`/`vlog95`/`vhdl` targets), never an allow-list; copy the
per-package licence folders and `COPYING`; write `VERSION.txt` with versions,
URLs, hashes and the source-package URLs of § 3.3.
Done when: `vendor/iverilog` is ≈ 8 MB, has exactly one copy of each DLL, and
`iverilog -B<dir> -V` runs.

**B3 — Smoke test script.** *M*
Files: `winInstaller/verify-iverilog.ps1` (a script, so build and humans both
run it).
Compile and run `DE1_SoC.v` (with the checked-in golden wrapper from A1) and
`tb_counter8.v` **exactly as the backend will** — `-B<dir>` / `-M<dir>` as
backslash paths — with `PATH = System32`, from a directory whose name contains
`ø` and a space; assert on results, not text.
Also compile all four `tests/fixtures/verilog/*.v` with `-Wall -Wno-timescale`
(zero output expected) and check that `tb_counter8` prints `PASS` — the check
A1 could not do without a simulator.
Done when: it passes on the assembled tree, **fails** when one DLL is removed,
fails when one `.vpi` is removed, fails when `-B` is given a forward-slash path,
and passes again.

### Phase C — Pure Verilog logic (test-first, no processes)

> **Goal.** Every Verilog-specific decision as a small, pure, unit-tested function: module names, stub-port parsing, board detection, top choice, testbench text, diagnostics, version check, file-name validation.  
> **Needs.** A4 (the server test runner). C1, C3, C4 and C6 can overlap with B; **C2 (captured stub samples) and C5 (the compile check) need B2.**  
> **Working state after.** Unit tests green. Nothing is wired into the backend yet.  
> **Gate.** The generated wrapper equals the golden file and compiles for every fixture port set.

Each step: write the catalog cases, watch them fail, implement, watch them
pass. These modules import nothing from `node:*` (rule 4).

**C1 — Module names.** *S*
Files: `server/src/verilog/ports.ts`, `ports.test.ts`.
Cases: P-1, P-2, P-3.
Function: `moduleNames(source)` — strips comments and string literals, then
matches `module`/`macromodule` names. **This is the only place HDLBoard reads
Verilog text**, and it is deliberately tiny (§ 5.4).

**C2 — Stub port parsing.** *S*
Files: same, plus `tests/fixtures/stub/{simple13,tricky12,tricky13}.stub` — real
captured `iverilog -tstub` output (Appendix B), not hand-written: the 13.0
samples with the tool from B2, the 12.0 sample once from the MSYS2
`1~12.0-1` package (as the spike did).
Cases: P-4…P-8.
Function: `parseStubPorts(stubText, top)` → `Port[]` or a failure value: reads
only the requested top's own scope lines (direction, width, name) and ignores
child scopes.

**C3 — Board detection and top choice.** *S*
Files: same.
Cases: P-9…P-13.
Functions: `isBoardDesign(ports)`, `chooseTopModule(topFileName, names)`. The
board's port-name list is shared with the VHDL scanner only if importing it does
not pull VHDL code into a Verilog module (rule 6 vs rule 7).

**C4 — Testbench: connections and tie-offs.** *S*
Files: `server/src/verilog/testbench.ts`, `testbench.test.ts`.
Cases: T-2, T-6, T-7, T-8.
Functions: `portConnections`, `tieOffAssignments` (small, string-returning).

**C5 — Testbench: the whole wrapper.** *M*
Files: same; the golden wrapper is the one checked in by A1.
Cases: T-1, T-3, T-4, T-5, T-9, T-10. The big Verilog template is one
constant per *section* (declarations, clocks, parameters, pacing, board I/O)
so no function exceeds the cap; the template text is data.
Done when: the golden file test passes, and the wrapper compiles in
`iverilog` for every port subset used by the fixtures.

**C6 — Diagnostics, version check and file-name validation.** *S*
Files: `server/src/verilog/{diagnostics,fileNames}.ts` and tests.
Cases: D-1…D-9, N-1…N-5.
Functions: `classifyCompileFailure`, `extractBanner`, `parseVersion`,
`isSupportedVersion` (`SUPPORTED_MAJOR_VERSIONS` = 12, 13), `validateSourceName`,
`RESERVED_FILE_NAMES`.

### Phase D — Process layer

> **Goal.** Drive the simulator from Node: read a top's ports, compile, run persistent and batch, resolve tool paths.  
> **Needs.** B (a simulator to run), C (the pure logic), A4.  
> **Working state after.** `readTopPorts`, `compileVerilog` and both run functions work against the real tool. Nothing else calls them yet.  
> **Gate.** Process-level integration tests green with `IVERILOG_DIR` set.

**D1 — Extract the shared runtime.** *M*
Files: `server/src/runtime.ts` (new), `server/src/ghdl.ts` (re-exports),
`server/src/session.ts` (imports unchanged if re-exported).
Move `CmdResult`, `runCmd`, `RunHandle`, `BatchHandle`, `lineSplitter`
verbatim; add no behaviour.
Done when: A5–A6 still pass and the diff is a pure move.

**D2 — Ports and compile.** *M*
Files: `server/src/verilog/process.ts`, `process.test.ts` (integration; skips
without `iverilog`).
Functions: `readTopPorts(...)` (§ 5.4 step 1, `-tstub`), `compileVerilog(...)`
(step 2), `readBanner()` (`iverilog -V`), and one `toolFlags()` helper that
returns `-B<dir>` / `-M<dir>` only for a bundled build (Windows path,
backslashes — M21). They take their executables and flags from
`server/src/verilog/toolPaths.ts` (pure, added here): `resolveToolPaths(env,
options)` — a bundled `IVERILOG_DIR` wins, else `IVERILOG_EXE`/`VVP_EXE`, else
`PATH`; unit-tested (cases in § 7.4 style: one behaviour per test).
Cases: I-V2, I-V3, I-V4 at the process level; warnings on success come back as
`messages`, not lost; the flat-layout case is exercised by B3.

**D3 — Persistent run.** *M*
Files: same.
Function: `startVerilogBoardRun(...)` → `RunHandle`: `vvp [-M<dir>] -n -i`, relative
plusargs, stdin grants, `EPIPE` guard, listeners removed on `kill` (mirror
`startPersistentRun`, sharing helpers from `runtime.ts` — no copy).
Test: run `DE1_SoC.v` through a small harness; assert a `STATE` file appears
and `$display` arrives within 200 ms (I-V7).

**D4 — Batch run.** *S*
Files: same.
Function: `runVerilogBatch(...)` → `BatchHandle`, with the batch timeout.
Test: `tb_counter8.v` → lines including `PASS`, exit 0; a no-delay loop is
killed at the timeout (short timeout injected).

**D5 — Backend options.** *S*
Files: `server/src/server.ts` (`BackendOptions.iverilogDir` — a bundled flat
tool directory, which switches on `-B`/`-M` and derives both executables;
`iverilogExe`/`vvpExe` for `PATH` installs), passed to `resolveToolPaths` (D2)
next to the existing `setGhdlExe` call.
Done when: the startup log prints the resolved paths, and the packaged-app
options of G2 have somewhere to land.

### Phase E — The engine seam and the Verilog engine

> **Goal.** The first end-to-end backend: `Session` runs either language through one `SimEngine` seam, with output floods contained.  
> **Needs.** D. The characterization tests A5–A6 protect the refactor (E2–E3).  
> **Working state after.** A raw WebSocket client runs Verilog end to end; GHDL behaves exactly as before.  
> **Gate.** All I-G\* and I-V\* cases green.

**E1 — Engine types.** *S*
Files: `server/src/engines/types.ts` (§ 5.7 exactly), `selectEngine.ts` +
test (top `.v` → verilog; `.vhd`/`.vhdl` → vhdl; none → vhdl; mixed-extension
detection helper).
Done when: pure, tested, imported by nothing yet.

**E2 — `GhdlEngine`: move, do not rewrite.** *M*
Files: `server/src/engines/ghdlEngine.ts` (new), `session.ts` (loses the
moved code).
Move the analysis loop, top detection, testbench generation, elaboration and
run spawning behind `SimEngine`, keeping every line's logic. Messages
(`'GHDL 5.0.1 (mcode)'`) go to `plan.messages`.
Done when: **A5–A6 pass unchanged**; the diff reads as a move plus thin
adaptation. If a characterization test needs editing, stop — the refactor
changed behaviour.

**E3 — `Session` uses the seam.** *M*
Files: `server/src/session.ts`.
`handleRun` becomes: select engine → `prepare` → forward `messages` →
start board or batch → same handlers as today. `startRun`/`startBatchRun`
take the engine's run functions; pacing comes from `plan.pacing`.
Done when: A5–A6 green; `session.ts` no longer mentions GHDL by name; rule 5's
grep is clean.

**E4 — `VerilogEngine`.** *M*
Files: `server/src/engines/verilogEngine.ts`.
`prepare`, each stage its own small function: validate names (C6) → write the
files and `_hdlboard_ts.v` → `moduleNames` of the top file → `chooseTopModule`
(C3) → `readTopPorts` (D2, step 1) → `isBoardDesign`? board: generate the wrapper
(C5); otherwise plan a standalone batch run with the hint message → compile
(D2, step 2) → `readBanner` + `isSupportedVersion` → return the plan with the
banner, the version warning if any, and the compile warnings in `messages`. The
plan carries the engine's `timing`. Board/batch run functions delegate to
D3/D4.
Done when: I-V1, I-V2, I-V3, I-V4, I-V5, I-V6, I-V11, I-V15, I-V22, I-V23 pass.

**E5 — Two shared behaviour fixes.** *S*
Files: `session.ts`.
(a) A run that was `running` and exits 0 sends `DONE completed` (§ 5.5).
(b) `pollOutput` normalises `[xXzZ]` → `X` before its 52-bit check.
Test first: I-V8, I-V9 (fail before, pass after); I-G1 unchanged.
Done when: the GHDL corner case `std.env.finish` also reports `DONE completed`
(note it in the commit message).

**E6 — Remaining Verilog integration cases.** *M*
Files: `server/src/integration/verilog.test.ts`.
Cases: I-V7, I-V10, I-V12, I-V13, I-V14, I-V16, I-V17, I-V18, I-V19, I-V20,
I-X1, I-X2, and parity I-P1–P3 (§ 7.6).
Done when: `npm run test:integration` is green on this machine with both
simulators present, and each I-V case was seen failing under a deliberate fault
(e.g. drop `-i`).

**E7 — Output flood protection.** *M*
Files: `server/src/outputLimiter.ts` (pure, clock injected) and its test,
`server/src/session.ts` (both `LOG` send sites — lines 366 and 510 today — go
through one `forwardOutputLine`).
Cases: L-1…L-4, then integration I-V21 (and, once, the GHDL equivalent: a
`report` in a clocked process).
Done when: the flood case delivers at most `LOG_LINES_PER_SECOND` lines plus one
summary per window, `STOP` returns promptly, and I-G1…I-G7 still pass. Note in
the commit message that this changes GHDL behaviour only under flood.

### Phase F — Frontend

> **Goal.** Drop a `.v`, mark it top, press Start in the browser.  
> **Needs.** F1–F5 and F7 need only A7 — pure frontend work that may start any time after A7, in parallel with C–E. F6 (end to end) needs E. F8 needs F1–F7.  
> **Working state after.** The browser drives Verilog runs; the starter project looks exactly as before.  
> **Gate.** e2e E-1…E-4 pass, and E-4 (`~SW`) fails when the backend is stopped.

**F1 — `fileKinds.ts`.** *S*
Files: `src/components/workbench/fileKinds.ts`, `fileKinds.test.ts`.
Cases K-1…K-9. Functions: `folderForUpload`, `sourceFolderFor`,
`folderAfterRename`. Pure; no React.

**F2 — Folder type and the file tree.** *S*
Files: `files.ts:14` (`'vhdl' | 'verilog' | 'work'`), `FileExplorer.tsx:25`
(`FOLDER_ORDER`) and the three `folder === 'vhdl'` conditions (`:163`, `:184`,
`:205`) via one `hasTopDot(folder)` helper; update the comments at `:20`, `:28`.
Done when: `typecheck` clean; the starter project looks exactly as before (no
empty `verilog/`); a manual check with a `verilog` file shows the folder and
the top dot.

**F3 — Upload and drop routing.** *S*
Files: `Workbench.tsx:439-452` (use `folderForUpload`), `:540`
(`accept=".vhd,.vhdl,.v,.vh"`), `FileExplorer.tsx:120`, `:130` (strings →
`Drop .vhd / .vhdl / .v files`, `Upload File`), and `ConsoleOutput.tsx:30,32`
(`aria-label` and title → `Simulator output` / `Simulator Output / Status`:
the panel would otherwise say "GHDL" above Icarus's output).
Done when: dropping `.v`, `.vhd`, `tb_x.vhd`, `.txt` lands in `verilog/`,
`vhdl/`, `work/`, and a rejection line (E-2).

**F4 — What Start sends.** *S*
Files: `ghdlClient.ts:146-154` (use `sourceFolderFor(top)`), no change to
`Workbench.tsx:488`.
Done when: with a `.v` top only `verilog/` files are in the `RUN` frame
(assert on a fake socket); with none or a VHDL top, unchanged.

**F5 — Delete and rename consistency.** *S*
Files: `Workbench.tsx:413-415` (top falls back within the deleted file's
folder), `:400` (`handleRenameFile` uses `folderAfterRename`).
Done when: E-7 and E-8 behave; K-8/K-9 pass.

**F6 — Browser end-to-end runbook.** *M*
Files: `tests/e2e/verilog-browser.md` — the runbook: prerequisites, the helper
snippets and DOM hooks of § 7.7, and cases E-1…E-8 with their exact
assertions. No script, no dependency, no `npm` command.
Run it: start the frontend and backend (§ 7.7), then have Claude execute the
runbook through the Chrome extension; record pass/fail per case in the runbook's
results table and keep the GIFs of E-3, E-4 and E-6 beside it.
Done when: E-1…E-8 pass; **E-4 (`~SW`) was seen to pass only with Icarus
running** (stop the backend → it fails).

**F7 — Console line cap.** *S*
Files: `src/components/workbench/consoleLines.ts` (pure `appendCapped`) and its
test, `Workbench.tsx` (`appendLog` uses it instead of `[...prev, line]`).
Cases: C-1, C-2.
Done when: 5 000 appended lines leave the newest 2 000; no visible UI change.

**F8 — Frontend quality pass.** *S*
Files: none new; § 6.4 applied to phase F's diff; run `npm run typecheck`,
`npm test`.
Done when: nothing in `Workbench.tsx` beyond the call to `fileKinds` knows the
extension rules; the component grew by fewer lines than it shed.

### Phase G — Installer integration and verification

> **Goal.** The installed app runs Verilog, and an installation can be verified.  
> **Needs.** B (the tree), E (the backend), F (the frontend).  
> **Working state after.** An installer that bundles Icarus, verified on this machine.  
> **Gate.** G4: Tier 2 all green and V-1…V-8, V-10 ticked. (G5 is optional.)

**G1 — Build wiring.** *S*
Files: `winInstaller/build.ps1` (fetch if missing; copy to
`resources/iverilog`; run `verify-iverilog.ps1` and fail the build on error),
`winInstaller/electron/electron-builder.yml` (`extraResources`).
Done when: `build.ps1` produces an installer and aborts if the smoke test
fails.

**G2 — Runtime paths.** *S*
Files: `winInstaller/electron/main.js` (`resolvePaths`: packaged →
`resources/iverilog/bin/{iverilog,vvp}.exe`; dev → `IVERILOG_EXE`/`VVP_EXE` or
`PATH`; pass to `startBackend`).
Done when: the packaged app's startup log prints both paths.

**G3 — Licence, README, ignore rules.** *S*
Files: `winInstaller/electron/build/license.txt` (§ 3.3), `winInstaller/README.md`,
`.gitignore` (`vendor/iverilog/`, the download cache).
Done when: the installer's licence page shows the Icarus section with the
source URLs.

**G4 — Build and verify the installer.** *M*
Run `build.ps1`; install; on this machine run `tools/verify-backend.mjs
ws://127.0.0.1:9010/ghdlsim` against the installed app (Tier 2); then the
Tier 3 checklist V-1…V-8, V-10.
Done when: Tier 2 is all green and V-1…V-8, V-10 are ticked. (V-9, the
non-ASCII account, and the clean-VM run are the project's existing open
installer gates — do them together.)

**G5 — Installed self-test (optional stretch).** *M*
Files: `server/src/selfTest.ts` (runs `scenarios.json` through `Session` with a
fake `send`, prints a table), `winInstaller/electron/main.js`
(`--self-test` → run headless, exit 0/1), fixtures packaged under
`resources/selftest/`.
Done when: `HDLBoard.exe --self-test` exits 0 on a clean VM with no Node
installed. Skip if § 9 #10 is answered "no".

### Phase H — Linux and documentation

> **Goal.** Server deployments work and the documentation is current.  
> **Needs.** E. Can overlap with G; H3 (docs) waits for G.  
> **Working state after.** `scripts/start.sh` and `alpineInstall.sh` install Icarus; docs describe both languages.  
> **Gate.** The Linux gate is green on Icarus 12.0 and 13.0; no document says "VHDL only".

**H1 — Linux install scripts.** *S*
Files: `scripts/start.sh` (an `iverilog` block using the same package-manager
ladder as GHDL's, lines 71–95), `scripts/alpineInstall.sh` (`apk add
iverilog`), `docs/BUILDING.md`, `docs/HOSTING.md`.
Done when: `HDLBOARD_SKIP_INSTALL=1 ./scripts/start.sh` reports a missing
`iverilog` with a pointer, like GHDL.

**H2 — Linux gate.** *S*
Run the integration suite (including I-V7, I-V12 and the pacing scenario) on a
real Linux with the distribution's `iverilog` — Debian stable (12.0) **and**
one 13.0 system (Alpine edge or Debian testing).
Done when: green on both; `blinkTest.v` toggles at ≈ 250 ms (M5's check).

**H3 — Docs and changelog.** *S*
Files: `docs/changelog.txt` (one dated line), `README.md` (features),
`docs/ghdl_implementation_plan.md` (a one-line cross-reference), this plan's
status line (**built and verified**), and § 4 gains the measured results of the
implementation.
Done when: no document says "VHDL only".

### Phase I — Quality verification (§ 7.9)

> **Goal.** Verify the code quality and sign off.  
> **Needs.** everything above.  
> **Working state after.** The sign-off table is complete.  
> **Gate.** Every row of the sign-off table filled in.

**I1 — Read, measure, report.** *M*
Run the coverage **report** on the pure modules and act on what it shows, the
scoped lint (zero violations, no unexplained disables — if A3 was adopted), the
import-graph check (rule 7 and rule 5's grep), then the cold read of every new
file. Fix what they find; note the result in the commit message.

**I2 — Break-it checks (limited).** *S*
Three deliberate faults each in `ports.ts`, `outputLimiter.ts` and
`testbench.ts` (§ 7.9 #2); every fault must fail a test; add the missing tests;
revert the faults.

**I3 — Review passes.** *S*
Run `/simplify`, then `/code-review high`, on the whole branch diff. Fix or
answer each finding in writing.

**I4 — Full regression and sign-off.** *S*
From a clean checkout: unit, integration (both simulators), parity, e2e; then
§ 7.8 Tier 1–3. Fill the sign-off table in this document:

| Gate | Result | Date |
|---|---|---|
| Unit + integration + parity | **Pass.** 207 server unit, 92 integration (both simulators, incl. I-V\*, I-X\*, I-P1–P3, I-V21), 32 frontend (vitest) | 2026-09-26 |
| Coverage report reviewed | **Not done.** Node 20's built-in reporter throws, and `c8` needs a newer Node; rerun on Node 22 | open |
| Lint (zero violations) | **Pass.** Scoped ESLint on the new files, no disables | 2026-09-26 |
| Break-it checks (three modules) | **Pass.** Nine faults (three each in `ports.ts`, `outputLimiter.ts`, `testbench.ts`): every one failed at least one test | 2026-09-26 |
| `/simplify` and `/code-review` findings closed | **Closed.** Fixed: shared run handles, dead code, one timing policy/timeout/timescale constant, banner read once, board ports moved to `engines/`, `topAfterDelete`, About credit, a missing-`vvp` crash. Skipped with reasons: frontend LOG coalescing, stderr cap, `start.sh` helper refactor, flat failure shapes, lazy tool paths, a cross-package extension-drift test, `apt-get update` in `start.sh` | 2026-09-26 |
| E2E (E-1…E-8) | **Pass**, E-8 with the `tb_` note in `tests/e2e/verilog-browser.md`; GIFs not recorded | 2026-09-26 |
| Installer Tier 1, 2, 3 | Tier 1 **pass** (`build.ps1` smoke test); Tier 2 **pass** (7/7 against the packaged app); Tier 3 (installer on a clean VM, V-1…V-10) **open** | 2026-09-26 |
| Linux gate (12.0 and 13.0) | **Open** (needs the Linux machines) | open |

---

## 9. Open decisions

| # | Decision | Recommendation |
|---|---|---|
| 1 | **SystemVerilog (`.sv`)** | Not in the first cut. To add: accept `.sv`/`.svh`; pass `-g2012` to the *whole* compile when any `.sv` is present (`-g` is per invocation; M13). Cost: SV keywords (`logic`, `bit`, `do`, `final`, …) become reserved for the `.v` files in that run. |
| 2 | **Terasic port names** (`KEY`, `HEX0`, …) as aliases | No — course convention `KEY_N`/`HEX0_N`. |
| 3 | **`tb_*.v` placement** | Everything `.v` → `verilog/` (AS3): `work/` is never simulated. |
| 4 | **Mixed VHDL + Verilog in one run** | Out of scope. |
| 5 | **`rst` for Verilog** | Not supported; add only if a course template needs it (one `assign`). |
| 6 | **Verilog syntax highlighting** | Out of scope by request; a ~40-line `verilogHighlight.ts` chosen by extension is the follow-up. |
| 7 | **Long-term source of the Windows binaries** | Start with pinned MSYS2 URLs plus the `vendor/` cache; re-host the assembled tree as a release asset if a pin disappears (§ 5.8). |
| 8 | **Synthesis / lint check** (Yosys `synth`, Verilator `--lint-only`) | Later, separately, off the Start path; no small Windows binary is published for either. |
| 9 | **Ship the converted starters in the app** | Not by default (the `verilog/` folder stays hidden until used). They are ready in Appendix C if wanted; adding them to `STARTER_FILES` makes the folder appear on first launch. |
| 10 | **Installed self-test (G5)** | Recommended: the only tier that verifies a student's machine without Node. Skip if you would rather keep `main.js` unchanged. |
| 11 | **`vitest` as a dev dependency** | Recommended — Vite-native, zero config, needed only for the few pure frontend modules. Alternative: test those through the browser runbook only (fewer tests, no dependency). |
| 12 | **ESLint as a dev dependency (A3)** | Recommended, scoped to the new files so nothing existing is reformatted. Alternative: rely on `tsc` strict, the § 6.4 checklist and phase I. |
| 13 | **Adjacent, existing:** the GHDL path passes *absolute* file names (`-ginput_file=…`, `session.ts`) | M11 shows Icarus fails silently on them under a non-ASCII directory; GHDL was not tested for the same. Worth a check on a profile such as `C:\Users\Rune Langøy\…` — a possible latent bug in the shipped GHDL path. Not fixed here. |
| 14 | **Portful non-board tops** | Runs standalone with a hint (§ 5.3). VHDL reports an error for the same shape today; aligning VHDL to the same friendlier behaviour is a separate, small follow-up. |
| 15 | **A top file with several modules and none named like it** | An error listing the candidates (§ 5.1). If that annoys students, a refinement is to pick the file's only *root* module (one more `-tstub` run, no scoring) — not built in. |
| 16 | **The output-limit numbers** (200 lines/s, 2 000 console lines) | Starting points; tune with case I-V21. The limiter is shared, so GHDL runs are protected too — a behaviour change only under flood. |
| 17 | **Unsupported Icarus version** | Warn, never block (§ 5.5). |
| 18 | **Other GHDL-named UI text** | Only the console panel's title changes in this plan (F3), because it sits directly above Icarus's output. The About credit and Help text mention GHDL legitimately (it is still bundled); adding an Icarus credit beside GHDL's is a wording decision for H3. |

---

## Appendix A: the verified testbench

The exact output of the throwaway generator prototype for the full board
(`DE1_SoC`), compiled with `iverilog -Wall -Wno-timescale -I. -s hdl_board_tb`
and run through the board protocol (M20). This is the golden file for step C5
(T-1). Written in Verilog-2005 only, so it needs no `-g` flag. For a smaller
port set the generator (a) connects only the declared ports, using each one's
declared spelling, (b) emits `assign ledr_sig = 10'b0;` / `assign hexN_sig =
7'h7F;` for each undeclared output, and (c) omits the `always #10` line when
`CLOCK_50` is not declared. The blank line where ties go is kept as generated.

```verilog
`timescale 1ns/1ps

module hdl_board_tb;
  reg         clk_sig    = 1'b0;
  reg         clk500_sig = 1'b0;
  reg  [9:0]  sw_sig     = 10'b0;
  reg  [3:0]  key_sig    = 4'hF;
  wire [9:0]  ledr_sig;
  wire [6:0]  hex0_sig, hex1_sig, hex2_sig, hex3_sig, hex4_sig, hex5_sig;
  

  DE1_SoC uut (.CLOCK_50(clk_sig), .SW(sw_sig), .KEY_N(key_sig), .LEDR(ledr_sig), .HEX0_N(hex0_sig), .HEX1_N(hex1_sig), .HEX2_N(hex2_sig), .HEX3_N(hex3_sig), .HEX4_N(hex4_sig), .HEX5_N(hex5_sig));

  always #10 clk_sig = ~clk_sig;
  always #1000000 clk500_sig = ~clk500_sig;

  reg [1023:0] input_file, output_file, heartbeat_file;
  integer poll_interval_ns, min_dwell_ns;
  initial begin
    if (!$value$plusargs("input_file=%s", input_file)) input_file = 0;
    if (!$value$plusargs("output_file=%s", output_file)) output_file = 0;
    if (!$value$plusargs("heartbeat_file=%s", heartbeat_file)) heartbeat_file = 0;
    if (!$value$plusargs("poll_interval_ns=%d", poll_interval_ns)) poll_interval_ns = 1000;
    if (!$value$plusargs("min_dwell_ns=%d", min_dwell_ns)) min_dwell_ns = 0;
  end

  // Real-time pacing: after every 20 ms of simulated time, report progress and
  // block on one stdin line (32'h8000_0000).
  integer fhb, pace_status;
  reg [255:0] pace_line;
  initial begin
    #1;
    forever begin
      #20000000;
      if (heartbeat_file != 0) begin
        fhb = $fopen(heartbeat_file, "w");
        $fdisplay(fhb, "%0d", $time / 1000000);
        $fclose(fhb);
      end
      pace_status = $fgets(pace_line, 32'h8000_0000);
    end
  end

  // Board I/O: apply at most one queued input line per poll, publish the
  // 52-bit board state whenever it (or the applied sequence number) changes.
  wire [51:0] board_bits = {ledr_sig, hex0_sig, hex1_sig, hex2_sig, hex3_sig, hex4_sig, hex5_sig};
  integer fin, fout, scan_count, seq, applied_seq = 0, last_seq = -1;
  reg [13:0] rec;
  reg [51:0] last_bits = 52'bx;
  time applied_at = 0;
  reg applied_one;
  initial begin
    #1;
    forever begin
      #(poll_interval_ns * 1);
      if (input_file != 0 && ($time - applied_at) >= min_dwell_ns) begin
        fin = $fopen(input_file, "r");
        if (fin != 0) begin
          applied_one = 0;
          while (!applied_one && !$feof(fin)) begin
            scan_count = $fscanf(fin, "%d %b", seq, rec);
            if (scan_count == 2 && seq > applied_seq) begin
              sw_sig = rec[13:4];
              key_sig = rec[3:0];
              applied_seq = seq;
              applied_at = $time;
              applied_one = 1;
            end
          end
          $fclose(fin);
        end
      end
      if (output_file != 0 && (board_bits !== last_bits || applied_seq != last_seq)) begin
        fout = $fopen(output_file, "w");
        $fdisplay(fout, "%b %0d", board_bits, applied_seq);
        $fclose(fout);
        last_bits = board_bits;
        last_seq = applied_seq;
      end
    end
  end
endmodule
```

How it maps to the GHDL testbench: the queue grammar (`<seq> <SW10><KEY4>`),
the output (`<52 bits> <seq>`), the dwell rule and the heartbeat number are
identical to `tbTemplate.ts`; `input_file`/`output_file`/… are plusargs instead
of generics, and pacing reads `stdin` (`32'h8000_0000`) on every platform.
Driving it, as `process.ts` will:

```
iverilog -Wall -Wno-timescale -I. -s hdl_board_tb -o sim.vvp _hdlboard_ts.v hdl_board_tb.v DE1_SoC.v
vvp -n -i sim.vvp +input_file=input.txt +output_file=output.txt +heartbeat_file=heartbeat-1.txt +poll_interval_ns=10000 +min_dwell_ns=10000
```

## Appendix B: real simulator output

Captured from the spike, Icarus 13.0 on Windows.

**Banner** (`iverilog -V`, first line): `Icarus Verilog version 13.0 (stable) (v13_0)`

**Live output of a running design** (arrival in real seconds, `vvp -n -i`,
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

**Warnings on a successful `-Wall -Wno-timescale` compile** (stderr, exit 0):

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

**The batch fixture** (`tb_counter8.v` with `_hdlboard_ts.v` first):

```
count after 3 presses = 3
count after reset     = 0
PASS
tb_counter8.v:30: $finish called at 900000 (1ps)
```

**Missing `.vpi` (the packaging trap, M2)** — exit 0, printed on every compile:

```
error: Failed to open '…\lib\ivl\system.vpi' because:
     : The specified module could not be found.
```

(The message text comes from the OS and is localised — on this Norwegian
Windows it read *"Den angitte modulen ble ikke funnet."* — which is why the
smoke test checks the *result*, not the text.)

**`-tstub` output** — the source of the ports (§ 5.4, M22). Icarus 13.0, on the
"tricky" design (an `` `ifdef``'d-out port, macro-sized widths, a generate loop,
a parameter list, an attribute), abridged: identical on 12.0. The `nexus=…`
values change run to run and are ignored. These captured files are the golden
samples for step C2.

```
root module = top_ifdef
scope: top_ifdef (2 parameters, 5 signals, 0 logic) module top_ifdef time units = 1e0
  tri unsigned input logic CLOCK_50[word=0, adr=0]  <width=1> <discipline=NONE> nexus=000001fda8d82278
  tri unsigned input logic[3:0] KEY_N[word=0, adr=0]  <width=4> <discipline=NONE> nexus=000001fda8d821b8
  tri unsigned output logic[9:0] LEDR[word=0, adr=0]  <width=10> <discipline=NONE> nexus=000001fda8d822a8
  tri unsigned input logic[9:0] SW[word=0, adr=0]  <width=10> <discipline=NONE> nexus=000001fda8d822d8
scope: top_ifdef.g[0] (1 parameters, 1 signals, 0 logic) type(5) g[0] time units = 1e0
scope: top_ifdef.g[1] (1 parameters, 1 signals, 0 logic) type(5) g[1] time units = 1e0
```

**Include failures** (M23): `miss.v:2: Include file nope.vh not found` /
`Preprocessor failed with 1 errors.`

## Appendix C: converted starter designs (test fixtures)

The three static VHDL examples of `STARTER_FILES` converted to Verilog-2001,
plus one new self-checking testbench. All four were compiled with `iverilog
-Wall -Wno-timescale` (no output) and run (M20). They become the files of step
A1.

Conversion notes: comments carried over; `std_logic_vector` → `wire [n:0]`;
the `integer range` counter → a 7-bit `reg`; `falling_edge(KEY_N(x))` → a
previous-value register (the Verilog idiom for "edge of an active-low key
without a clock"). **One deliberate difference:** `blinkTest.vhdl` leaves the
`HEX*` outputs undriven; here they are blanked (`7'b1111111`) because Verilog
would read them as high-impedance (`z`) — both render blank (§ 7.6).

### `DE1_SoC.v`

```verilog
// The real DE1-SoC top-level interface: these are the board's own pin
// names, not a stand-in for them, so this file can go straight into
// Quartus with only a pin assignment added. Every port here is optional
// for the simulator - a design that only declares SW and LEDR is a
// perfectly normal first lab.
module DE1_SoC (
    input  wire        CLOCK_50,
    input  wire [9:0]  SW,
    input  wire [3:0]  KEY_N,
    output wire [9:0]  LEDR,
    output wire [6:0]  HEX0_N,
    output wire [6:0]  HEX1_N,
    output wire [6:0]  HEX2_N,
    output wire [6:0]  HEX3_N,
    output wire [6:0]  HEX4_N,
    output wire [6:0]  HEX5_N
);
    // LEDR = SW; the first thing every student wires up.
    assign LEDR = SW;

    // Blank until you add your own 7-segment logic - active low, so
    // all-ones is "off".
    assign HEX0_N = 7'b1111111;
    assign HEX1_N = 7'b1111111;
    assign HEX2_N = 7'b1111111;
    assign HEX3_N = 7'b1111111;
    assign HEX4_N = 7'b1111111;
    assign HEX5_N = 7'b1111111;
endmodule
```

### `blinkTest.v`

```verilog
// The real DE1-SoC top-level interface: these are the board's own pin
// names, not a stand-in for them, so this file can go straight into
// Quartus with only a pin assignment added. Every port here is optional
// for the simulator - a design that only declares SW and LEDR is a
// perfectly normal first lab.
module blinkTest (
    input  wire        CLOCK_500Hz,
    input  wire [9:0]  SW,
    input  wire [3:0]  KEY_N,
    output wire [9:0]  LEDR,
    output wire [6:0]  HEX0_N,
    output wire [6:0]  HEX1_N,
    output wire [6:0]  HEX2_N,
    output wire [6:0]  HEX3_N,
    output wire [6:0]  HEX4_N,
    output wire [6:0]  HEX5_N
);
    // 500 Hz clock -> 500 cycles per second
    // For 2 Hz blink (LED toggles every 250 ms):
    // Toggle period = 1 / (2 * 2 Hz) = 250 ms
    // Cycles per toggle = 0.25 s * 500 = 125
    localparam TOGGLE_COUNT = 125;

    reg [6:0] counter   = 7'd0;      // counts 0 .. TOGGLE_COUNT-1
    reg       led_state = 1'b0;

    always @(posedge CLOCK_500Hz) begin
        if (counter == TOGGLE_COUNT - 1) begin
            counter   <= 7'd0;
            led_state <= ~led_state;
        end else begin
            counter <= counter + 7'd1;
        end
    end

    // Drive all 10 LEDs with the same blinking signal
    assign LEDR = {10{led_state}};

    // The VHDL original leaves these outputs undriven; Verilog would read
    // them as high-impedance, so they are blanked explicitly (active low).
    assign HEX0_N = 7'b1111111;
    assign HEX1_N = 7'b1111111;
    assign HEX2_N = 7'b1111111;
    assign HEX3_N = 7'b1111111;
    assign HEX4_N = 7'b1111111;
    assign HEX5_N = 7'b1111111;
endmodule
```

### `keyCouter2Led.v` (module `counter8`, as in the VHDL original)

```verilog
module counter8 (
    input  wire        CLOCK_50,
    input  wire [3:0]  KEY_N,
    output wire [9:0]  LEDR
);
    reg [7:0] count    = 8'd0;
    reg [1:0] key_prev = 2'b11;

    // KEY_N[1]: reset, KEY_N[0]: count up. Both act on a button *press*,
    // i.e. the falling edge of the active-low key.
    always @(KEY_N[1:0]) begin
        if (key_prev[1] && !KEY_N[1])
            count <= 8'd0;
        else if (key_prev[0] && !KEY_N[0])
            count <= count + 8'd1;
        key_prev <= KEY_N[1:0];
    end

    assign LEDR[7:0] = count;
    assign LEDR[9:8] = 2'b00;          // unused LEDs off
endmodule
```

### `tb_counter8.v` (new — no VHDL original; batch-mode fixture)

```verilog
// Self-checking testbench: no ports, so it runs on its own (batch mode).
module tb_counter8;
    reg        CLOCK_50 = 1'b0;
    reg  [3:0] KEY_N    = 4'b1111;
    wire [9:0] LEDR;

    counter8 dut (.CLOCK_50(CLOCK_50), .KEY_N(KEY_N), .LEDR(LEDR));

    always #10 CLOCK_50 = ~CLOCK_50;

    task press(input integer key);
        begin
            KEY_N[key] = 1'b0;
            #100;
            KEY_N[key] = 1'b1;
            #100;
        end
    endtask

    initial begin
        #100;
        press(0);
        press(0);
        press(0);
        $display("count after 3 presses = %0d", LEDR[7:0]);
        press(1);
        $display("count after reset     = %0d", LEDR[7:0]);
        if (LEDR[7:0] === 8'd0) $display("PASS");
        else                    $display("FAIL");
        $finish;
    end
endmodule
```

### Scenarios (input to `scenarios.json`, step A2)

Checked against the real simulator in M20. `stim` is `<SW9..SW0><KEY3..KEY0>`;
`ledr` is `LEDR9..LEDR0`; `hex: blank` means all six displays `1111111`.
Poll settings are the production ones: 10 µs poll and dwell when `CLOCK_50` is
declared, 1 ms poll and 4 ms dwell when it is not.

| Fixture | Step | `stim` | Expected |
|---|---|---|---|
| `DE1_SoC` | initial | — | `ledr 0000000000`, `hex blank` |
| | 1 | `1010101010 1111` | `ledr 1010101010`, `hex blank` |
| | 2 | `0000000000 1111` | `ledr 0000000000` |
| `keyCouter2Led` | initial | — | `ledr 0000000000` |
| | 1 | `0000000000 1110` (press KEY0) | `ledr 0000000001` |
| | 2 | `0000000000 1111` (release) | `ledr 0000000001` |
| | 3 | `0000000000 1110` (press) | `ledr 0000000010` |
| | 4 | `0000000000 1111`, then `0000000000 1101` (press KEY1) | `ledr 0000000000` |
| `blinkTest` | no stimulus | — | `ledr 1111111111` within 150–400 ms; then `0000000000` 150–400 ms later; `hex blank` |
| `tb_counter8` (batch) | — | — | stdout contains `PASS`; `DONE completed` |

For the parity tests (§ 7.6) the same table is run against the `vhdl/` twin of
each fixture, comparing `LEDR` exactly and `HEX` after `X` → "off".

## Appendix D: sources

Primary sources consulted (2026-09-26). Release, licence and package facts were
read from the GitHub API, the MSYS2 repository metadata and upstream source
headers, not from summaries.

- Icarus Verilog repository and README — <https://github.com/steveicarus/iverilog>
- Icarus Verilog releases (v13_0 published 2026-03-02) — <https://github.com/steveicarus/iverilog/releases>
- `vvp` flags (`-i`, `-n`, `-N`) — <https://steveicarus.github.io/iverilog/usage/vvp_flags.html>
- Icarus Verilog for Windows (installer list; v12-20220611, v14-20260804) — <https://bleyer.org/icarus/>
- MSYS2 package `mingw-w64-ucrt-x86_64-iverilog` — <https://packages.msys2.org/packages/mingw-w64-ucrt-x86_64-iverilog>
- MSYS2 binary repository — <https://repo.msys2.org/mingw/ucrt64/> · source packages — <https://repo.msys2.org/mingw/sources/> · recipe — <https://github.com/msys2/MINGW-packages/tree/master/mingw-w64-iverilog>
- Alpine `iverilog` (edge/community, 13.0-r0) — <https://pkgs.alpinelinux.org/packages?name=iverilog&branch=edge>
- Debian `iverilog` versions — <https://packages.debian.org/search?keywords=iverilog&searchon=names&suite=all&section=all>
- Verilator install guide — <https://verilator.org/guide/latest/install.html> · command reference — <https://verilator.org/guide/latest/exe_verilator.html> · overview (LGPL-3.0 or Artistic-2.0) — <https://verilator.org/guide/latest/overview.html>
- Yosys (ISC; releases carry source only) — <https://github.com/YosysHQ/yosys> · `sim` — <https://yosyshq.readthedocs.io/projects/yosys/en/0.47/cmd/sim.html>
- OSS CAD Suite (windows-x64 ≈ 600 MB) — <https://github.com/YosysHQ/oss-cad-suite-build>
- OSS CVC — <https://github.com/cambridgehackers/open-src-cvc> · GPL Cver — <https://github.com/omasanori/gplcver>
- *Clean Code: A Handbook of Agile Software Craftsmanship*, Robert C. Martin (the standard § 6 adapts)
- The GHDL plan this builds on — [`ghdl_implementation_plan.md`](ghdl_implementation_plan.md)
