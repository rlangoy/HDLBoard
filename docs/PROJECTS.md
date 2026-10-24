# Projects: open, edit and save

A **project** is one `.hdlboard.json` file that names the project, the board it targets and the files that belong to it, each with a short description. Opening the project file opens all of its files at once, so a teacher can hand out a whole exercise as one file or one link.

The file format is described in [`Impl_project_file_and_online_storage.md`](Impl_project_file_and_online_storage.md) (§ 4). A small example:

```json
{
  "version": 2,
  "name": "4-bit Counter",
  "board": "de1-soc",
  "description": "Introductory exercise: a 4-bit counter driven by KEY0, shown on LEDR[3:0].",
  "projectDirectory": "counter",
  "sourceDirectory": "src",
  "files": [
    { "name": "counter.vhd",    "url": "", "description": "Design: 4-bit counter" },
    { "name": "counter_tb.vhd", "url": "", "description": "Testbench for the counter" },
    { "name": "debounce.vhd",   "url": "https://example.com/shared/debounce.vhd", "description": "Shared debounce module" }
  ]
}
```

- **`board`** is the id of the board whose port names the files use (`default`, `de1-soc`, or one from [`boards/boards.json`](BOARDS.md)). Opening the project makes it the board. A board that is not installed is kept as it is; the project then runs with the Default names until another board is chosen.
- **Version 2** stores the board id. A version-1 file (HDLBoard 1.5 and earlier) opens on the **Default** board, whatever its `board` says, because every one of them was written with the Default names; saving it writes version 2. HDLBoard 1.5 and earlier cannot open a version-2 file.
- A file with an **empty `url`** is stored with the project (below).
- A file with a **`url`** is downloaded from that address (`http://` or `https://`; a GitHub gist page works too).

### Where the files are on this computer

On your computer each project keeps its files in its own folder next to the project file: the **project folder**, named after the project file, and inside it the **source folder**, `src`. Several projects can then share one folder, even with files of the same name:

```text
Labs/
├── fantasicleds.hdlboard.json
├── fantasicleds/src/
│   ├── DE1_SoC.vhdl
│   └── led_controller.vhdl
├── not_so_fantasicleds.hdlboard.json
└── not_so_fantasicleds/src/
    ├── DE1_SoC.vhdl
    └── led_controller.vhdl
```

- An **older project** with its files next to the project file still opens. **Save project** copies its files into the source folder; the old files stay where they are.
- Rename the project file and the files **move** to the new project folder when you save. A folder left empty stays; the project page offers **Remove folder**.
- If a file of the same name is already where Save project would write, it asks before overwriting (**Cancel** saves nothing).
- **GitHub gists, web addresses and `?project=` links stay flat**: all files side by side, as before. They keep the two folder names in the project file, so a project saved to your computer from GitHub lands in its folders.

Details: [`impl_project_structure.md`](impl_project_structure.md).

Opening a project **replaces the files in Files** with the project's files.

---

## Open a project

There are five ways. All of them work in the browser version and in the Windows app, except opening by a file path, which only the Windows app can do.

### 0. Open Project: the Projects page

Click **Open Project** (the folder icon in the Files panel) or, signed in, **GitHub** at the top right. The **Projects page** lists the projects in your **projects folder** (and the folders directly inside it) and your projects on GitHub in one list: search them (names, descriptions, file names and file descriptions), filter by VHDL or Verilog, sort them, and switch between the compact list, small icons and details. Click **Open**. In the Windows app the projects folder is `Documents\HDLBoard Projects` until you click **Change…**; Chrome and Edge remember the folder you choose (and ask to allow access again in a later session), and the folder you save a project into becomes the projects folder, already allowed, unless the projects folder you have can be read and already holds it; other browsers use the folder for that visit only. **Save project** writes an opened project back into its own folder. See [project_browse_page.md](project_browse_page.md).

### 1. Open from a URL or a path

Click **Open from a URL or path…** at the bottom of the Projects page and enter where the project file is:

| What you enter | Example | Browser | Windows app |
|---|---|---|---|
| A GitHub gist | `https://gist.github.com/<user>/<id>` | ✓ | ✓ |
| Any web address | `https://example.com/lab1/lab1.hdlboard.json` | ✓ | ✓ |
| A project on the HDLBoard site itself | `projects/adder-and-counter/adder-and-counter.hdlboard.json` | ✓ | ✓ |
| A file on this computer | `C:\Labs\lab1\lab1.hdlboard.json` (or `file:///C:/Labs/...`) | – | ✓ |

The files listed without a URL are read from beside the project file: next to it on the web server or in the gist, and in its project and source folder on disk (or next to it, for an older project).

HDLBoard ships with one example project, `projects/adder-and-counter/adder-and-counter.hdlboard.json`; click it in the dialog to fill it in.

**Web addresses must allow cross-origin requests (CORS)** when HDLBoard runs in a browser. GitHub gists, raw GitHub files and most static hosts do. A project on the HDLBoard site itself always works, because it is the same site.

### 2. A link that opens the project: `?project=`

Add `?project=` and the address to HDLBoard's own address, and the project opens when the page loads:

```text
https://hdlboard.onrender.com/?project=https://gist.github.com/<user>/<id>
http://my-server:5173/?project=projects/lab1/lab1.hdlboard.json
```

This is the easiest way to hand out an exercise: put the link on the course page.

### 3. Choose project folder: from this computer

In **Upload File**, click **Open project folder…** and pick the folder that holds the `.hdlboard.json` file (or several). The folder becomes your projects folder and the Projects page lists every project in it and in the folders directly inside it; a folder with just one project opens it at once. In Chrome and Edge the folder is remembered, with access to save into it, so Open Project lists it again without asking (until a new browser session). This works in every browser and in the Windows app. (A browser cannot read the files next to one chosen file, so choosing only the project file leaves its files "Not found"; choosing the folder avoids that.)

### Upload File: from this computer, in a browser

If you choose only the project file, HDLBoard asks for its folder at once, because a browser can read only the files you choose. In Chrome and Edge the folder picker opens in the project file's folder, so you just click **Select Folder**. Select the project file together with its files (Ctrl+A) and no question is asked.

A browser cannot read a folder by its path, so select the files instead. Click **Upload File** and select the project file **together with its files** (Ctrl+A in the project folder selects them all). A `.zip` that **Download All** saved works too: it holds the project file and all its files in their folders.

If a file is missing, the project page says which, and **Choose project folder…** reads it from the folder.

**In the Windows app** none of this is needed: choosing or dropping only the project file is enough. The app knows where the file is on disk, reads the project's files from that folder without asking, and **Save project** writes back there. (A project file taken out of a `.zip` has no folder, so it is opened as in a browser.)

### 4. Drag and drop

Drop the project file with its files (or the `.zip`) onto the Files panel or the editor.

---

## Make a project

There is always a project. When no other is open, the files in Files are the **Default** project (with no description; **Download All** writes "Not set yet" in the project file while the description is empty): the start-up files, examples you open, and files you drop or make all join it, and **Save project** stores it as `default.hdlboard.json` with its files in `default/src/`, like any project. Rename it and describe it on the project page to make it your own. **Close project** goes back to the Default project, with the files Files holds.

To start a new, empty project, click **New project** on the Projects page. Type its name (the project file is named after it), and under **Files you can add** click **Add to project** for each file that belongs to it, or **Add all**. Files you make or upload afterwards join the project at once. The **−** button on a file in Project Files takes it out of the project again; the file stays in Files.

**+** (New File) → **Project** still works too: it makes a project with every file now in Files.

Files you rename or delete keep their description, or leave the project.

## Edit a project

The **project page** shows in place of the code. Open it from the project row at the top of the Files panel; close it with ✕ or Esc. A project opened from this computer (Upload File, drag and drop, Choose project folder, or a path in the Windows app) goes straight to the code and shows the first file of its list; the page opens by itself only when the project lists no files. Here you edit:

- the project's name, board and description, and the project file's own name;
- each file's description.

The page also shows the **project folder** the files are kept in on this computer; it always follows the project file name. A file's URL and the source folder are kept in the project file, but are not edited on the page.

Click a file name to show it in the editor. **Unsaved changes** shows until the project is saved.

## Save a project

**Save project** writes the project file **and all its files** (only the project's, not other files in Files): the project file into a folder, its files into `<project folder>/<source folder>/` beside it, so that folder opens again as the same project:

| How the project was opened | Where Save project writes |
|---|---|
| Windows app, by a file path, or a project file chosen or dropped from disk | Back into that folder, without asking |
| Chrome, Edge, or the Windows app otherwise | Asks for a folder the first time, then saves there again without asking |
| Other browsers (Firefox, Safari) | Downloads the project as one `.zip`, laid out the same way; unpack it to keep it |

Files that have a URL are saved as local copies too; the project file keeps their URL.

**Download All** in the Files panel saves the same as one `.zip`, in every browser and the Windows app: the project file at the top, its files in their folders.

---

## Save projects on GitHub

Sign in with **GitHub** (top right), and the project page's **Save to GitHub** keeps the project in a secret gist on your own account; the Projects page lists your projects and opens them on any computer. See [GITHUB.md](GITHUB.md).

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
