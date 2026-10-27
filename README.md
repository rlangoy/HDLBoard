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

## Board showcase screenshots

The three `assets/board-*.webp` images were captured in Chrome from the local
app at `http://localhost:5173/` on 2026-10-27. They show real Board settings
and Board I/O previews, with no simulated output added to the images.

- The two board images show the DE1-SoC and Basys 3
  previews in the two-column layout. Select each profile in Settings →
  Manage board and capture the Board I/O component area.
- `board-manager.webp` shows Create editable copy → Basys 3 Custom →
  Pushbuttons, with the default port names unchanged.
- Capture viewport: 1920 × 1000; images are element screenshots saved as
  WebP at quality 92. The manager capture is 1090 × 759; board captures
  are 744 pixels wide with their natural heights.
- Board names, component counts and configuration behavior were checked
  against `src/boards/builtinBoards.json`, `docs/BOARDS.md` and the local app
  in the sibling `de1soc_Simulator` checkout. Recheck these when replacing
  screenshots or updating the feature copy.
