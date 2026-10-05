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
import { HdlClient, filesForRun, hdlBackendUrl } from './hdlClient';
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
import { desktopBridge, parseWorkspace, serializeWorkspace } from './desktop';
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
// Built with it set but empty (Docker, Render), Number('') is 0 and the page
// connects to its own origin, where a reverse proxy forwards /hdlsim.
const DEFAULT_WS_PORT = 9010;
const HDL_WS_PORT =
  Number(import.meta.env.VITE_HDL_WS_PORT ?? import.meta.env.VITE_GHDL_WS_PORT ?? DEFAULT_WS_PORT) || undefined;

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
  const [dialog, setDialog] = useState<'about' | 'settings' | 'help' | 'newFile' | null>(null);
  // Files an upload, a drop or a rename refused, shown in RefusedFilesDialog until closed.
  const [refusal, setRefusal] = useState<{ title: string; refused: readonly RefusedFile[] } | null>(null);
  // The Examples pane, shown over the editor (which stays mounted underneath).
  const [examplesOpen, setExamplesOpen] = useState(false);
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
    logSeq.current += 1;
    setLogLines((prev) => appendCapped(prev, { id: logSeq.current, time: timestamp(), text, tone }));
  }, []);

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
    setExamplesOpen(false);
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
    setExamplesOpen(false);
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
  };

  const handleDeleteFile = (id: string) => {
    setFiles((prev) => prev.filter((f) => f.id !== id));
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

  const handleDownloadAll = () => {
    if (files.length > 0) downloadProjectZip(files);
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
    setExamplesOpen(false);
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
    const json = serializeWorkspace({ files, activeFileId, topFileId, topUnit, testbench: tb.overrides });
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
  }, [hydrated, files, activeFileId, topFileId, topUnit, tb.overrides]);

  // The files as the Files panel draws them (docs/cleanup_file_tabs.md § 5.5).
  const rows = fileRows(files, {
    shownIds: tb.shownFileIds,
    topFileId,
    roleOf: tb.roleOf,
    problemsOf: (id) => countSeverities(diagnostics.byFile[id] ?? NO_LINES),
  });
  const fileMenu: FileMenuProps = { rows, onPick: handlePickFile, onNewFile: handleNewFile };

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
      />
      <SettingsDialog
        open={dialog === 'settings'}
        onClose={() => setDialog(null)}
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
          onClose={() => {
            setDialog(null);
            setNewTestbenchFor(null);
          }}
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
              onRename={handleRenameFile}
              onDelete={handleDeleteFile}
              onDownload={handleDownloadFile}
              onDownloadAll={handleDownloadAll}
              onToggleExamples={() => setExamplesOpen((open) => !open)}
              examplesOpen={examplesOpen}
              onFilesDropped={handleFilesDropped}
              onSetTopFile={handleSetTopFile}
              topLocked={isSimulating}
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
            <CodeEditor
              onChange={handleContentChange}
              onFilesDropped={handleFilesDropped}
              diagnostics={diagnostics.byFile}
              onDismissDiagnostics={dismissDiagnostics}
              split={tb.editorSplit(fileMenu)}
              emptyProject={
                files.length === 0 && (
                  <EmptyProject onExamples={() => setExamplesOpen(true)} onNewFile={handleNewFile} onUpload={handleUploadClick} />
                )
              }
            />
            {examplesOpen && <ExamplesPane onOpen={handleOpenExample} onClose={() => setExamplesOpen(false)} />}
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
