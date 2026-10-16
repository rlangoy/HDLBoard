# Implementation files for HDLBoard plugins

Reference code for the plugin design. The documents explain the method;
this folder holds the code they refer to.

- Overview: [`../plugin_structure.md`](../plugin_structure.md)
- Testbench-driven (batch) plugins: [`../plugin_batch_implementation_plan.md`](../plugin_batch_implementation_plan.md)
- Real-time (board) plugins, draft: [`../plugin_board_implementation_draft.md`](../plugin_board_implementation_draft.md)

| Path | What it is | Status | Intended home when implemented |
|---|---|---|---|
| `vhdl/hdlb_pkg.vhd` | `hdlb_emit` – writes one `@@HDLB` line with the timestamp; `hdlb_is_ident` | verified (GHDL 4.1) | `server/plugins/vhdl/` |
| `vhdl/uart_monitor.vhd` | reference plugin: behavioural UART receiver (8N1); receiver semantics documented in the file header | verified (GHDL 4.1) | `server/plugins/vhdl/` |
| `examples/uart_tx.vhd` | example student design: synthesizable UART transmitter | verified | example project / course material |
| `examples/uart_tx_tb.vhd` | example student testbench using `hdlboard.uart_monitor` | verified | example project / course material |
| `examples/uart_monitor_fe_tb.vhd` | plugin self-test: framing error, timestamp > 2³¹ ns | verified | server integration test |
| `examples/uart_monitor_edge_tb.vhd` | plugin self-test: glitch, initial `U`, back-to-back bytes, undefined bit (`XX`), 9600 baud | verified | server integration test |
| `examples/*.expected.txt` | expected `@@HDLB` lines for the three testbenches | – | integration test fixtures |
| `examples/run_examples.sh` | runs the examples as batch mode will and compares output | – | – |
| `ts/pluginLine.ts` (+ `.test.ts`) | server: parse/route `@@HDLB` lines (printable ASCII, ≤ 200 characters), `PLUGIN` frame encode/decode, `usesHdlboardLibrary` | proposal, unit-tested, not wired in | `server/src/pluginLine.ts` |
| `ts/uartPayload.ts` (+ `.test.ts`) | frontend: decode `uart` payload, text view, time formatting | proposal, unit-tested, not wired in | `src/components/workbench/plugins/uart/` |
| `ts/pluginCatalog.ts` (+ `.test.ts`) | server: plugin catalog, enabled kinds, files to analyse, hint for a disabled plugin, `PLUGINS` list | proposal, unit-tested, not wired in | `server/src/pluginCatalog.ts` |
| `feasibility/` | prototype monitors for I2C, SPI and 1-Wire with testbenches and expected output | **prototype, not shipped**; verified (GHDL 4.1) | later plugins `i2c`, `spi`, `onewire` |

## Running the examples

```sh
sh docs/impl_files_for_plugins/examples/run_examples.sh
```

It runs the same GHDL commands that batch mode will use:

```sh
ghdl -a --std=08 --work=hdlboard vhdl/hdlb_pkg.vhd vhdl/uart_monitor.vhd   # plugin library first
ghdl -a --std=08 examples/uart_tx.vhd examples/uart_tx_tb.vhd              # student files
ghdl -e --std=08 uart_tx_tb
ghdl -r --std=08 uart_tx_tb
```

Only the `@@HDLB` lines are compared with the expected files, because GHDL's
own messages (`simulation finished @…`) differ between GHDL versions.

## Feasibility prototypes (I2C, SPI, 1-Wire)

`feasibility/` shows that the plugin structure carries other buses. It is **not part of the first implementation** and not shipped. It reuses `vhdl/hdlb_pkg.vhd` and compares the `@@HDLB` lines with the expected files, as `run_examples.sh` does:

```sh
sh docs/impl_files_for_plugins/feasibility/run_feasibility.sh
```

| Prototype | Testbench | Covers |
|---|---|---|
| `i2c_monitor.vhd` | `i2c_tb.vhd` | open-drain bus with pull-ups; S, address+W, data, repeated start, address+R, data with NACK, P |
| `spi_monitor.vhd` | `spi_tb.vhd` | modes 0, 3 and 1; 8 and 16 bit words; chip-select frames |
| `onewire_monitor.vhd` | `onewire_tb.vhd` | reset with and without presence; write and read slots at standard speed |

Payload grammars and limits are in the batch plan, section 3.7.

## Running the TypeScript tests

The `.ts` files are proposals, not part of any build yet. Each follows the
conventions of the place it is meant for, so it can be moved there as is:

| File | Conventions | How to run after moving it |
|---|---|---|
| `ts/pluginLine.ts`, `ts/pluginCatalog.ts` + tests | server: ESM with `.js` import suffixes, Node's own test runner (`node:test`, `node:assert/strict`), numbered test ids | `cd server && npm test` |
| `ts/uartPayload.ts` + test | frontend: bundler imports without suffix, vitest | `npm test` (root `vitest.config.ts` searches `src/**/*.test.ts` only) |

Both type-check under the repository's strict settings (`server/tsconfig.json`
and `tsconfig.app.json` respectively). Because neither test runner searches
`docs/`, keeping the files here does not change the existing test suites.
