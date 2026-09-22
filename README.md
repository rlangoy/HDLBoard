# HDLBoard — GitHub Pages site

This branch (`gh-pages`) holds **only the project's landing page**, kept
separate from the application source on `main`. It's plain HTML/CSS with no
build step, so GitHub Pages can serve it as-is.

- **Source code, app and docs:** see the [`main`](../../tree/main) branch.
- **Live site:** enable it once under *Settings → Pages → Deploy from a
  branch → `gh-pages` / `/ (root)`.

## Editing

- `index.html` — page content
- `styles.css` — all styling (light/dark, responsive)
- `assets/` — screenshot and favicon

The `.nojekyll` file disables Jekyll processing, since this is a plain
static site.

To update the page, edit these files on `gh-pages` and push — no build
step required. If the app's screenshot in `docs/images/workbench.png` on
`main` changes, copy the new one over `assets/workbench.png` here.
