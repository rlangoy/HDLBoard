# Implementation files for HDLBoard plugins

Reference code for the plugin design. The documents explain the method;
this folder holds the code they refer to.

- Overview: [`../plugin_structure.md`](../plugin_structure.md)
- Testbench-driven (batch) plugins: [`../plugin_batch_implementation_plan.md`](../plugin_batch_implementation_plan.md)
- Real-time (board) plugins, draft: [`../plugin_board_implementation_draft.md`](../plugin_board_implementation_draft.md)

| Path | What it is | Status | Intended home when implemented |
|---|---|---|---|
| `vhdl/hdlb_pkg.vhd` | `hdlb_emit` – writes one `@@HDLB` line with the timestamp | verified (GHDL 4.1) | `server/plugins/vhdl/` |
| `vhdl/uart_monitor.vhd` | reference plugin: behavioural UART receiver (8N1) | verified (GHDL 4.1) | `server/plugins/vhdl/` |
| `examples/uart_tx.vhd` | example student design: synthesizable UART transmitter | verified | example project / course material |
| `examples/uart_tx_tb.vhd` | example student testbench using `hdlboard.uart_monitor` | verified | example project / course material |
| `examples/uart_monitor_fe_tb.vhd` | plugin self-test: framing error, timestamp > 2³¹ ns | verified | server integration test |
| `examples/*.expected.txt` | expected `@@HDLB` lines for the two testbenches | – | integration test fixtures |
| `examples/run_examples.sh` | runs the examples as batch mode will and compares output | – | – |
| `ts/pluginLine.ts` (+ `.test.ts`) | server: parse/route `@@HDLB` lines, `PLUGIN` frame encode/decode | proposal, unit-tested, not wired in | `server/src/pluginLine.ts` |
| `ts/uartPayload.ts` (+ `.test.ts`) | frontend: decode `uart` payload, text view, time formatting | proposal, unit-tested, not wired in | `src/components/workbench/plugins/uart/` |

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

## Running the TypeScript tests

The `.ts` files are proposals, not part of any build yet. Each follows the
conventions of the place it is meant for, so it can be moved there as is:

| File | Conventions | How to run after moving it |
|---|---|---|
| `ts/pluginLine.ts` + test | server: ESM with `.js` import suffixes, Node's own test runner (`node:test`, `node:assert/strict`), numbered test ids | `cd server && npm test` |
| `ts/uartPayload.ts` + test | frontend: bundler imports without suffix, vitest | `npm test` (root `vitest.config.ts` searches `src/**/*.test.ts` only) |

Both type-check under the repository's strict settings (`server/tsconfig.json`
and `tsconfig.app.json` respectively). Because neither test runner searches
`docs/`, keeping the files here does not change the existing test suites.
