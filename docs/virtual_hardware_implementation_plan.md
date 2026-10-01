# HDLBoard Virtual Bus Implementation Plan

Status: Updated proposal
Repository: rlangoy/HDLBoard

## 1. Decision summary

The virtual UART/SPI/I²C/One-Wire subsystems should be implemented as simulator-side HDL models, not as TypeScript logic that samples board state in the browser or backend.

This gives the correct answer to the timing problem:

- The simulator sees real signal transitions and real signal timing.
- The protocol decoder runs in HDL, where the edges and delays are known.
- The frontend receives decoded, bounded events rather than trying to infer protocol activity from periodic snapshots.
- The current HDLBoard architecture remains intact: generated testbenches, session-managed files, and WebSocket messages continue to be the integration boundary.

The end state should be:

- GHDL/VHDL virtual bus models for VHDL runs.
- Equivalent Verilog virtual bus models for Icarus Verilog runs.
- A shared manifest and event schema across engines.
- A run-scoped file transport between simulator and Node backend.
- A browser UI driven by decoded virtual-device events.

This is the recommended architecture for HDLBoard because it matches the project’s existing design: simulator is the source of truth and the frontend is a viewer/driver of simulator-owned state.

---

## 2. Repository fit

This plan fits the current architecture in the repository:

- `server/src/session.ts` owns per-run temp directories, reset, output polling, pacing, and cleanup.
- `server/src/engines/types.ts` defines the shared simulator abstraction.
- `server/src/engines/ghdlEngine.ts` prepares GHDL runs.
- `server/src/engines/verilogEngine.ts` prepares Verilog runs.
- `server/src/tbTemplate.ts` generates the VHDL board wrapper.
- `server/src/verilog/testbench.ts` generates the Verilog wrapper.
- `server/src/protocol.ts` defines the backend/browser communication protocol.
- `src/App.tsx` and the workbench components are the frontend integration point.

The virtual bus infrastructure should be implemented as an extension of these pieces, not as a second application or another runtime.

---

## 3. Core design principles

### 3.1 Internal HDL does the timing work

Each virtual bus model should live in the generated simulator testbench and should be written in the same HDL language as the student design being simulated.

- VHDL designs use VHDL bus models.
- Verilog designs use Verilog bus models.
- The event schema is shared, but the HDL implementation is engine-specific.

This means the simulator handles the real timing, edge detection, and protocol decoding. The browser never reconstructs UART/SPI/I²C from sampled board state.

### 3.2 The frontend sees only protocol events and device state

The browser may:

- Display bus logs.
- Render device panels.
- Send permitted external commands.
- Update temperature, memory, or display state in a simulator-owned model.

The browser must not invent a successful transaction that never occurred in the simulator.

### 3.3 Shared manifest, engine-specific models

Use one validated manifest for each run, but generate different HDL wrappers per simulator.

Example:

```json
{
  "schemaVersion": 1,
  "buses": [
    {
      "id": "uart0",
      "protocol": "uart",
      "pins": {
        "tx": "UART_TX",
        "rx": "UART_RX"
      },
      "parameters": {
        "baud": 115200,
        "dataBits": 8,
        "parity": "none",
        "stopBits": 1
      }
    }
  ],
  "devices": [
    {
      "id": "terminal0",
      "type": "uart-terminal",
      "version": 1,
      "busId": "uart0",
      "parameters": {
        "lineEnding": "crlf",
        "localEcho": false
      }
    }
  ]
}
```

This manifest drives:

- simulator wrapper generation,
- validation,
- backend session setup,
- capability advertisement,
- device panel creation,
- protocol viewer state.

### 3.4 File transport stays the main integration boundary

Use the current session file protocol between simulator and Node, not VPI/VHPI as the first implementation.

Reason:

- works across platforms,
- works with Electron and Docker,
- keeps the simulator behind the same session abstraction,
- keeps the UI logic decoupled from simulator internals,
- avoids native C/C++ plugin complexity.

VPI or VHPI can be evaluated later as a performance optimization, but it should not be the first implementation path.

---

## 4. Proposed internal bus model layout

Add a virtual-device area under `server/src`:

```text
server/src/virtual/
  manifest.ts
  catalog.ts
  validation.ts
  limits.ts
  events.ts
  commands.ts
  transport.ts
  runId.ts
  vhdl/
    uart_terminal.vhdl
    uart_observer.vhdl
    spi_observer.vhdl
    spi_memory.vhdl
    i2c_slave.vhdl
    i2c_sensor.vhdl
    onewire_sensor.vhdl
  verilog/
    uart_terminal.v
    uart_observer.v
    spi_observer.v
    spi_memory.v
    i2c_slave.v
    i2c_sensor.v
    onewire_sensor.v
```

The HDL files should be generated into the per-run session directory and instantiated by the generated testbench when a run includes virtual devices.

---

## 5. Bus model responsibilities

### 5.1 UART model

Responsibilities:

- Monitor student TX pin.
- Detect start bit and sample bits using simulated time.
- Validate stop bit and framing.
- Emit byte events and error events.
- Drive student RX pin using queued byte input from the UI.
- Acknowledge consumed input.
- Reset stale input on reset.

Target initial profile:

- 8N1
- 115200 baud default
- LSB-first
- idle high

### 5.2 SPI model

Responsibilities:

- Observe `SCLK`, `MOSI`, `MISO`, and `CS`.
- Detect bus select, transfer, and deselect boundaries.
- Decode full-duplex bytes.
- Support an educational memory profile with bounded state.
- Release MISO when unselected.
- Report invalid timing and partial transfers.

Initial supported modes should be limited to those fully tested.

### 5.3 I²C model

Responsibilities:

- Model open-drain electrical behavior.
- Resolve line level with pull-ups and low-drive devices.
- Detect START, repeated START, address, data, ACK/NACK, and STOP.
- Support a reusable slave interface.
- Add a simple educational EEPROM/sensor profile.
- Explicitly reject unsupported features instead of silently approximating them.

### 5.4 One-Wire model

Responsibilities:

- Detect reset and presence.
- Decode read/write slots.
- Track command state.
- Model a simple temperature device profile.
- Report timing and unknown-line conditions.

This should be implemented after the shared framework and UART/I²C discipline are stable.

---

## 6. Event/schema design

Use a shared event schema independent of simulator language.

Each event contains:

- `schemaVersion`
- `runId`
- `busId`
- `deviceId`
- `sequence`
- `timestamp`
- `timestampUnit`
- `eventType`
- `payload`
- `errorFlags`

Examples:

```json
{
  "schemaVersion": 1,
  "runId": "run-4",
  "sequence": 17,
  "timestamp": 1250000,
  "timestampUnit": "ns",
  "busId": "uart0",
  "deviceId": "terminal0",
  "eventType": "uart.byte",
  "payload": {
    "direction": "rx",
    "value": 72,
    "hex": "0x48"
  },
  "errorFlags": []
}
```

The backend should convert these internal records into browser-visible event objects without altering semantics.

---

## 7. Runtime transport between HDL and Node

### 7.1 File-based record transport

Use session-scoped files, for example:

```text
virtual-events.ndjson
virtual-commands.ndjson
virtual-events.tmp
virtual-commands.tmp
```

Requirements:

- one event per line
- complete JSON objects only
- bounded record size
- bounded line count
- incomplete trailing record retained between polls
- stale records rejected on reset
- old run IDs discarded on reset
- cleanup on stop and destroy

This fits the current `Session` architecture and keeps the simulator and backend decoupled from React timing.

### 7.2 Commands from UI to simulator

The UI sends commands like:

```text
DEVICE terminal0 WRITE_BYTES 48 65 6c 6c 6f
DEVICE sensor0 SET_TEMPERATURE 23.5
VIEWER clear uart0
```

These become JSON records or text commands that the simulator reads. The simulator only consumes commands for the current run ID.

### 7.3 Reset behavior

On reset:

1. Stop current run.
2. Invalidate old run ID.
3. Discard queued commands.
4. Reset virtual device state.
5. Clear event files or rename them to a fresh set.
6. Restart run.
7. Reject stale records from the old run.

This is important because stale UART bytes or SPI memory state must not leak across runs.

---

## 8. Generated testbench integration

### 8.1 VHDL generator changes

Update `server/src/tbTemplate.ts` to include optional generated sections when virtual devices are enabled.

Pseudo-structure:

```vhdl
-- student entity instantiation
-- board signal declarations
-- virtual bus signal declarations
-- device instances
-- observer instances
-- transport file path generics
-- command reader process
-- event writer process
-- student top port map
```

The generated wrapper must be able to:

- instantiate the student top,
- instantiate the active device model,
- instantiate the passive protocol observer,
- route the mapped pins,
- provide command and event file paths,
- preserve the existing DE1-SoC board behavior when no virtual devices are configured.

### 8.2 Verilog generator changes

Update `server/src/verilog/testbench.ts` with equivalent sections for Verilog.

The modeling style should be separate from the VHDL one, but the externally visible behavior must be the same.

### 8.3 No virtual devices path

If no virtual bus/device manifest is supplied, the generated testbench should remain effectively identical to the current board-only wrapper.

This preserves the project’s current behavior and performance characteristics.

---

## 9. Frontend integration

Add a new virtual-device host layer under the workbench.

Suggested structure:

```text
src/components/virtual/
  VirtualDeviceHost.tsx
  VirtualDeviceRegistry.ts
  VirtualBusViewer.tsx
  VirtualEventList.tsx
  VirtualDeviceHeader.tsx
  UartTerminalPanel.tsx
  SpiMemoryPanel.tsx
  I2cEepromPanel.tsx
  OneWireTemperaturePanel.tsx
```

### 9.1 Shared header

Every panel should show:

- device name
- instance ID
- device type/version
- bus ID
- mapped pins
- status
- error state
- overflow state

### 9.2 Bus viewer

One viewer per bus with:

- bounded history
- filter by event type
- simulated timestamps
- sequence numbers
- device filtering
- overflow indicator

### 9.3 Device panels

- UART terminal panel
- SPI memory panel
- I²C EEPROM or sensor panel
- One-Wire temperature panel

The device panel should have a clear distinction between:

- viewer-only actions
- external state changes
- actual bus-triggered student activity

For example, changing the ambient temperature in the UI is an external condition, not a fake student read.

---

## 10. Implementation phases

### Phase 0 — Baseline and feasibility

Before implementing virtual buses:

1. Run current frontend tests.
2. Run backend unit tests.
3. Run backend integration tests.
4. Run `tools/verify-backend.mjs`.
5. Record baseline latency and no-device overhead.
6. Verify the existing GHDL and Icarus board flows remain unchanged.
7. Confirm the current Windows POSIX/stdio pacing behavior remains respected.

Deliverables:

- `docs/virtual_hardware_architecture.md`
- `docs/virtual_hardware_protocol.md`
- `tests/fixtures/virtual-hardware-baseline.json`

### Phase 1 — Shared manifest, validation, and transport

Implement:

- manifest parser and schema validation
- event and command definitions
- per-run transport files
- command queue and event queue limits
- reset handling for stale run state

Acceptance criteria:

- invalid manifest rejected before simulation
- no-device configuration creates no extra processes or files
- command/event round trip works end to end
- stale run data is rejected

### Phase 2 — UART as first complete vertical slice

Implement simulator-side UART TX/RX plus terminal panel.

Acceptance criteria:

- VHDL and Verilog student TX generate bytes and framing errors correctly.
- Student RX receives real simulated serial frames.
- UI terminal shows bytes and errors.
- Baud changes are explicit and happen on reset or next run.
- Reset clears stale UART data.
- Example HDL is visible and documented.

### Phase 3 — SPI observer and serial memory profile

Start with passive observer + educational memory model.

Acceptance criteria:

- distinct CS lines work on shared bus
- partial transfer is detected correctly
- MISO release is correct when unselected
- HDL read and write behavior matches simulator memory state

### Phase 4 — I²C electrical model and EEPROM profile

Implement the I²C open-drain electrical behavior first.

Acceptance criteria:

- released bus reads high
- any low driver reads low
- invalid active-high drive is rejected or reported
- START/STOP/address/ACK/NACK logic works
- EEPROM readback agrees with simulator memory state

### Phase 5 — One-Wire temperature profile

Implement after UART/SPI/I²C are stable.

Acceptance criteria:

- reset/presence works
- timing errors are visible
- slot decoding is correct
- conversion and scratchpad readback work as documented

### Phase 6 — Documentation and final review

Document:

- supported engines and features
- unsupported features
- limits
- reset behavior
- external UI intervention semantics
- simulator/device ownership boundaries
- examples and expected outputs

---

## 11. Recommended internal simulator design for timing correctness

The virtual buses should be built as normal HDL processes operating on actual signals.

### UART example

```vhdl
process
begin
  while true loop
    wait until tx_i = '0';
    wait for bit_period/2;
    -- sample start and bits
    -- accumulate byte
    -- validate stop bit
    -- emit event
  end loop;
end process;
```

### SPI example

```vhdl
process
begin
  while true loop
    wait until cs_i = '0';
    -- sample MOSI on selected edge
    -- update byte transfer
    -- drive MISO on output edge
    wait until cs_i = '1';
    -- finalize transfer
  end loop;
end process;
```

### I²C example

```vhdl
process
begin
  while true loop
    wait until scl = '1' and sda'event and sda = '0';
    -- detect START
    -- collect address/data bytes
    -- assert ACK/NACK
    -- detect STOP
  end loop;
end process;
```

This is what the simulator is good at. It matches the platform’s actual digital behavior much better than a backend polling a board state snapshot every 20 ms.

---

## 12. Key technical decisions

### Decision 1: simulator-side HDL models, not backend sampling

Use HDL to observe real signal transitions and timing. This is the correct place for protocol decoding.

### Decision 2: engine-specific HDL implementations

Use VHDL for GHDL and Verilog for Icarus, but keep the event and manifest schema shared.

### Decision 3: file transport first, VPI later

Use per-run files for simulator ↔ backend communication first. VPI/VHPI is optional later but should not be the first delivery path.

### Decision 4: explicit manifest validation

Do not silently attach virtual buses to random student ports. Require explicit mapping and fail early with useful errors.

### Decision 5: no fake transactions

The UI can display external conditions, but it cannot imply a successful transaction unless the simulator emitted it.

---

## 13. Definition of done

The feature is complete when a student can:

1. Add visible controller HDL to a project.
2. Map its ports explicitly to supported virtual buses.
3. Run it under GHDL or Icarus where support is advertised.
4. Exchange real simulated UART/SPI/I²C/One-Wire traffic.
5. Inspect timestamped events and errors in the protocol viewer.
6. Change permitted external device conditions from the UI.
7. Read simulator-owned memory or sensor state through actual HDL transactions.
8. Reset a run without stale bus data or stale commands leaking into the next run.
9. Keep existing board-only behavior and performance unchanged.

This path preserves the project’s current architecture while letting the simulator become the trustworthy real-time protocol layer.

---

## 14. Further recommendation

The first version should be exactly this:

- shared manifest
- shared event schema
- per-run file transport
- UART terminal model in VHDL and equivalent Verilog
- visible example HDL files
- protocol viewer + device panel
- GHDL and Icarus parity tests

Once UART passes, implement SPI, then I²C, then One-Wire.

This keeps the work disciplined and ensures the architecture is correct before adding more buses.

---

## 15. Implementation priority

1. Manifest + validation
2. Event + command format
3. Simulator-to-backend transport
4. UART observer + UART terminal device
5. Frontend terminal panel
6. SPI observer + educational memory profile
7. I²C open-drain electrical model + EEPROMS or sensor
8. One-Wire temperature sensor
9. Full docs and acceptance tests

This is the lowest-risk order and it matches the educational utility of each bus.

---

## 16. Final recommendation

Yes: implement the buses internally as HDL models in the generated simulator testbench. That is the right design for HDLBoard.

The simulator must be the source of truth, and the browser should only render what the simulator has already validated. This keeps timing accurate, avoids fake transactions, and preserves the existing architecture that already separates HDL simulation from the UI.

The initial plan should therefore be staged around HDL-side bus models and shared event transport, with UART first and VPI/VHPI treated as optional future optimization rather than the first implementation path.
