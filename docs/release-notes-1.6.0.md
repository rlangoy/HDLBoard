### New
- **Boards**: choose the board your project targets (Default, DE1-SoC, DE10-Lite, Basys 3, Nexys A7) in Settings, in **New File** and in **New Project**. The board's port names, clock frequency, switches, LEDs, buttons and 7-segment displays show in the Board pane, and the testbenches and starter files follow them.
- **Update files**: changing board renames the ports in your files (Default, DE1-SoC and DE10-Lite only). The change dialog lists any hand edits still needed, and each change can be undone.
- **Board shapes**: boards with scalar segments, a single clock name or a different button layout (Basys 3, Nexys A7) run in the simulator. The Board pane fits itself to the pane, and the 7-segment and pushbutton cards share one width.
- **Board editor**: edit a board or build your own in **Board settings**, with an overview of the board, quick-edit cards and an advanced JSON view. Custom boards are stored in the project file.
- **Examples per board**: Basys 3, Nexys A7 and DE10-Lite have their own Examples. The Examples button shows for any board that has examples. The UART examples use the board's clock frequency.
- **Reorder signals**: drag signals in the waveform viewer into the order you want. The view is saved in the project file.
- **Settings**: the board is picked from a dropdown, and projects can be shared as GitHub gist links.
- **Verilog waveform**: Verilog state registers show by name, and the Verilog UART reads like the VHDL one. Parameters and localparams are left out of the signal list.

### Improved
- In the code editor, Tab indents and Shift+Tab outdents. Press Esc, then Tab, to leave the editor.
- **New File** offers VHDL or Verilog and a **Create project** checkbox. A new project gets one top file named after the board, for example `Nexys_A7.vhdl` or `Basys_3.v`.
- Every way of opening a project asks before it replaces unsaved work. **Close project** keeps unsaved state.
- The board settings footer and status line are hidden when there is nothing to save or report.
- Board settings quick-edit cards start collapsed.
- The Refresh board JSON dialog is reworked.
- The backend only accepts sessions from HDLBoard's own page. Stop works while a run is compiling, and only one compile runs at a time per session. A timed-out compile also stops its child tools.

### Fixed
- The board settings no longer flicker with a scrollbar.
- A `%` in a project URL no longer causes an error.
- The multiplexed 7-segment decoder holds a digit for 75 ms after it is switched off, so displays no longer flash.
- Undo keeps your files' original spelling, and saved views hold up after Undo.
- The Alpine installer picks a GHDL that the service account can actually run.

### Install
#### Windows:
Download HDLBoard-Setup-1.6.0.exe below and run it.
The installer is not code-signed, so Windows SmartScreen will warn that the publisher is unknown. Choose More info ? Run anyway.
Launch HDLBoard from the Start menu or the desktop shortcut.

#### VirtualBox - [virtualbox.org](https://www.virtualbox.org/wiki/Downloads)
Pre-built VirtualBox Appliance — HDLBoard.ova
Ready-to-run VirtualBox image for HDLBoard — a VHDL IDE with interactive board simulation.

Install:
Download HDLBoard.ova
Open VirtualBox ? File ? Import Appliance
Select the downloaded file ? Import
Click Start to boot the VM
In a web browser, go to http://127.0.0.1/
**Login:** username: root / password: student2026 (please change it)

#### Manual build

To run HDLBoard in a browser, or to build it yourself, see BUILDING.md

#### Known limitations
In the hosted app, files and edits are kept in memory only by default. Reloading resets the project to the starter files.
A design that divides the real 50 MHz clock down to a human-visible rate needs millions of simulated cycles per visible change and is impractical here. Use the optional CLOCK_500Hz port for a ready-divided clock. It is a simulator convenience, not a real board pin.
A waveform larger than 16 MiB is not recorded.
Update files renames ports only between Default, DE1-SoC and DE10-Lite. A change to or from Basys 3 or Nexys A7 renames nothing and lists the port names to use.
