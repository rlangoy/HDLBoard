# Captured `iverilog -tstub` output

Golden samples for `server/src/verilog/ports.ts` (`parseStubPorts`). HDLBoard reads a
Verilog design's ports from Icarus's own elaboration rather than parsing source
(docs/Verilog_implementation_plan.md, section 5.4), so the parser is tested against
**real output**, never hand-written text. `-tstub` is a debug dump, not a stable
interface; these files are what would tell us if a future Icarus changes it.

| File | Source | Command | Icarus |
|---|---|---|---|
| `simple13.stub` | `../verilog/DE1_SoC.v` | `-tstub -s DE1_SoC` | 13.0 |
| `tricky13.stub` | `tricky.v` + `defs.vh` | `-I. -tstub -s top_ifdef` | 13.0 |
| `tricky12.stub` | `tricky.v` + `defs.vh` | `-I. -tstub -s top_ifdef` | 12.0 |
| `tworoots13.stub` | `tworoots.v` | `-tstub` (no `-s`: every root is reported) | 13.0 |
| `portless13.stub` | `../verilog/keyCouter2Led.v`, `../verilog/tb_counter8.v` | `-tstub -s tb_counter8` | 13.0 |

`tricky.v` is a design a hand-written scanner would get wrong: a port removed by
`` `ifdef``, widths written with a macro, a generate loop, a parameter list and an
attribute. Icarus resolves all of it, and the 12.0 and 13.0 outputs list the same ports.

## Recapturing

With the vendored tree (`winInstaller/fetch-iverilog.ps1`) for 13.0:

```powershell
$T = "<repo>\winInstaller\vendor\iverilog"
& "$T\iverilog.exe" "-B$T" -tstub -s DE1_SoC -o simple13.stub ..\verilog\DE1_SoC.v
```

12.0 is not vendored; the sample came from the MSYS2 `mingw-w64-ucrt-x86_64-iverilog-1~12.0-1`
package. Normalise the output to LF line endings before committing (the tests read
either, but `.gitattributes` keeps this directory LF). The `nexus=…` addresses differ from
run to run and are ignored by the parser.
