// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type CSSProperties,
  type MutableRefObject,
} from 'react';
import { Board, cx, zeroBits, type BitVector } from '../board';
import { Leds } from '../Leds';
import { Pushbuttons } from '../Pushbuttons';
import { Switches } from '../Switches';
import {
  SevenSegmentDisplays,
  blankSegments,
  type SegmentVector,
} from '../SevenSegment';
import { Header } from './Header';
import { AboutDialog } from './AboutDialog';
import { SettingsDialog } from './SettingsDialog';
import { loadPreferredLanguages, savePreferredLanguages, type PreferredLanguages } from './languagePrefs';
import { HelpDialog } from './HelpDialog';
import { NewFileDialog } from './NewFileDialog';
import { RefusedFilesDialog } from './RefusedFilesDialog';
import { baseName, newFileContent, testbenchContent, type NewFileLanguage } from './newFile';
import { ABOUT_EVENT } from './project';
import { FileExplorer } from './FileExplorer';
import { ExamplesPane } from './ExamplesPane';
import { copyExample, type Example } from './examples';
import { SidePanel } from './SidePanel';
import { ActivityBar, ActivityBarRun, ActivityBarSeparator, ActivityBarShow } from './ActivityBar';
import { PanelToggleIcon } from './icons';
import { CodeEditor } from './CodeEditor';
import { EmptyProject } from './EmptyProject';
import { SimulationCard, type SimStatus } from './SimulationCard';
import { ConsoleOutput, type ConsoleLine } from './ConsoleOutput';
import { appendCapped } from './consoleLines';
import { UPLOAD_ACCEPT, folderAfterRename, folderForUpload, topAfterDelete } from './fileKinds';
import { fileNameRefusal, incomingFileRefusals, UNREADABLE_ZIP_REASON, type RefusedFile } from './fileNameRules';
import { filesInZip, isZipName } from './zipUpload';
import { STARTER_FILES, DEFAULT_SHOWN_FILE, TOP_LEVEL_ENTITY, type VhdlFile } from './files';
import { HdlClient, filesForRun, hdlBackendHttpUrl, hdlBackendUrl } from './hdlClient';
import { useDiagnostics } from './useDiagnostics';
import { countSeverities, type LineDiagnostic } from './diagnosticStore';
import { fileAfterDelete, fileRows } from './fileRows';
import type { FileMenuProps } from './FileMenu';
import { nextRevealId, type RevealRequest } from './useRevealLine';
import type { PaneRun } from './EditorPaneHeader';
import { routeRun, runTargetFor, withCurrentUnit, type PaneRole } from './editorView';
import { RunTestbenchDialog } from './RunTestbenchDialog';
import type { TestbenchChoice } from './splitModel';
import { EMPTY_OVERRIDES, type PaneTarget } from './tbDetect/types';
import { BLOCKED_REASON, paneRunFor } from './paneRun';
import { useTestbenchSplit } from './useTestbenchSplit';
import { revealTarget, type AdvisedDiagnostic } from './diagnosticAdvice';
import type { LocatedDiagnostic } from './diagnosticLocation';
import { downloadProjectZip, downloadSourceFile } from './download';
import { desktopBridge, gitHubTokenStore, parseWorkspace, serializeWorkspace } from './desktop';
import { ProjectPage } from './ProjectPage';
import { OpenProjectDialog } from './OpenProjectDialog';
import { ProjectFolderDialog } from './ProjectFolderDialog';
import { PATH_NEEDS_DESKTOP, folderOfPath, isFilePath, parseProjectLocation, pathInFolder } from './projectLocation';
import { canPickFolder, downloadEach, pickSaveFolder, projectSaveFiles, writeToFolder, type PickedFolder } from './projectSave';
import {
  MISSING_LOCAL_FILE,
  hasUnsavedChanges,
  availableFiles,
  filesInProject,
  isProjectUpload,
  newProject,
  startProject,
  withFileLeft,
  withFilesAdded,
  openProject,
  pickProjectUpload,
  projectEntries,
  projectFileText,
  withDetails,
  withEntriesLoaded,
  withEntryEdited,
  withEntryRemoved,
  withEntryRenamed,
  withEntryUnloaded,
  withSaved,
  type OpenedProject,
  type OpenProject,
  type ProjectSource,
  type ProjectSourceFile,
} from './projectFile';
import { fetchText } from '../../project/fetchText';
import { parseGistRef, resolveProjectUrl } from '../../project/gistUrl';
import { GITHUB_AUTH_PATH } from '../../github/config';
import type { GistLink, OpenedGistProject } from '../../github/projectGists';
import { GitHubDialog } from './GitHubDialog';
import { GitHubConflictDialog } from './GitHubConflictDialog';
import { ProjectGitHubCard } from './ProjectGitHubCard';
import { gistLinkFromUrl, gitHubSyncState, withGistLink } from './projectGitHub';
import { useGitHub } from './useGitHub';
import { useGitHubProjects } from './useGitHubProjects';
import { sameFileName } from '../../project/fileName';
import { filesDirectlyInFolder, projectFileInFolder } from './chosenFolder';
import { NO_PROJECT_FILE_MESSAGE } from '../../project/selectProjectFile';
import { PANE_IDS, PANE_SHORTCUT, usePaneLayout } from './usePaneLayout';
import './Workbench.css';

// The backend's WebSocket port (ghdl_implementation_plan.md § 5.8) —
// overridable at build time so a deployment can point at a different
// backend without editing source. The host is never hardcoded (§ 6.4):
// hdlBackendUrl() resolves it from whatever host the page was loaded
// from, so the LAN access this repo's own README documents for the Vite
// dev server works for the backend too, with no extra configuration.
// VITE_GHDL_WS_PORT is the setting's name from when GHDL was the only
// simulator, still honoured so an older build script keeps working.
// The default must match the backend's own (server/src/settings.ts).
const DEFAULT_WS_PORT = 9010;
const HDL_WS_PORT = Number(
  import.meta.env.VITE_HDL_WS_PORT ?? import.meta.env.VITE_GHDL_WS_PORT ?? DEFAULT_WS_PORT,
);

/** Whether `flag` was set; reading it clears it. */
function takeFlag(flag: MutableRefObject<boolean>): boolean {
  const wasSet = flag.current;
  flag.current = false;
  return wasSet;
}

function timestamp(): string {
  const d = new Date();
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

/**
 * The file a newly opened project runs: its first design that does not look like a
 * testbench, in project order (a project usually lists the design first), else its
 * first design file at all.
 */
function projectTopFile(files: readonly VhdlFile[]): VhdlFile | undefined {
  const designs = files.filter((f) => f.folder === 'vhdl' || f.folder === 'verilog');
  return designs.find((f) => !/(^tb_|_tb\.|_tb_|testbench)/i.test(f.name)) ?? designs[0];
}

/** An error's message, without Electron's "Error invoking remote method …: Error:" wrapping. */
function errorText(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err);
  return message.replace(/^Error invoking remote method '[^']*': (Error: )?/, '');
}

let nextFileSeq = 1;
const nextFileId = () => `file-${nextFileSeq++}`;

// How long typing has to pause before the desktop app stores the workspace.
/**
 * An `ERROR` frame of these stages is a failed compile: open the first error.
 * Runtime messages mark lines but never move the view (a failing assertion can
 * arrive every clock cycle).
 */
const REVEALING_STAGES: readonly string[] = ['analyze', 'elaborate'];

const AUTOSAVE_DELAY_MS = 600;

const NO_LINES: readonly LineDiagnostic[] = [];

/** A design run waiting on RunTestbenchDialog: what runs if the student picks "Run … anyway". */
interface RunChoice {
  readonly fileId: string;
  readonly runTarget: string | null;
  readonly unitName: string | null;
  readonly choices: readonly TestbenchChoice[];
}

// Named for what the board pane is — the design's inputs and outputs — not
// for one particular board.
const BOARD_PANE_TITLE = 'Board I/O';

/**
 * The workbench's main page: a file tree and tabbed editor on the left
 * driving a live DE1-SoC board mock and simulator console on the right, laid
 * out to match `DesignResources/WorkBench.png`.
 *
 * `LEDR`/`HEX` are driven by a real GHDL or Icarus Verilog simulation over WebSocket
 * (`hdlClient.ts`, ghdl_implementation_plan.md) — never by `SW`/`KEY`
 * directly (Design_Description.md § 5 convention 11). Every board panel
 * is the real, working component from `components/board`, `Switches`,
 * `Leds`, `Pushbuttons` and `SevenSegment`.
 */
export function Workbench() {
  const [files, setFiles] = useState<VhdlFile[]>(STARTER_FILES);
  // The file in the editor's focused pane (docs/cleanup_file_tabs.md): the Files
  // highlight, what Ctrl+S saves, and the file the split pairs from.
  const [activeFileId, setActiveFileId] = useState<string | null>(DEFAULT_SHOWN_FILE);

  // The design file (vhdl/ or verilog/) a run starts from as top-level (FileExplorer's blue dot),
  // independent of which file is shown (docs/cleanup_file_tabs.md F6) — starts on whichever starter
  // file TOP_LEVEL_ENTITY names, matching what SimulationCard already
  // showed as a static label before this was selectable.
  const [topFileId, setTopFileId] = useState<string | null>(
    () => STARTER_FILES.find((f) => f.name === TOP_LEVEL_ENTITY)?.id ?? null,
  );
  // The top file's unit a pane's Play chose (docs/impl_split_screen.md D20); null = the backend chooses, as always.
  const [topUnit, setTopUnit] = useState<string | null>(null);
  // Set once the split's state exists below; the workspace load may answer before or after.
  const restoreOverridesRef = useRef<(o: typeof EMPTY_OVERRIDES) => void>(() => undefined);

  // Desktop project storage (desktop.ts): only when the Electron preload
  // exposes it. Load once on mount, and hold auto-save back until that has
  // answered, so the starter files can never overwrite a stored workspace.
  const [hydrated, setHydrated] = useState(() => !desktopBridge()?.saveWorkspace);
  useEffect(() => {
    const bridge = desktopBridge();
    if (!bridge?.loadWorkspace) return;
    let cancelled = false;
    bridge
      .loadWorkspace()
      .then((json) => {
        if (cancelled) return;
        const ws = parseWorkspace(json);
        if (!ws) return;
        // Stored ids like `file-7` must not be handed out again by addFile.
        for (const f of ws.files) {
          const seq = /^file-(\d+)$/.exec(f.id);
          if (seq) nextFileSeq = Math.max(nextFileSeq, Number(seq[1]) + 1);
        }
        setFiles(ws.files);
        setActiveFileId(ws.activeFileId);
        setTopFileId(ws.topFileId);
        setTopUnit(ws.topUnit ?? null);
        restoreOverridesRef.current(ws.testbench ?? EMPTY_OVERRIDES);
        setProject(ws.project ?? null);
      })
      .catch((err: unknown) => console.error('Could not load the saved workspace:', err))
      .finally(() => {
        if (!cancelled) setHydrated(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // The one open dialog, if any. About can also be opened from outside
  // React — the desktop app's native Help > About menu item fires
  // ABOUT_EVENT on window — so it shows the same dialog as the header.
  const [dialog, setDialog] = useState<'about' | 'settings' | 'help' | 'newFile' | 'openProject' | 'github' | null>(null);
  // Files an upload, a drop or a rename refused, shown in RefusedFilesDialog until closed.
  const [refusal, setRefusal] = useState<{ title: string; refused: readonly RefusedFile[] } | null>(null);
  // What is shown over the editor (which stays mounted underneath): the Examples pane or the project page.
  const [overlay, setOverlay] = useState<'examples' | 'project' | null>(null);
  // The open project file (projectFile.ts): Files holds its files.
  const [project, setProject] = useState<OpenProject | null>(null);
  // What the project is busy with, e.g. downloading a file; shown on the project page.
  const [projectBusy, setProjectBusy] = useState<string | null>(null);
  // Files a project opened in a browser without: stored next to its project file, but not chosen with it.
  const [folderNeeded, setFolderNeeded] = useState<readonly string[] | null>(null);
  // Open Project: why the last try failed, shown in the dialog.
  const [openProjectError, setOpenProjectError] = useState<string | null>(null);
  // The folder Save project wrote to last (browser folder picker), so saving again asks no more.
  const saveFolderRef = useRef<PickedFolder | null>(null);
  // Settings › Languages: what the Examples pane opens with (languagePrefs.ts).
  const [preferredLanguages, setPreferredLanguages] = useState(loadPreferredLanguages);
  const handlePreferredLanguagesChange = (languages: PreferredLanguages) => {
    setPreferredLanguages(languages);
    savePreferredLanguages(languages);
  };
  useEffect(() => {
    const openAbout = () => setDialog('about');
    window.addEventListener(ABOUT_EVENT, openAbout);
    return () => window.removeEventListener(ABOUT_EVENT, openAbout);
  }, []);

  const [status, setStatus] = useState<SimStatus>('stopped');
  // The file the current (or last) run was started with as top — the tab
  // that carries the Stop icon while it runs.
  const [runFileId, setRunFileId] = useState<string | null>(null);
  // …and the unit it runs, so only the pane showing that unit shows Stop (B5).
  const [runUnitName, setRunUnitName] = useState<string | null>(null);
  // "Create testbench" for this design file: the New File dialog makes a testbench paired with it.
  const [newTestbenchFor, setNewTestbenchFor] = useState<string | null>(null);
  // A design run the board cannot drive, with the testbench units that could run it instead (§ 4.10).
  const [runChoice, setRunChoice] = useState<RunChoice | null>(null);
  const [logLines, setLogLines] = useState<ConsoleLine[]>([]);
  const logSeq = useRef(0);

  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const elapsedTimer = useRef<number | null>(null);

  const [sw, setSw] = useState<BitVector>(() => zeroBits(10));
  const [key, setKey] = useState<BitVector>(() => [1, 1, 1, 1]);
  // Mirrors of sw/key for the HdlClient's handlers to read (below): those
  // handlers are captured once, when the client is lazily constructed, so
  // reading `sw`/`key` directly there would see whatever they were at that
  // moment forever after — a stale closure. Refs are updated synchronously
  // in handleSwChange/handleKeyChange and always read current.
  const swRef = useRef(sw);
  const keyRef = useRef(key);

  // Board outputs are driven by the simulation backend, never by the
  // inputs. Whenever no simulation is running they stay at their blank
  // values (Design_Description.md § 5 convention 11).
  const [ledState, setLedState] = useState<BitVector>(() => zeroBits(10));
  const [hexState, setHexState] = useState<SegmentVector[]>(() =>
    Array.from({ length: 6 }, () => blankSegments()),
  );

  const uploadInputRef = useRef<HTMLInputElement>(null);

  // The pane geometry: side pane widths, which panes are shut, the console's
  // height, and the dividers and shortcuts that change them.
  const layout = usePaneLayout();
  const { collapsed, togglePane } = layout;

  // The board keeps one fixed 2x2 arrangement at one fixed internal size and
  // is scaled to whatever the pane currently gives it, so the parts never
  // reflow or get scrolled out of reach. `offsetWidth`/`offsetHeight` are
  // the untransformed layout size, and ResizeObserver likewise reports the
  // untransformed box, so measuring here can't feed back into the scale.
  const boardViewportRef = useRef<HTMLDivElement>(null);
  const boardScalerRef = useRef<HTMLDivElement>(null);
  const [boardScale, setBoardScale] = useState(1);

  useEffect(() => {
    const viewport = boardViewportRef.current;
    const scaler = boardScalerRef.current;
    if (!viewport || !scaler) return;

    const fit = () => {
      const naturalW = scaler.offsetWidth;
      const naturalH = scaler.offsetHeight;
      if (!naturalW || !naturalH) return;
      const { width, height } = viewport.getBoundingClientRect();
      if (!width || !height) return;
      setBoardScale(Math.min(width / naturalW, height / naturalH));
    };

    const observer = new ResizeObserver(fit);
    observer.observe(viewport);
    observer.observe(scaler);
    fit();
    return () => observer.disconnect();
  }, []);

  // The ongoing run is to end without its closing messages, because an example was
  // opened and the console now belongs to it (handleOpenExample).
  const quietEnd = useRef(false);

  const appendLog = useCallback((text: string, tone?: ConsoleLine['tone']) => {
    // Taken now, not in the updater: lines logged in one batch would otherwise share the last id.
    logSeq.current += 1;
    const id = logSeq.current;
    setLogLines((prev) => appendCapped(prev, { id, time: timestamp(), text, tone }));
  }, []);

  // GitHub (docs/GITHUB.md): the sign-in, through this page's backend; the token kept per tab, or by the Windows app.
  const [tokenStore] = useState(gitHubTokenStore);
  const gitHub = useGitHub(hdlBackendHttpUrl(HDL_WS_PORT, GITHUB_AUTH_PATH), tokenStore, desktopBridge() !== undefined);

  const stopElapsedTimer = () => {
    if (elapsedTimer.current !== null) {
      window.clearInterval(elapsedTimer.current);
      elapsedTimer.current = null;
    }
  };

  // Nothing is simulating: the honest board state, per Design_Description.md
  // § 5 convention 11. Used whenever a session isn't actively running —
  // before Start, and after Stop/error/disconnect — never only on mount.
  const blankBoard = useCallback(() => {
    setLedState(zeroBits(10));
    setHexState(Array.from({ length: 6 }, () => blankSegments()));
  }, []);

  // One HdlClient per Workbench instance, created lazily on first Start
  // rather than on mount, so opening the page never opens a socket the
  // student hasn't asked for yet. `onState` is the only path that ever
  // writes ledState/hexState to anything other than blank — see the
  // file-top comment and Design_Description.md § 5 convention 11.
  // Read by the HdlClient handlers (created once) and by Ctrl+S below.
  const filesRef = useRef(files);
  filesRef.current = files;

  // Error markers: the compiler's messages, located in the files that were sent.
  const diagnostics = useDiagnostics();
  const {
    record: recordDiagnostics,
    recordError: recordErrorDiagnostics,
    startRun: startDiagnosticsRun,
    dismissFile: dismissDiagnostics,
    show: showDiagnostic,
  } = diagnostics;
  const [reveal, setReveal] = useState<RevealRequest | null>(null);
  const revealLocation = useCallback((target: Pick<LocatedDiagnostic, 'fileId' | 'line'>) => {
    setOverlay(null);
    setActiveFileId(target.fileId);
    setReveal({ fileId: target.fileId, line: target.line, id: nextRevealId() });
  }, []);
  // A console link marks just its own message, as a run marks errors, and jumps to it.
  const openConsoleDiagnostic = useCallback(
    (diagnostic: LocatedDiagnostic) => {
      showDiagnostic(diagnostic);
      revealLocation(diagnostic);
    },
    [showDiagnostic, revealLocation],
  );
  const revealFirstError = useCallback(
    (advised: readonly AdvisedDiagnostic[]) => {
      const target = revealTarget(advised);
      if (target) revealLocation(target);
    },
    [revealLocation],
  );

  const clientRef = useRef<HdlClient | null>(null);
  const getClient = useCallback((): HdlClient => {
    if (!clientRef.current) {
      clientRef.current = new HdlClient(hdlBackendUrl(HDL_WS_PORT), {
        onReady: () => {
          // A quiet end asked for while it compiled: the server takes Stop only now.
          if (quietEnd.current) {
            clientRef.current?.stop();
            return;
          }
          setStatus('running');
          appendLog('Simulation running ...', 'success');
          elapsedTimer.current = window.setInterval(() => setElapsedSeconds((s) => s + 1), 1000);
          // A fresh session's testbench starts with SW/KEY at their own
          // declared defaults, not wherever the board's switches actually
          // sit — sync the current input state immediately so a design
          // that reacts combinationally shows the right thing before the
          // user touches anything.
          clientRef.current?.stim(swRef.current, keyRef.current);
        },
        onState: (ledr, hex) => {
          setLedState(ledr);
          setHexState(hex);
        },
        onLog: (text) => {
          appendLog(text);
          recordDiagnostics(text, filesRef.current);
        },
        onError: (stage, text) => {
          if (!takeFlag(quietEnd)) {
            appendLog(`${stage} error:\n${text}`, 'error');
            const advised = recordErrorDiagnostics(text, filesRef.current);
            if (REVEALING_STAGES.includes(stage)) revealFirstError(advised);
          }
          stopElapsedTimer();
          setStatus('stopped');
          blankBoard();
        },
        onDone: (reason) => {
          stopElapsedTimer();
          setStatus('stopped');
          // 'completed': a portless testbench (batch mode, no board
          // polling — server/src/session.ts) reached its own natural end
          // on its own, distinct from the user clicking Stop — the green
          // tone matches 'Simulation running ...' above, since this is
          // the design finishing correctly, not being interrupted.
          // A run ended for an opened example adds nothing: the console is the example's now.
          const completed = reason === 'completed';
          if (!takeFlag(quietEnd)) appendLog(completed ? 'Simulation complete.' : 'Simulation stopped.', completed ? 'success' : undefined);
          blankBoard();
        },
        onClosed: () => {
          stopElapsedTimer();
          setStatus('stopped');
          blankBoard();
        },
      });
    }
    return clientRef.current;
  }, [appendLog, blankBoard, recordDiagnostics, recordErrorDiagnostics, revealFirstError]);

  useEffect(
    () => () => {
      stopElapsedTimer();
      clientRef.current?.close();
    },
    [],
  );

  // Opening a file is a pair-change event: its testbench or design may join it (§ 4.3).
  const handleOpenFile = (id: string) => {
    setOverlay(null);
    tb.showFile(id, 'open');
  };

  // A pick in a pane header's file menu: as a click in Files, then the caret goes to its code.
  const handlePickFile = (id: string) => {
    handleOpenFile(id);
    window.setTimeout(() => document.querySelector<HTMLElement>('.wb-split__pane.is-focused textarea')?.focus());
  };

  const handleRenameFile = (id: string, name: string) => {
    const current = files.find((f) => f.id === id);
    if (current === undefined || current.name === name) return;
    const otherNames = files.filter((f) => f.id !== id).map((f) => f.name);
    const reason = fileNameRefusal(name, otherNames);
    if (reason !== undefined) {
      setRefusal({ title: 'File not renamed', refused: [{ name, reason }] });
      return;
    }
    setFiles((prev) => prev.map((f) => (f.id === id ? { ...f, name, folder: folderAfterRename(f.folder, name) } : f)));
    // The project keeps the file's description and URL under its new name.
    setProject((p) => p && withEntryRenamed(p, current.name, name));
  };

  const handleDeleteFile = (id: string) => {
    const deleted = files.find((f) => f.id === id);
    setFiles((prev) => prev.filter((f) => f.id !== id));
    // A deleted file leaves the project too.
    if (deleted) setProject((p) => p && withEntryRemoved(p, deleted.name));
    dismissDiagnostics(id);
    tb.onFileDeleted(id);
    // The shown file gone, its neighbour in the Files list is shown (D7); a file shown
    // only in the other pane is dropped when the pair is worked out again.
    if (id === activeFileId) setActiveFileId(fileAfterDelete(files, id));
    // A deleted top file can't stay top either — hand the role to
    // whatever file is first afterward in the same folder (so a Verilog
    // run stays a Verilog run), or to nothing if that was the last one
    // (handleStart already tolerates topFileId being null, same as it did
    // before any file was ever marked top).
    if (id === topFileId) {
      setTopFileId(topAfterDelete(files, id));
      setTopUnit(null);
    }
  };

  // A compiling or running simulation: its top file stays put until it stops.
  const isSimulating = status !== 'stopped';

  const makeTop = (id: string) => {
    setTopFileId(id);
    setTopUnit(null);
  };

  const handleSetTopFile = (id: string) => {
    if (!isSimulating) makeTop(id);
  };

  /** Ends an ongoing run without its closing messages: now if it runs, as soon as it is ready if it still compiles. */
  const endRunQuietly = () => {
    if (!isSimulating) return;
    quietEnd.current = true;
    if (status === 'running') getClient().stop();
  };

  const handleDownloadFile = (id: string) => {
    const file = files.find((f) => f.id === id);
    if (file) downloadSourceFile(file);
  };

  const fileNames = files.map((f) => f.name);

  // With a project open, its file goes in the .zip too, so uploading the .zip opens it again.
  const handleDownloadAll = () => {
    if (!project) {
      if (files.length > 0) downloadProjectZip(files);
      return;
    }
    downloadProjectZip(files, { name: project.fileName, text: projectFileText(project, fileNames) });
    setProject(withSaved(project, fileNames));
  };

  // Ctrl+S / Cmd+S saves the shown file to disk instead of the browser's
  // "Save page as…" (which would save the app's HTML, not the design).
  // Refs rather than deps so the listener is attached once, not on every
  // keystroke's re-render.
  const activeFileRef = useRef(activeFileId);
  activeFileRef.current = activeFileId;
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.altKey || e.shiftKey || e.key.toLowerCase() !== 's') return;
      e.preventDefault();
      const file = filesRef.current.find((f) => f.id === activeFileRef.current);
      if (file) downloadSourceFile(file);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const addFile = (name: string, content: string, folder: VhdlFile['folder'] = 'vhdl'): string => {
    const id = nextFileId();
    setFiles((prev) => [...prev, { id, name, folder, content }]);
    showNewFile(id);
    return id;
  };

  // A file just added to `files` is shown.
  const showNewFile = (id: string) => {
    setActiveFileId(id);
    setOverlay(null);
  };

  // An example is copied into the project (a file it already has by that name is
  // kept as it is, never overwritten) and its first file opens in the editor as the
  // Top File, so Start runs it. It starts from a clean slate: an ongoing simulation
  // ends and the console is cleared, keeping only what the copy did.
  const handleOpenExample = (example: Example) => {
    endRunQuietly();
    setLogLines([]);
    const { added, kept, openId } = copyExample(example, filesRef.current, nextFileId);
    for (const f of added) appendLog(`Copied ${f.name} from Examples into ${f.folder}/.`);
    for (const name of kept) appendLog(`${name} is already in your files - kept your copy, unchanged.`);
    setFiles((prev) => [...prev, ...added]);
    if (added.some((f) => f.id === openId)) showNewFile(openId);
    else handleOpenFile(openId);
    makeTop(openId);
  };

  // New File asks for a name and a language first (NewFileDialog); the file is
  // added once the dialog's Create is pressed.
  const handleNewFile = () => setDialog('newFile');

  const suggestedNewFileName = `untitled${files.filter((f) => f.name.startsWith('untitled')).length + 1}`;

  const handleCreateFile = (name: string, language: NewFileLanguage) => {
    setDialog(null);
    const design = newTestbenchFor === null ? undefined : files.find((f) => f.id === newTestbenchFor);
    setNewTestbenchFor(null);
    const dut = design && tb.fileAnalysis(design.id)?.units[0]?.name;
    const content = design ? testbenchContent(name, language, dut ?? baseName(design.name)) : newFileContent(name, language);
    // folderForUpload keeps the upload rules: .v to verilog/, VHDL to vhdl/.
    const id = addFile(name, content, folderForUpload(name) ?? 'vhdl');
    // Paired by override, so the new file opens in the TB pane beside its design (§ 4.6).
    if (design) tb.setPairOverride(design.id, id);
  };

  // "Create testbench" (§ 4.6): New File, named <stem>_tb (the tb_ prefix is reserved), in the design's language.
  const handleCreateTestbench = (designFileId: string) => {
    setNewTestbenchFor(designFileId);
    setDialog('newFile');
  };
  const testbenchDesign = newTestbenchFor === null ? undefined : files.find((f) => f.id === newTestbenchFor);

  const handleUploadClick = () => uploadInputRef.current?.click();

  // Shared by the hidden <input type="file"> (a real picker, filtered to
  // the source extensions by its own `accept`) and drag-and-drop onto the
  // Files panel (below) — a browser drop is not filtered by `accept` at
  // all, so this is the one place other files actually get rejected, with
  // a console line explaining why rather than silently reading garbage in.
  // A file whose name is taken or reserved, or that is no source file, is not added;
  // the dialog says which and why (fileNameRules.ts), and the console keeps a line each.
  // A .zip among them is opened first and stands for the files inside it (zipUpload.ts).
  const readAndAddFiles = async (incoming: Iterable<File>) => {
    const chosen: File[] = [];
    const unreadable: RefusedFile[] = [];
    for (const file of incoming) {
      if (!isZipName(file.name)) chosen.push(file);
      else {
        try {
          chosen.push(...(await filesInZip(file)));
        } catch {
          unreadable.push({ name: file.name, reason: UNREADABLE_ZIP_REASON });
        }
      }
    }
    // A project file among them opens the project, with the others as its folder.
    const projectUpload = pickProjectUpload(chosen);
    if (projectUpload) {
      await openProjectUpload(projectUpload, chosen.filter((file) => file !== projectUpload));
      for (const { name, reason } of unreadable) appendLog(`Skipped ${name}: ${reason}`, 'error');
      return;
    }
    const reasons = incomingFileRefusals(
      chosen.map((file) => file.name),
      filesRef.current.map((file) => file.name),
    );
    const refused: RefusedFile[] = [...unreadable];
    chosen.forEach((file, i) => {
      const reason = reasons[i];
      if (reason === undefined) readAndAddFile(file);
      else refused.push({ name: file.name, reason });
    });
    for (const { name, reason } of refused) appendLog(`Skipped ${name}: ${reason}`, 'error');
    if (refused.length > 0) setRefusal({ title: refused.length === 1 ? 'File not added' : 'Files not added', refused });
  };

  const readAndAddFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => addFile(file.name, String(reader.result ?? ''), folderForUpload(file.name) ?? 'vhdl');
    reader.readAsText(file);
  };

  /**
   * Opens a project file chosen or dropped with Upload File; the files chosen with it are
   * its folder. Whatever Files held before is closed: the project's files replace it.
   */
  const openProjectUpload = async (projectFile: File, others: readonly File[]) => {
    const localFiles: ProjectSourceFile[] = await Promise.all(
      others.filter((file) => !isProjectUpload(file.name)).map(async (file) => ({ name: file.name, content: await file.text() })),
    );
    for (const extra of others.filter((file) => isProjectUpload(file.name))) {
      appendLog(`Ignored ${extra.name}: only one project file is opened at a time (${projectFile.name}).`, 'error');
    }
    const error = await openProjectText({ text: await projectFile.text(), location: projectFile.name, localFiles });
    if (error !== null) setRefusal({ title: 'Project not opened', refused: [{ name: projectFile.name, reason: error }] });
  };

  /**
   * Opens a project file's text: its files replace what Files holds, and the project page
   * shows. `gist`: the GitHub gist it is stored in (projectGitHub.ts). Returns why it could
   * not be opened, or null.
   */
  const openProjectText = async (source: Omit<ProjectSource, 'fetch'>, gist?: GistLink): Promise<string | null> => {
    setProjectBusy(`Opening ${source.location}…`);
    let opened: OpenedProject;
    try {
      opened = await openProject(source);
    } catch (err) {
      const reason = errorText(err);
      appendLog(`Project not opened: ${source.location}: ${reason}`, 'error');
      return reason;
    } finally {
      setProjectBusy(null);
    }
    if (gist) opened = { ...opened, project: withGistLink(opened.project, gist, opened.files) };
    applyOpenedProject(opened, source.localFiles ?? []);
    return null;
  };

  /** A project read from its gist through the GitHub API (the GitHub dialog, Get the GitHub version). */
  const openGistProject = async ({ projectFileText: text, rawProjectUrl, files: gistFiles, link }: OpenedGistProject) => {
    const localFiles = gistFiles.filter((file) => file.name !== link.projectFileName);
    const error = await openProjectText({ text, location: rawProjectUrl, localFiles }, link);
    if (error === null) setDialog((shown) => (shown === 'github' ? null : shown));
    return error;
  };

  /**
   * Open Project and ?project=: a project file by its URL — absolute, a GitHub gist, or
   * relative to this page — or, in the Windows app, by its path. Returns why not, or null.
   */
  const openProjectFrom = async (input: string): Promise<string | null> => {
    const location = parseProjectLocation(input, window.location.href);
    if (typeof location === 'string') return location;
    if (location.kind === 'path') {
      const read = desktopBridge()?.readLocalFile;
      if (!read) return PATH_NEEDS_DESKTOP;
      let text: string;
      try {
        text = await read(location.path);
      } catch (err) {
        return `Could not read ${location.path}: ${errorText(err)}`;
      }
      const folder = folderOfPath(location.path);
      return openProjectText({ text, location: location.path, readLocal: (name) => read(pathInFolder(folder, name)) });
    }
    // Signed in, a gist is read through the GitHub API: current at once, and linked for Save to GitHub.
    const gist = parseGistRef(location.url);
    if (gist && gitHub.session) {
      const opened = await gitHub.session.projects.open(gist.gistId).catch(() => null);
      if (opened) return openGistProject(opened);
    }
    let text: string;
    let url: string;
    try {
      url = await resolveProjectUrl(location.url);
      text = await fetchText(url);
    } catch (err) {
      return errorText(err);
    }
    return openProjectText({ text, location: url }, gistLinkFromUrl(url));
  };

  const gitHubProjects = useGitHubProjects({
    github: gitHub,
    project,
    files,
    setProject,
    openGistProject,
    showSignIn: () => setDialog('github'),
    log: appendLog,
  });

  /**
   * Open Project › Choose project folder: the folder's own files (not its subfolders'),
   * its project file opened with the others as the files next to it (§ 6.4).
   */
  const handleProjectFolderOpened = async (chosen: File[]) => {
    const projectFile = projectFileInFolder(chosen);
    if (!projectFile) {
      setOpenProjectError(NO_PROJECT_FILE_MESSAGE);
      return;
    }
    setOpenProjectError(null);
    setDialog(null);
    await openProjectUpload(projectFile, filesDirectlyInFolder(chosen).filter((file) => file !== projectFile));
  };

  const handleOpenProjectFrom = async (input: string) => {
    setOpenProjectError(null);
    const error = await openProjectFrom(input);
    if (error === null) setDialog(null);
    else setOpenProjectError(error);
  };

  const applyOpenedProject = ({ project: opened, files: projectFiles }: OpenedProject, localFiles: readonly ProjectSourceFile[]) => {
    endRunQuietly();
    setLogLines([]);
    const closed = filesRef.current;
    for (const f of closed) dismissDiagnostics(f.id);
    const added: VhdlFile[] = projectFiles.map((f) => ({
      id: nextFileId(),
      name: f.name,
      folder: folderForUpload(f.name) ?? 'vhdl',
      content: f.content,
    }));
    setFiles(added);
    tb.restoreOverrides(EMPTY_OVERRIDES);
    saveFolderRef.current = null;
    const top = projectTopFile(added);
    setTopFileId(top?.id ?? null);
    setTopUnit(null);
    setActiveFileId(top?.id ?? added[0]?.id ?? null);
    setProject(opened);
    setOverlay('project');
    // A browser read only the files chosen with the project file: ask for its folder at once.
    const notChosen = opened.entries.filter((entry) => opened.unloaded[entry.name.toLowerCase()] === MISSING_LOCAL_FILE);
    setFolderNeeded(notChosen.length > 0 ? notChosen.map((entry) => entry.name) : null);

    appendLog(`Opened project ${opened.name} (${opened.fileName}): ${added.length} of ${opened.entries.length} files.`, 'success');
    if (closed.length > 0) appendLog(`Closed the ${closed.length} file(s) Files held before; the project's files replace them.`);
    for (const entry of opened.entries) {
      const why = opened.unloaded[entry.name.toLowerCase()];
      if (why) appendLog(`${entry.name} not loaded: ${why}`, 'error');
    }
    const listed = (name: string) => opened.entries.some((entry) => sameFileName(entry.name, name));
    for (const f of localFiles.filter((file) => !listed(file.name))) appendLog(`Ignored ${f.name}: the project does not list it.`);
  };

  // ?project=<url>: open a project published at a URL, e.g. a GitHub gist (spec § 6.1). Once, on the first load.
  useEffect(() => {
    const url = new URLSearchParams(window.location.search).get('project');
    if (!url) return;
    void openProjectFrom(url).then((error) => {
      if (error !== null) appendLog(`Project not opened: ${url}: ${error}`, 'error');
    });
  }, []);

  /** Project page: the files of the folder the student chose, for the entries that were not found. */
  const handleProjectFolderChosen = async (chosen: File[]) => {
    if (!project) return;
    const missing = projectEntries(project, filesRef.current.map((f) => f.name)).filter(
      (row) => row.status === 'unloaded' && row.problem === MISSING_LOCAL_FILE,
    );
    // The folder's own files first, then those in its subfolders.
    const depth = (file: File) => (file.webkitRelativePath || file.name).split('/').length;
    const sorted = [...chosen].sort((a, b) => depth(a) - depth(b));
    const found: VhdlFile[] = [];
    for (const row of missing) {
      const file = sorted.find((f) => sameFileName(f.name, row.name));
      if (!file) continue;
      found.push({ id: nextFileId(), name: row.name, folder: folderForUpload(row.name) ?? 'vhdl', content: await file.text() });
    }
    if (found.length === 0) {
      appendLog(`None of the missing files (${missing.map((row) => row.name).join(', ')}) are in that folder.`, 'error');
      return;
    }
    setFiles((prev) => [...prev, ...found]);
    setProject((p) => p && withEntriesLoaded(p, found.map((f) => f.name)));
    if (topFileId === null) {
      const top = projectTopFile(found);
      if (top) makeTop(top.id);
    }
    for (const f of found) appendLog(`Opened ${f.name} from the project folder.`, 'success');
  };

  /** Project page: download a file again from its URL, into Files. */
  const handleReloadFromUrl = async (name: string) => {
    const row = project && projectEntries(project, fileNames).find((r) => sameFileName(r.name, name));
    if (!row || row.url === '') return;
    setProjectBusy(`Downloading ${name}…`);
    let content: string;
    try {
      content = await fetchText(row.url);
    } catch (err) {
      const reason = (err as Error).message;
      appendLog(`${name}: ${reason}`, 'error');
      if (row.status === 'unloaded') setProject((p) => p && withEntryUnloaded(p, name, reason));
      return;
    } finally {
      setProjectBusy(null);
    }
    const existing = filesRef.current.find((f) => sameFileName(f.name, name));
    if (existing) {
      if (existing.content === content) {
        appendLog(`${name} is the same as at its URL.`);
        return;
      }
      if (!window.confirm(`Replace ${name} in Files with the version at its URL? Your changes to it are lost.`)) return;
      handleContentChange(existing.id, content);
      appendLog(`Downloaded ${name} again from its URL.`, 'success');
      return;
    }
    const folder = folderForUpload(name);
    if (!folder) return;
    setFiles((prev) => [...prev, { id: nextFileId(), name, folder, content }]);
    setProject((p) => p && withEntriesLoaded(p, [name]));
    appendLog(`Downloaded ${name} from its URL.`, 'success');
  };

  /**
   * Save project (projectSave.ts): the project file and every file, side by side — back
   * into the folder the Windows app opened it from, else into a folder the student picks
   * (asked once), else as one download per file.
   */
  const handleSaveProject = async () => {
    if (!project) return;
    const names = filesRef.current.map((f) => f.name);
    const toSave = projectSaveFiles(
      project.fileName,
      projectFileText(project, names),
      filesInProject(project, filesRef.current).map((f) => ({ name: f.name, text: f.content })),
    );
    const saved = (location: string, message: string) => {
      setProject((p) => p && withSaved({ ...p, location }, names));
      appendLog(message, 'success');
    };
    const write = desktopBridge()?.writeLocalFile;
    setProjectBusy('Saving the project…');
    try {
      if (write && isFilePath(project.location)) {
        const folder = folderOfPath(project.location);
        for (const file of toSave) await write(pathInFolder(folder, file.name), file.text);
        saved(pathInFolder(folder, project.fileName), `Saved ${project.fileName} and ${toSave.length - 1} file(s) in ${folder}.`);
      } else if (canPickFolder()) {
        const folder = saveFolderRef.current ?? (await pickSaveFolder());
        if (!folder) return;
        await writeToFolder(folder, toSave);
        saveFolderRef.current = folder;
        saved(`${folder.name}/${project.fileName}`, `Saved ${project.fileName} and ${toSave.length - 1} file(s) in the folder ${folder.name}.`);
      } else {
        downloadEach(toSave);
        saved(project.location, `Downloaded ${project.fileName} and ${toSave.length - 1} file(s); keep them in one folder.`);
      }
    } catch (err) {
      appendLog(`Project not saved: ${errorText(err)}`, 'error');
    } finally {
      setProjectBusy(null);
    }
  };

  // What Save project will do, for its tooltip.
  const saveHint = !project
    ? ''
    : desktopBridge()?.writeLocalFile && isFilePath(project.location)
      ? `Save the project file and all its files in ${folderOfPath(project.location)}`
      : canPickFolder()
        ? saveFolderRef.current
          ? `Save the project file and all its files in the folder ${saveFolderRef.current.name}`
          : 'Choose a folder, and save the project file and all its files in it'
        : 'Download the project file and each of its files';

  const handleCloseProject = () => {
    if (project) appendLog(`Closed project ${project.name}; Files keeps its files.`);
    setProject(null);
    setOverlay(null);
    saveFolderRef.current = null;
  };

  const handleOpenProjectFile = (name: string) => {
    const file = files.find((f) => sameFileName(f.name, name));
    if (file) handleOpenFile(file.id);
  };

  // New File > Project: a project listing every file now in Files, shown on the project page.
  const handleCreateProject = (name: string) => {
    setDialog(null);
    const created = newProject(name, fileNames);
    saveFolderRef.current = null;
    setProject(created);
    setOverlay('project');
    appendLog(`New project ${created.name} (${created.fileName}), listing ${fileNames.length} file(s). Save it from the project page.`, 'success');
  };

  // Create Project (Files panel): a new, empty project; the project page offers the files now in Files.
  const handleStartProject = () => {
    const started = startProject(fileNames);
    saveFolderRef.current = null;
    setProject(started);
    setOverlay('project');
    appendLog('New project: give it a name, and add the files that belong to it.', 'success');
  };

  const handleFilesChosen = (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) void readAndAddFiles([...e.target.files]);
    e.target.value = '';
  };

  const handleFilesDropped = (list: FileList) => void readAndAddFiles([...list]);

  const handleContentChange = (id: string, content: string) => {
    setFiles((prev) => prev.map((f) => (f.id === id ? { ...f, content } : f)));
    dismissDiagnostics(id);
  };

  // The next value is sent, never the `sw`/`key` state variable — React
  // state isn't updated synchronously, so sending the stale closure value
  // here would make the board always one flip behind (§ 8.3). The refs
  // are updated here too, synchronously, so onReady's stim() above always
  // sees the latest positions regardless of render timing.
  const handleSwChange = (next: BitVector) => {
    setSw(next);
    swRef.current = next;
    getClient().stim(next, key);
  };

  const handleKeyChange = (next: BitVector) => {
    setKey(next);
    keyRef.current = next;
    getClient().stim(sw, next);
  };

  // A new run starts with an empty console, so what it shows is this run's output only.
  // `runTarget`: the unit to elaborate when the backend must be told (`RUN <file> @<unit>`, D20).
  const startRun = (fileId: string | null, runTarget: string | null = null, unitName: string | null = null) => {
    quietEnd.current = false;
    setLogLines([]);
    stopElapsedTimer();
    setElapsedSeconds(0);
    setStatus('compiling');
    setRunFileId(fileId);
    setRunUnitName(unitName);
    blankBoard();
    const topFile = files.find((f) => f.id === fileId);
    // The same selection `run` sends, so the markers' line numbers match what the compiler saw.
    startDiagnosticsRun({ files: filesForRun(files, topFile?.name) });
    getClient().run(files, topFile?.name, runTarget);
  };

  /**
   * § 4.10's run check, for a design: one without board ports that a testbench
   * instantiates asks first (RunTestbenchDialog); anything else runs at once.
   */
  const checkAndRun = (fileId: string, runTarget: string | null, unitName: string | null, pane: PaneRole) => {
    const choices = pane === 'rtl' ? tb.testbenchesFor(fileId, unitName) : [];
    if (choices.length > 0) setRunChoice({ fileId, runTarget, unitName, choices });
    else runAsTop(fileId, runTarget, unitName);
  };

  /** The file becomes top — the blue dot and "Top: file › unit" — and runs. Only once a run really starts. */
  const runAsTop = (fileId: string, runTarget: string | null, unitName: string | null) => {
    setTopFileId(fileId);
    setTopUnit(runTarget);
    startRun(fileId, runTarget, unitName);
  };

  /**
   * Start and a tab's Play (B4, D24): the panes are arranged first, then the file's
   * testbench unit runs if it has one (the remembered unit while it exists), else
   * its design — naming the unit only when the file holds more than one (B7).
   */
  const runFile = (id: string) => {
    const route = routeRun(tb.fileAnalysis(id), id === topFileId ? topUnit : null);
    tb.showFile(id, 'run', { pane: route.pane, unitName: route.unitName });
    checkAndRun(id, route.runTarget, route.unitName, route.pane);
  };

  // The Start button runs the file named as "Top:" — show it (Files panel
  // highlight and pane header), so what runs is what shows.
  const handleStart = () => {
    if (topFileId === null) startRun(null);
    else runFile(topFileId);
  };

  /** Play in a pane header: exactly that pane's unit (§ 4.10). */
  const handleRunPane = (pane: PaneRole, target: PaneTarget) => {
    if (isSimulating) return;
    // Checked against the code as it reads now, so a unit renamed a moment ago runs by its new name.
    const file = tb.fileAnalysis(target.fileId);
    const current = withCurrentUnit(target, file, pane);
    tb.focusPane(pane);
    checkAndRun(target.fileId, runTargetFor(current, file, pane), current.unitName, pane);
  };

  /** A pane's Play / Stop (paneRun.ts): Stop only on the pane whose unit runs (B5), Play greyed out while another runs. */
  const paneRun = (pane: PaneRole, target: PaneTarget): PaneRun | null => {
    const file = files.find((f) => f.id === target.fileId);
    const kind = file && paneRunFor({ status, runFileId, runUnitName, target, folder: file.folder, pane });
    if (!kind) return null;
    if (kind === 'stop') return { running: true, disabled: status === 'compiling', onClick: handleStop };
    const blockedReason = kind === 'blocked' ? BLOCKED_REASON : undefined;
    return { running: false, disabled: false, blockedReason, onClick: () => handleRunPane(pane, target) };
  };

  const handleRunTestbenchChoice = (choice: TestbenchChoice) => {
    setRunChoice(null);
    tb.showFile(choice.fileId, 'run', { pane: 'tb', unitName: choice.unitName });
    runAsTop(choice.fileId, choice.unitName, choice.unitName);
  };

  const handleStop = () => {
    // Status/log transition happens on the backend's own DONE frame
    // (getClient()'s onDone), not optimistically here — the backend is
    // the single source of truth for whether a simulation is running.
    getClient().stop();
  };

  const handleClearConsole = () => setLogLines([]);

  // The testbench split (docs/impl_split_screen.md): pairing, view, panes, overrides.
  const tb = useTestbenchSplit({
    files,
    activeFileId,
    setActiveFileId,
    reveal,
    paneRun,
    onCreateTestbench: handleCreateTestbench,
  });
  restoreOverridesRef.current = tb.restoreOverrides;

  useEffect(() => {
    const save = desktopBridge()?.saveWorkspace;
    if (!hydrated || !save) return;
    const json = serializeWorkspace({ files, activeFileId, topFileId, topUnit, testbench: tb.overrides, project });
    const flush = () => {
      save(json).catch((err: unknown) => console.error('Could not save the workspace:', err));
    };
    const timer = window.setTimeout(() => {
      window.removeEventListener('pagehide', onHide);
      flush();
    }, AUTOSAVE_DELAY_MS);
    // A reload or close inside the debounce window still gets stored.
    const onHide = () => {
      window.clearTimeout(timer);
      flush();
    };
    window.addEventListener('pagehide', onHide);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('pagehide', onHide);
    };
  }, [hydrated, files, activeFileId, topFileId, topUnit, tb.overrides, project]);

  // The files as the Files panel draws them (docs/cleanup_file_tabs.md § 5.5).
  const rows = fileRows(files, {
    shownIds: tb.shownFileIds,
    topFileId,
    roleOf: tb.roleOf,
    problemsOf: (id) => countSeverities(diagnostics.byFile[id] ?? NO_LINES),
  });
  const fileMenu: FileMenuProps = { rows, onPick: handlePickFile, onNewFile: handleNewFile };

  const projectUnsaved = project !== null && hasUnsavedChanges(project, fileNames);
  const gitHubSync = project === null ? 'not-on-github' : gitHubSyncState(project, files);

  const topName = files.find((f) => f.id === topFileId)?.name ?? TOP_LEVEL_ENTITY;
  // "Top: alu.v › alu_tb" when a unit was chosen (§ 4.10).
  const topFileName = topUnit ? `${topName} › ${topUnit}` : topName;


  return (
    <div
      className="wb"
      ref={layout.wbRef}
      style={{ '--wb-console-h': `${layout.consoleHeight}px` } as CSSProperties}
    >
      <Header
        onSettings={() => setDialog('settings')}
        onHelp={() => setDialog('help')}
        onAbout={() => setDialog('about')}
        onGitHub={() => setDialog('github')}
        gitHubUser={gitHub.session?.user ?? null}
      />
      <SettingsDialog
        open={dialog === 'settings'}
        onClose={() => setDialog(null)}
        preferredLanguages={preferredLanguages}
        onPreferredLanguagesChange={handlePreferredLanguagesChange}
        splitPreference={tb.split.prefs.preference}
        onSplitPreferenceChange={tb.split.setPreference}
      />
      <HelpDialog open={dialog === 'help'} onClose={() => setDialog(null)} />
      <AboutDialog open={dialog === 'about'} onClose={() => setDialog(null)} />
      {refusal && (
        <RefusedFilesDialog title={refusal.title} refused={refusal.refused} onClose={() => setRefusal(null)} />
      )}
      {dialog === 'newFile' && (
        <NewFileDialog
          suggestedName={testbenchDesign ? `${baseName(testbenchDesign.name)}_tb` : suggestedNewFileName}
          initialLanguage={testbenchDesign?.folder === 'verilog' ? 'verilog' : 'vhdl'}
          subtitle={testbenchDesign ? `A testbench for ${testbenchDesign.name}` : undefined}
          kind={testbenchDesign ? 'testbench' : 'design'}
          existingNames={files.map((f) => f.name)}
          onCreate={handleCreateFile}
          onCreateProject={testbenchDesign ? undefined : handleCreateProject}
          projectFileCount={files.length}
          openProjectName={project?.name}
          onClose={() => {
            setDialog(null);
            setNewTestbenchFor(null);
          }}
        />
      )}
      {dialog === 'openProject' && (
        <OpenProjectDialog
          canOpenPaths={desktopBridge()?.readLocalFile !== undefined}
          busy={projectBusy !== null}
          error={openProjectError}
          onOpen={(location) => void handleOpenProjectFrom(location)}
          onFolderChosen={(chosen) => void handleProjectFolderOpened(chosen)}
          onClose={() => setDialog(null)}
        />
      )}
      {folderNeeded && project && (
        <ProjectFolderDialog
          projectName={project.name}
          missing={folderNeeded}
          onFolderChosen={(chosen) => {
            setFolderNeeded(null);
            void handleProjectFolderChosen(chosen);
          }}
          onClose={() => setFolderNeeded(null)}
        />
      )}
      {dialog === 'github' && (
        <GitHubDialog
          connection={gitHub}
          projects={gitHubProjects}
          openProject={project && { name: project.name, gistId: project.gist?.gistId, syncState: gitHubSync }}
          onClose={() => setDialog(null)}
        />
      )}
      {gitHubProjects.conflict && project && (
        <GitHubConflictDialog
          conflict={gitHubProjects.conflict}
          projectName={project.name}
          onReplaceGitHubVersion={gitHubProjects.replaceGitHubVersion}
          onGetGitHubVersion={gitHubProjects.getGitHubVersion}
          onCancel={gitHubProjects.dismissConflict}
        />
      )}
      {runChoice && (
        <RunTestbenchDialog
          designName={files.find((f) => f.id === runChoice.fileId)?.name ?? ''}
          choices={runChoice.choices}
          onRunTestbench={handleRunTestbenchChoice}
          onRunAnyway={() => {
            setRunChoice(null);
            runAsTop(runChoice.fileId, runChoice.runTarget, runChoice.unitName);
          }}
          onClose={() => setRunChoice(null)}
        />
      )}

      {/* The panes' row: a rail either side of them (docs/cleanup_file_tabs.md). */}
      <div className="wb-main">
        <ActivityBar
          id={PANE_IDS.sidebar.rail}
          side="left"
          label="Explorer and simulation"
          hidden={!collapsed.sidebar}
        >
          <ActivityBarShow
            id={PANE_IDS.sidebar.show}
            label="Explorer"
            controls={PANE_IDS.sidebar.pane}
            shortcut={PANE_SHORTCUT.sidebar}
            onShow={() => togglePane('sidebar')}
            icon={<PanelToggleIcon side="left" open aria-hidden="true" />}
          />
          <ActivityBarSeparator />
          <ActivityBarRun status={status} topFile={topFileName} onStart={handleStart} onStop={handleStop} />
        </ActivityBar>

        <div className="wb-body" ref={layout.bodyRef}>
          <SidePanel
            ids={PANE_IDS.sidebar}
            side="left"
            title="Explorer"
            width={layout.sidebarWidth}
            collapsed={collapsed.sidebar}
            onCollapse={() => togglePane('sidebar')}
            shortcut={PANE_SHORTCUT.sidebar}
            className="wb-sidebar"
            bodyClassName="wb-sidebar__content"
          >
            <SimulationCard
              status={status}
              elapsedSeconds={elapsedSeconds}
              topFile={topFileName}
              onStart={handleStart}
              onStop={handleStop}
            />
            <FileExplorer
              rows={rows}
              onSelect={handleOpenFile}
              onUpload={handleUploadClick}
              onNewFile={handleNewFile}
              onOpenProject={() => {
                setOpenProjectError(null);
                setDialog('openProject');
              }}
              onRename={handleRenameFile}
              onDelete={handleDeleteFile}
              onDownload={handleDownloadFile}
              onDownloadAll={handleDownloadAll}
              onToggleExamples={() => setOverlay((shown) => (shown === 'examples' ? null : 'examples'))}
              examplesOpen={overlay === 'examples'}
              onFilesDropped={handleFilesDropped}
              onSetTopFile={handleSetTopFile}
              topLocked={isSimulating}
              project={project ? { name: project.name, fileName: project.fileName, unsaved: projectUnsaved } : undefined}
              projectOpen={overlay === 'project'}
              onToggleProject={() => setOverlay((shown) => (shown === 'project' ? null : 'project'))}
              onCreateProject={handleStartProject}
            />
          </SidePanel>

          <div
            className={cx('wb-resizer', collapsed.sidebar && 'is-beside-collapsed')}
            role="separator"
            aria-orientation="vertical"
            aria-label="Resize Explorer"
            aria-controls={PANE_IDS.sidebar.pane}
            onPointerDown={layout.onSidebarDividerPointerDown}
          />

          <div className="wb-center">
            {/* Under the Examples pane or the project page the editor is inert: no caret, no typing into a hidden file. */}
            <div className="wb-center__editor" {...(overlay !== null ? { inert: '' } : {})}>
            <CodeEditor
              onChange={handleContentChange}
              onFilesDropped={handleFilesDropped}
              diagnostics={diagnostics.byFile}
              onDismissDiagnostics={dismissDiagnostics}
              split={tb.editorSplit(fileMenu)}
              emptyProject={
                files.length === 0 && (
                  <EmptyProject onExamples={() => setOverlay('examples')} onNewFile={handleNewFile} onUpload={handleUploadClick} />
                )
              }
            />
            </div>
            {overlay === 'project' && project && (
              <ProjectPage
                project={project}
                rows={projectEntries(project, fileNames)}
                unsaved={projectUnsaved}
                busy={projectBusy}
                onDetailsChange={(details) => setProject((p) => p && withDetails(p, details))}
                onEntryChange={(name, patch) => setProject((p) => p && withEntryEdited(p, name, patch))}
                onOpenFile={handleOpenProjectFile}
                onRemoveEntry={(name) => setProject((p) => p && withEntryRemoved(p, name))}
                onReloadFromUrl={(name) => void handleReloadFromUrl(name)}
                onFolderChosen={(chosen) => void handleProjectFolderChosen(chosen)}
                onSave={() => void handleSaveProject()}
                saveHint={saveHint}
                available={availableFiles(project, fileNames)}
                onAddFiles={(names) => setProject((p) => p && withFilesAdded(p, names))}
                onLeaveProject={(name) => setProject((p) => p && withFileLeft(p, name))}
                onCloseProject={handleCloseProject}
                onClose={() => setOverlay(null)}
                github={
                  <ProjectGitHubCard
                    link={project.gist}
                    syncState={gitHubSync}
                    userLogin={gitHub.session?.user.login ?? null}
                    projects={gitHubProjects}
                  />
                }
              />
            )}
            {overlay === 'examples' && (
            <ExamplesPane initialLanguages={preferredLanguages} onOpen={handleOpenExample} onClose={() => setOverlay(null)} />
          )}
          </div>

          <div
            className={cx('wb-resizer', collapsed.board && 'is-beside-collapsed')}
            role="separator"
            aria-orientation="vertical"
            aria-label="Resize board panel"
            aria-controls={PANE_IDS.board.pane}
            onPointerDown={layout.onBoardDividerPointerDown}
          />

          <SidePanel
            ids={PANE_IDS.board}
            side="right"
            title={BOARD_PANE_TITLE}
            width={layout.boardWidth}
            collapsed={collapsed.board}
            onCollapse={() => togglePane('board')}
            shortcut={PANE_SHORTCUT.board}
            className="wb-right"
            bodyClassName="wb-right__content"
          >
            <div className="wb-board-fit" ref={boardViewportRef}>
              <div
                className="wb-board-fit__inner"
                ref={boardScalerRef}
                style={{ transform: `scale(${boardScale})` }}
              >
                <Board size={24}>
                  <Leds value={ledState} />
                  <SevenSegmentDisplays value={hexState} />
                  <Switches value={sw} onChange={handleSwChange} />
                  <Pushbuttons value={key} onChange={handleKeyChange} showHint={false} />
                </Board>
              </div>
            </div>
          </SidePanel>
        </div>

        <ActivityBar id={PANE_IDS.board.rail} side="right" label={BOARD_PANE_TITLE} hidden={!collapsed.board}>
          <ActivityBarShow
            id={PANE_IDS.board.show}
            label={BOARD_PANE_TITLE}
            controls={PANE_IDS.board.pane}
            shortcut={PANE_SHORTCUT.board}
            onShow={() => togglePane('board')}
            icon={<PanelToggleIcon side="right" open aria-hidden="true" />}
          />
        </ActivityBar>
      </div>

      <div
        className="wb-resizer wb-resizer--row"
        role="separator"
        aria-orientation="horizontal"
        aria-label="Resize console"
        onPointerDown={layout.onConsoleDividerPointerDown}
      />

      <ConsoleOutput
        lines={logLines}
        onClear={handleClearConsole}
        locate={(line) => diagnostics.locateText(line, filesRef.current)}
        onOpenLocation={openConsoleDiagnostic}
      />

      {/* Outside the Explorer, so Upload still opens it while that pane is shut. */}
      <input
        ref={uploadInputRef}
        type="file"
        accept={UPLOAD_ACCEPT}
        multiple
        className="wb-files__hidden-input"
        onChange={handleFilesChosen}
      />
    </div>
  );
}

export default Workbench;
