# HDLBoard student demonstration

This separate Playwright recording uses the application UI and the real GHDL backend. It creates a fresh browser context and a temporary in-browser project; it does not alter the built-in examples or application source. The 1280 × 720 WebM contains no audio. A blue marker follows the automated mouse, because Playwright's video does not capture the operating-system pointer.

## Run on Windows

1. Install Node.js and GHDL, and install/build the repository frontend and backend as described in [Building HDLBoard](../docs/BUILDING.md). Verify `ghdl --version` in the terminal used to start the backend.
2. Start the frontend with `npm run dev -- --host 127.0.0.1` from the repository root. In a second terminal, run `npm start` from `server`. The backend must be the current build listening on port 9010. Alternatively use `scripts\start-windows.cmd`.
3. In a third PowerShell terminal, from the repository root:

   ```powershell
   npm ci --prefix demo
   cd demo
   npx playwright install chromium
   node record.mjs
   node export.mjs
   ```

The finished recording is `demo/output/hdlboard-demo.webm`; `demo/output/final-frame.png` shows the zoomed waveform just before it closes, and `baud-edit.png` shows the edited testbench. `node export.mjs` copies the WebM and produces an H.264 MP4 and a 20-second animated GIF preview in `assets` for the repository README. The browser starts with clean storage on every run. The script creates the project through the UI, then trims the setup and the first six seconds of the project-open sequence using Playwright's bundled FFmpeg. Existing servers and files are not reset. Set `$env:HDLBOARD_URL` before running if the frontend uses a different URL. To run without a visible browser, set `$env:DEMO_HEADLESS='1'`. For a quick validation only, also set `$env:DEMO_FAST='1'`; remove it for the presentation pacing. If a check fails, the script exits nonzero and saves `incomplete.webm`, `failure.png`, `failure.html`, and `failure.txt` in `output` for diagnosis. The successful video is replaced on the next successful run.

## Storyboard and suggested narration

1. **Switches drive LEDs.** “This is our new switchTest project for the Nexys A7. The LED output follows the switch input. Start the simulator and flip switches to see the matching LEDs light.” The setup that creates the project is performed before the video starts.
2. **Board layout.** “Choose a single column, group LEDs and switches in fours, and hide the upper eight of each to focus on the low bits.”
3. **Try the compact board.** “Run the same design again and flip the visible switches.”
4. **UART waveform.** “The UART testbench runs the transmitter and records its signals. Hide the testbench signals and select the clock, bit timer, state, transmit line and data in the design.”
5. **Report and real baud rate.** “The report view makes a figure for a lab report. Let's make more room for the testbench and change the baud rate to 115,200, a real UART rate.” The output panel is reduced to its minimum height and the RTL editor is narrowed. The value and comment are typed slowly.
6. **Zoom and finish.** “Run again and zoom in on the transition from idle to the start bit. The bit-timer pulse is one clock cycle wide; the state and transmit line change at its end.” Close the waveform and pause briefly.

The app automatically selects the UART testbench as top when opening the example. Its signal list uses individual checkboxes; the demo clears each testbench trace and leaves the TB section collapsed. Repeated visibility and testbench checkbox clicks are deliberately quicker than the other actions. The Nexys board labels LEDs `LD` on the board although the HDL port is `LED`. The simulator output has no collapse control; dragging its divider to the minimum is the supported way to make room.

## Recording and editing

No manual screen recording is required. Record narration separately and add it in a video editor; trim pauses or add titles/captions as desired. Convert WebM to MP4 in an editor if needed. The report figure is previewed but not saved; use its Save SVG or Save PNG button manually if a separate report asset is wanted. The demo uses the app's stock example, whose accelerated timing comment is updated along with the baud-rate change so it does not mislead students.
