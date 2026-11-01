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
skipped with a warning in the browser console; the rest of the file still applies. A missing or
unreadable file means the built-in defaults.

The file is read at every start (never cached), so an edit applies on the next reload.

## Where the file is

| Build | Path |
|---|---|
| Development (`npm run dev`) and GitHub Pages | `public/settings.json` in the repository (rebuild or redeploy) |
| Docker | `/usr/share/nginx/html/settings.json` in the `web` container, e.g. mounted with `- ./my-settings.json:/usr/share/nginx/html/settings.json:ro` |
| Windows app | `<install folder>\resources\frontend\settings.json` — a reinstall or an upgrade overwrites it, so keep a copy |

## Trying a default yourself

Your own choice in Settings overrides the file. To see the file's default again, clear the
`hdlboard.pushbuttons.bouncy` entry in the browser's site storage (DevTools › Application ›
Local storage), then reload.
