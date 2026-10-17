#!/usr/bin/env bash
# Re-creates the waveform fixtures of docs/waveform_viewer_spec.md step 0.
# Needs ghdl and iverilog/vvp on PATH (or GHDL / IVERILOG / VVP set).
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
GHDL="${GHDL:-ghdl}"; IVERILOG="${IVERILOG:-iverilog}"; VVP="${VVP:-vvp}"
# A bundled Icarus tree (winInstaller/vendor/iverilog) needs -B<its dir>; set IVERILOG_FLAGS="-B<dir>".
IVERILOG_FLAGS="${IVERILOG_FLAGS:-}"; VVP_FLAGS="${VVP_FLAGS:-}"
work="$(mktemp -d)"; trap 'rm -rf "$work"' EXIT
cd "$work"
"$GHDL" -a --std=08 "$here/vhdl/wave_types_tb.vhd" "$here/vhdl/forever_tb.vhd"
"$GHDL" -e --std=08 wave_types_tb
"$GHDL" -e --std=08 forever_tb
"$GHDL" -r --std=08 wave_types_tb --wave="$here/ghw/wave_types.ghw" > /dev/null
"$GHDL" -r --std=08 wave_types_tb --vcd="$here/vcd/ghdl_wave_types.vcd" > /dev/null
# Stopped runs: the size guard sends SIGTERM to a testbench that never ends. The files
# are cut to their first 64 KiB, which is what an earlier stop would have left, so the
# repository stays small; the cut lands inside a record, as a real stop does.
"$GHDL" -r --std=08 forever_tb --wave=forever.ghw & pid=$!
sleep 0.2; kill -TERM "$pid"; wait "$pid" || true
head -c 65536 forever.ghw > "$here/ghw/forever_stopped.ghw"
"$GHDL" -r --std=08 forever_tb --vcd=forever.vcd & pid=$!
sleep 0.2; kill -TERM "$pid"; wait "$pid" || true
head -c 65536 forever.vcd > "$here/vcd/ghdl_forever_stopped.vcd"
cp "$here/verilog/counter_tb.v" .
cat > wave.v <<'V'
module hdlboard_wave;
  initial begin
    $dumpfile("icarus_counter.vcd");
    $dumpvars(0, counter_tb);
  end
endmodule
V
printf '`timescale 1ns/1ps\n' > ts.v
"$IVERILOG" $IVERILOG_FLAGS -o sim.vvp -s counter_tb -s hdlboard_wave ts.v counter_tb.v wave.v
"$VVP" $VVP_FLAGS -n sim.vvp > /dev/null
cp icarus_counter.vcd "$here/vcd/"

# The unit tests' copies (src/components/waveform/fixtures/): GHW as base64 text, because
# the frontend's tests read fixtures through Vite's `?raw`, which is text only.
fixtures="$here/../../src/components/waveform/fixtures"
mkdir -p "$fixtures"
cp "$here"/vcd/*.vcd "$fixtures/"
for f in "$here"/ghw/*.ghw; do base64 -w 76 "$f" > "$fixtures/$(basename "$f").b64"; done
