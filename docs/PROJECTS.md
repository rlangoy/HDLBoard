# Projects: open, edit and save

A **project** is one `.hdlboard.json` file that names the project, the board it targets and the files that belong to it, each with a short description. Opening the project file opens all of its files at once, so a teacher can hand out a whole exercise as one file or one link.

The file format is described in [`Impl_project_file_and_online_storage.md`](Impl_project_file_and_online_storage.md) (§ 4). A small example:

```json
{
  "version": 1,
  "name": "4-bit Counter",
  "board": "DE1-SoC",
  "description": "Introductory exercise: a 4-bit counter driven by KEY0, shown on LEDR[3:0].",
  "files": [
    { "name": "counter.vhd",    "url": "", "description": "Design: 4-bit counter" },
    { "name": "counter_tb.vhd", "url": "", "description": "Testbench for the counter" },
    { "name": "debounce.vhd",   "url": "https://example.com/shared/debounce.vhd", "description": "Shared debounce module" }
  ]
}
```

- A file with an **empty `url`** is stored in the same folder as the project file.
- A file with a **`url`** is downloaded from that address (`http://` or `https://`; a GitHub gist page works too).

Opening a project **replaces the files in Files** with the project's files.

---

## Open a project

There are four ways. All of them work in the browser version and in the Windows app, except opening by a file path, which only the Windows app can do.

### 1. Open Project: a URL or a path

Click **Open Project** (the link icon in the Files panel, next to **+**) and enter where the project file is:

| What you enter | Example | Browser | Windows app |
|---|---|---|---|
| A GitHub gist | `https://gist.github.com/<user>/<id>` | ✓ | ✓ |
| Any web address | `https://example.com/lab1/lab1.hdlboard.json` | ✓ | ✓ |
| A project on the HDLBoard site itself | `projects/adder-and-counter/adder-and-counter.hdlboard.json` | ✓ | ✓ |
| A file on this computer | `C:\Labs\lab1\lab1.hdlboard.json` (or `file:///C:/Labs/...`) | – | ✓ |

The files listed without a URL are read from the folder the project file is in: next to it on the web server, in the gist, or in the folder on disk.

HDLBoard ships with one example project, `projects/adder-and-counter/adder-and-counter.hdlboard.json`; click it in the dialog to fill it in.

**Web addresses must allow cross-origin requests (CORS)** when HDLBoard runs in a browser. GitHub gists, raw GitHub files and most static hosts do. A project on the HDLBoard site itself always works, because it is the same site.

### 2. A link that opens the project: `?project=`

Add `?project=` and the address to HDLBoard's own address, and the project opens when the page loads:

```text
https://hdlboard.onrender.com/?project=https://gist.github.com/<user>/<id>
http://my-server:5173/?project=projects/lab1/lab1.hdlboard.json
```

This is the easiest way to hand out an exercise: put the link on the course page.

### 3. Upload File: from this computer, in a browser

A browser cannot read a folder by its path, so select the files instead. Click **Upload File** and select the project file **together with its files** (Ctrl+A in the project folder selects them all). A `.zip` that **Download All** saved works too: it holds the project file and all its files.

If a file is missing, the project page says which, and **Choose project folder…** reads it from the folder.

### 4. Drag and drop

Drop the project file with its files (or the `.zip`) onto the Files panel or the editor.

---

## Make a project

With no project open, Files shows **Create Project**. Click it: the project page opens with an empty project. Type its name (the project file is named after it), and under **Files you can add** click **Add to project** for each file that belongs to it, or **Add all**. Files you make or upload afterwards join the project at once. The **−** button on a file in Project Files takes it out of the project again; the file stays in Files.

**+** (New File) → **Project** still works too: it makes a project with every file now in Files.

Files you rename or delete keep their description, or leave the project.

## Edit a project

The **project page** shows in place of the code. Open it from the project row at the top of the Files panel; close it with ✕ or Esc. Here you edit:

- the project's name, board and description, and the project file's own name;
- each file's description, and its URL (leave it empty for "stored next to the project file").

Click a file name to show it in the editor. **Unsaved changes** shows until the project is saved.

## Save a project

**Save project** writes the project file **and all its files** (only the project's, not other files in Files) into one folder, so that folder opens again as the same project:

| How the project was opened | Where Save project writes |
|---|---|
| Windows app, by a file path | Back into that folder, without asking |
| Chrome, Edge, or the Windows app otherwise | Asks for a folder the first time, then saves there again without asking |
| Other browsers (Firefox, Safari) | Downloads the project file and each file; keep them in one folder |

Files that have a URL are saved as local copies too; the project file keeps their URL.

**Download All** in the Files panel saves the same files as one `.zip`.

---

## Save projects on GitHub

Sign in with **GitHub** (top right), and the project page's **Save to GitHub** keeps the project in a secret gist on your own account; the GitHub dialog lists your projects and opens them on any computer. See [GITHUB.md](GITHUB.md).

---

## Publish projects

### On a GitHub gist

1. Create a gist with the project file and its files (all in the same gist, `url` left empty), or with the project file only and the `url` of each file filled in.
2. Share the gist's address, or a `?project=` link to it.

Only the project file's *name* is looked up with the GitHub API; when that fails (60 requests per hour without sign-in), the project still opens.

### On your own HDLBoard server

Everything in the built page's folder is served next to HDLBoard, so a project put there opens as `projects/<name>/<name>.hdlboard.json`, both from Open Project and with `?project=`.

- **Before building**: put the project folder in `public/projects/` in this repository. `npm run build` copies it into `dist/projects/`, and from there into the Docker image and the Windows installer. The example project lives there: `public/projects/adder-and-counter/`.
- **On a running server**: copy the project folder into the served folder — `dist/projects/` for the Node.js backend and nginx setups in [HOSTING.md](HOSTING.md), or `/usr/share/nginx/html/projects/` inside the Docker `web` container (for example as a mounted volume).

### On any other web server

Any static web server works if it sends `Access-Control-Allow-Origin: *` for the project files, so that HDLBoard on another site may read them.
