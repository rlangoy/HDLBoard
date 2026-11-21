# Start-up settings (`settings.json`)

`settings.json`, next to `index.html`, sets the defaults HDLBoard starts with. A teacher or host
edits it once; every student who has not changed the setting themselves gets that default. A choice
made in **Settings** is kept in that browser and wins over the file.

```json
{
  "bouncyButtons": true,
  "designCheck": "synthesis",
  "synthesisToolCheck": false,
  "topFileHint": true
}
```

| Setting | Default | What it does |
|---|---|---|
| `bouncyButtons` | `true` | Settings › Board & I/O › Pushbuttons › **Offer bouncy pushbuttons**. On: the Pushbuttons panel's menu offers *No Bounce* and *Bouncy* contacts. Off: the choice is hidden and every press is one clean edge; a project saved as Bouncy keeps that choice and gets it back when the setting is on again. |
| `designCheck` | `"synthesis"` | Settings › Simulation › **Design check** (docs/impl_sim_only_warnings.md). `"synthesis"`: designs are checked for FPGA synthesis; a line that only works in simulation (`wait for`, `#10`, file I/O, …) gets a warning, and the file is labelled `SIM-only` instead of `RTL`. `"simulation"` (*Simulation only*): no warnings and no `SIM-only` label, for models and exercises that never go to an FPGA. Testbenches are never checked. |
| `synthesisToolCheck` | `false` | Settings › Simulation › Design check › Synthesis › **Quick check + GHDL check (VHDL)** (docs/impl_sim_only_warnings.md § 7). `false` (*Quick check*): only HDLBoard's own live check. `true`: Start also runs `ghdl --synth` on a VHDL run's hardware top, beside the simulation, which never waits for it. Its findings can mark a design `SIM-only`. Verilog gets the quick check only. Each Start runs one more short process on the server (`HDL_SYNTH_TIMEOUT_MS`, `HDL_SYNTH_MAX_CONCURRENT`, docs/HOSTING.md). Means nothing under `"designCheck": "simulation"`. |
| `topFileHint` | `true` | Settings › General › Top-File › **Suggest the Top-File**. On: **Start** asks *Make lab2.vhd the Top-File?* before it runs something else than what is on screen, and that pane's header shows a *Make Top-File* chip. While a testbench is on screen (alone or beside its design), the testbench is offered, unless Start runs it already. Otherwise the design on screen is offered when it uses the board's I/O (a port the active board has, such as `SW` or `LEDR`) and no other design, nor the current Top-File's hierarchy, instantiates it: a sub-entity, or the design a testbench Top-File tests, is never suggested. A Verilog file with conditional compilation (`` `ifdef ``, `` `ifndef ``, `` `elsif ``) is not suggested, and while any compiled Verilog file uses it, no board design is: a macro from an included header or the project's compiler options (`-D`) can change which modules and instances the simulator compiles, and HDLBoard does not guess. *Start lab1.vhd* or the chip's × leaves that unit alone until the Top-File changes. The question's **Don't ask me again** turns this setting off. Off: Start runs the Top-File without asking, as before. |

`$comment` and `$schema` are allowed and ignored. Anything else, or a value of the wrong type, is
skipped with a warning in the browser console; the rest of the file still applies. A missing file
(or a host that answers with its own `index.html` instead) means the built-in defaults, quietly; an
empty, unreadable or invalid file means the built-in defaults with a warning.

The file is read at every start (never cached), so an edit applies on the next reload. Until it has
been read, bouncy pushbuttons are off, so a course that switched them off never gets a bouncing
press at start-up.

A student's own choice is kept in that browser's site storage, like the dialog's other preferences
(languages, layout, waveforms), and other open HDLBoard tabs follow it. In the Windows app that is
the app's own browser storage, not the `settings.json` in its user-data folder, which only holds
*Keep my project between sessions*.

## Where the file is

| Build | Path |
|---|---|
| Development (`npm run dev`) and GitHub Pages | `public/settings.json` in the repository (rebuild or redeploy) |
| Docker and Render | Written by `docker/Dockerfile` with `bouncyButtons: false`; set `HDLBOARD_BOUNCY_BUTTONS=true` in `.env` (compose) or as a build argument to change it. At run time it is `/usr/share/nginx/html/settings.json`, which a mount such as `- ./my-settings.json:/usr/share/nginx/html/settings.json:ro` replaces |
| Windows app | `<install folder>\resources\frontend\settings.json` — a reinstall or an upgrade overwrites it, so keep a copy |

## Trying a default yourself

Your own choice in Settings overrides the file. To see the file's default again, clear the
`hdlboard.pushbuttons.bouncy` entry in the browser's site storage (DevTools › Application ›
Local storage), then reload.
