#!/bin/sh
# Runs the prototype monitors (I2C, SPI, 1-Wire) like batch mode would and compares the
# @@HDLB lines with the *.expected.txt files. Usage: sh run_feasibility.sh
set -e
HERE=$(cd "$(dirname "$0")" && pwd)
PLUG="$HERE/../vhdl"
WORK=$(mktemp -d)
cd "$WORK"
ghdl -a --std=08 --work=hdlboard "$PLUG/hdlb_pkg.vhd" "$HERE/vhdl/i2c_monitor.vhd" "$HERE/vhdl/spi_monitor.vhd" "$HERE/vhdl/onewire_monitor.vhd"
ghdl -a --std=08 "$HERE/examples/i2c_tb.vhd" "$HERE/examples/spi_tb.vhd" "$HERE/examples/onewire_tb.vhd"
status=0
for tb in i2c_tb spi_tb onewire_tb; do
  ghdl -e --std=08 "$tb"
  ghdl -r --std=08 "$tb" 2>&1 | grep '^@@HDLB' > "$tb.out" || true
  if diff -u "$HERE/examples/$tb.expected.txt" "$tb.out"; then echo "PASS $tb"; else echo "FAIL $tb"; status=1; fi
done
rm -rf "$WORK"
exit $status
