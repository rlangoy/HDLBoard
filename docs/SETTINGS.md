# Start-up settings (`settings.json`)

`settings.json`, next to `index.html`, sets the defaults HDLBoard starts with. A teacher or host
edits it once; every student who has not changed the setting themselves gets that default. A choice
made in **Settings** is kept in that browser and wins over the file.

```json
{
  "bouncyButtons": true
}
```

| Setting | Default | What it does |
|---|---|---|
| `bouncyButtons` | `true` | Settings › Pushbuttons › **Offer bouncy pushbuttons**. On: the Pushbuttons panel's menu offers *No Bounce* and *Bouncy* contacts. Off: the choice is hidden and every press is one clean edge; a project saved as Bouncy keeps that choice and gets it back when the setting is on again. |

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
