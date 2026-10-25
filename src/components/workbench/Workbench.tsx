// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type CSSProperties,
  type MutableRefObject,
} from 'react';
import { cx } from '../board';
import { BUILT_IN_CATALOG, DEFAULT_BOARD, findBoard } from '../../boards/boardCatalog';
import { foreignBoardNames } from '../../boards/boardMatch';
import { boardDesignPortNames } from '../../boards/boardPorts';
import { encodeStim, type BoardInputs } from '../../boards/boardShape';
import { loadPreferredBoard, preferredBoardIn } from '../../boards/preferredBoard';
import { BoardIoPanel } from './BoardIoPanel';
import { useBoardIo } from './useBoardIo';
import { generateBoardTop, starterTopFileName } from '../../boards/boardTop';
import { BoardChangeDialog } from './BoardChangeDialog';
import { BOARD_TEXT, boardPaneTitle, mismatchHint, notInstalledRunLog, runBoardLog, untranslatedLog, withBoardName } from './boardText';
import { useBoards } from './useBoards';
import { useBoardChange } from './useBoardChange';
import type { BoardCatalog, BoardDefinition } from '../../boards/types';
import { Header } from './Header';
import { GitHubSplitButton } from './GitHubSplitButton';
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
import { PickerWaitNotice, usePickerWait } from './PickerWait';
import { copyExample, starterFilesFor, type Example } from './examples';
import { SidePanel } from './SidePanel';
import { ActivityBar, ActivityBarRun, ActivityBarSeparator, ActivityBarShow } from './ActivityBar';
import { PanelToggleIcon } from './icons';
import { CodeEditor } from './CodeEditor';
import { EmptyProject } from './EmptyProject';
import { SimulationCard, type SimStatus } from './SimulationCard';
import { ConsoleOutput, type ConsoleLine, type ConsoleLink } from './ConsoleOutput';
import { appendCapped } from './consoleLines';
import { UPLOAD_ACCEPT, folderAfterRename, folderForUpload, topAfterDelete } from './fileKinds';
import { fileNameRefusal, incomingFileRefusals, UNREADABLE_ZIP_REASON, type RefusedFile } from './fileNameRules';
import { filesInZip, isZipName, projectFileInZip, zipPathOf, type ZipMember } from './zipUpload';
import { DEFAULT_SHOWN_FILE, TOP_LEVEL_ENTITY, type VhdlFile } from './files';
import { HdlClient, filesForRun, hdlBackendHttpUrl, hdlBackendUrl } from './hdlClient';
import { NoWaveformDialog } from '../waveform/NoWaveformDialog';
import { useWaveformView } from '../waveform/useWaveformView';
import { useProjectWaveViews } from './useProjectWaveViews';
import { WaveformButton } from '../waveform/WaveformButton';
import { WaveformPane } from '../waveform/WaveformPane';
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
import { findUnit } from './tbDetect/analyzeProject';
import { BLOCKED_REASON, paneRunFor } from './paneRun';
import { useTestbenchSplit } from './useTestbenchSplit';
import { revealTarget, type AdvisedDiagnostic } from './diagnosticAdvice';
import type { LocatedDiagnostic } from './diagnosticLocation';
import { downloadProjectArchive, downloadSourceFile } from './download';
import { confirmDialog, desktopBridge, gitHubTokenStore, parseWorkspace, serializeWorkspace } from './desktop';
import { ProjectPage } from './ProjectPage';
import { OpenProjectDialog } from './OpenProjectDialog';
import { ProjectFolderDialog } from './ProjectFolderDialog';
import { canPickWithHandles, pickFilesWithHandles, pickFolderOf, pickProjectFolder, type FileHandles } from './fileSystemAccess';
import { PATH_NEEDS_DESKTOP, folderOfPath, isFilePath, localProjectPath, parseProjectLocation, pathInFolder } from './projectLocation';
import { canPickFolder, desktopDisk, folderHandleDisk, pickSaveFolder, type DesktopFiles, type PickedFolder } from './projectSave';
import { planDiskSave, readExisting, runSavePlan, SaveWriteError, type SaveDisk } from './projectSavePlan';
import { folderOfRelative, samePath, sourceFolderOf, storedLayout, targetPathOf } from './projectLayout';
import { OverwriteDialog } from './OverwriteDialog';
import {
  MISSING_LOCAL_FILE,
  hasUnsavedChanges,
  availableFiles,
  filesInProject,
  isProjectUpload,
  newProject,
  startProject,
  defaultProject,
  DEFAULT_PROJECT_NAME,
  withFileLeft,
  withFilesAdded,
  openProject,
  pickProjectUpload,
  projectEntries,
  projectFileText,
  sourceDirectoryError,
  withDetails,
  withOnDisk,
  withoutDiskPlaces,
  withEntriesLoaded,
  withEntryEdited,
  withEntryRemoved,
  withEntryRenamed,
  withEntryUnloaded,
  withSaved,
  withDescriptionForDownload,
  isUntouchedDefault,
  projectNeedsName,
  unsavedChangesQuestion,
  type OpenedProject,
  type OpenProject,
  type LocalSourceFile,
  type ProjectSource,
  type ProjectSourceFile,
} from './projectFile';
import { fetchText } from '../../project/fetchText';
import { parseGistRef, resolveProjectUrl } from '../../project/gistUrl';
import { GITHUB_AUTH_PATH } from '../../github/config';
import type { GistLink, OpenedGistProject } from '../../github/projectGists';
import { GitHubSignInDialog } from './GitHubSignInDialog';
import { ProjectsPage } from './ProjectsPage';
import { openProjectInfo } from './ProjectsAccount';
import { isSameProject, type ProjectListItem } from './projectCatalog';
import type { FolderHandle, ScanOutcome } from './localProjectScan';
import { openRequestFor, useLocalProjects, type LocalOpenRequest } from './useLocalProjects';
import { GitHubConflictDialog } from './GitHubConflictDialog';
import { ProjectGitHubCard } from './ProjectGitHubCard';
import { gistLinkFromUrl, gitHubSyncState, isSomeoneElses, withGistLink } from './projectGitHub';
import { gitHubShareView } from './gitHubShare';
import { useGitHub } from './useGitHub';
import { useGitHubProjects } from './useGitHubProjects';
import { nameKey, sameFileName } from '../../project/fileName';
import { filesBesideProject, pathBeside, type Placed, type TaggedFile } from './chosenFolder';
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

/** Which testbench a run runs, as the waveform view keeps it: its file and unit. */
const runSource = (fileId: string | null, unitName: string | null): string => `${fileId ?? ''}|${unitName ?? ''}`;

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

/** A fresh workspace: the starter files on the preferred board when `catalog` has it, else on the Default board. */
function freshWorkspace(catalog: BoardCatalog, preferred: string): { board: BoardDefinition; files: VhdlFile[]; project: OpenProject } {
  const { board } = findBoard(catalog, preferredBoardIn(catalog, preferred));
  const files = starterFilesFor(board);
  return { board, files, project: defaultProject(files, board.id) };
}

/** An error's message, without Electron's "Error invoking remote method …: Error:" wrapping. */
function errorText(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err);
  return message.replace(/^Error invoking remote method '[^']*': (Error: )?/, '');
}

/** A path with `/` only and no `/` at the end: Windows paths and browser paths compare alike. */
function withSlashes(path: string): string {
  return path.replace(/\\/g, '/').replace(/\/+$/, '');
}

/** The folder a listed project file is in: `folder` of `folder/name.hdlboard.json`, or of `C:\…\folder\name.hdlboard.json`. */
function parentFolder(location: string): string {
  const path = withSlashes(location);
  return path.slice(0, path.lastIndexOf('/'));
}

let nextFileSeq = 1;
const nextFileId = () => `file-${nextFileSeq++}`;

// How long typing has to pause before the desktop app stores the workspace.
/**
 * An `ERROR` frame of these stages is a failed compile: open the first error.
 * Runtime messages mark lines but never move the view while the run goes on (a
 * failing assertion can arrive every clock cycle); a run that dies at runtime
 * opens its last located error once, after it has ended (`lastRunError`).
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
 * When opening a project shows the project settings: always (a URL), only when a file could
 * not be loaded or loading warned (a gist), or only when the project lists no files
 * (opened from this computer: straight to the code).
 */
type ProjectPageWhen = 'always' | 'onProblems' | 'whenEmpty';

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
  // The boards available here, and the student's last choice, which a fresh workspace starts on.
  const catalog = useBoards();
  const [preferredBoard] = useState(loadPreferredBoard);
  const [freshStart] = useState(() => freshWorkspace(BUILT_IN_CATALOG, preferredBoard));
  const [files, setFiles] = useState<VhdlFile[]>(freshStart.files);
  // The file in the editor's focused pane (docs/cleanup_file_tabs.md): the Files
  // highlight, what Ctrl+S saves, and the file the split pairs from.
  const [activeFileId, setActiveFileId] = useState<string | null>(DEFAULT_SHOWN_FILE);

  // The design file (vhdl/ or verilog/) a run starts from as top-level (FileExplorer's blue dot),
  // independent of which file is shown (docs/cleanup_file_tabs.md F6) — starts on whichever starter
  // file TOP_LEVEL_ENTITY names, matching what SimulationCard already
  // showed as a static label before this was selectable.
  const [topFileId, setTopFileId] = useState<string | null>(
    () => freshStart.files.find((f) => f.name === TOP_LEVEL_ENTITY)?.id ?? null,
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
        setProject(ws.project ?? defaultProject(ws.files, freshStart.board.id));
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
  const [dialog, setDialog] = useState<'about' | 'settings' | 'help' | 'newFile' | 'openProject' | 'githubSignIn' | null>(null);
  // Files an upload, a drop or a rename refused, shown in RefusedFilesDialog until closed.
  const [refusal, setRefusal] = useState<{ title: string; refused: readonly RefusedFile[] } | null>(null);
  // What is shown over the editor (which stays mounted underneath): the Examples pane, the project settings or the Projects page.
  // 'waveform': the waveform view, in place of the testbench/RTL split (docs/waveform_viewer_spec.md W8).
  const [overlay, setOverlay] = useState<'examples' | 'project' | 'projects' | 'waveform' | null>(null);
  // The open project file (projectFile.ts): Files holds its files.
  // Never empty: with no other project open, the workspace is the Default project (defaultProject).
  const [project, setProject] = useState<OpenProject>(freshStart.project);
  // The open project's board is the active one: what the board panel shows and the simulation uses.
  const { board: activeBoard, installed: boardInstalled } = findBoard(catalog, project.board);
  // Bumped whenever another project replaces the open one: the waveform of the old one goes (waveform spec § 8.7).
  const [projectGeneration, setProjectGeneration] = useState(0);
  const replaceProject = useCallback((next: OpenProject) => {
    setProject(next);
    setProjectGeneration((n) => n + 1);
  }, []);
  // What the project is busy with, e.g. downloading a file; shown on the project settings.
  const [projectBusy, setProjectBusy] = useState<string | null>(null);
  // Files a project opened in a browser without: stored next to its project file, but not chosen with it.
  const [folderNeeded, setFolderNeeded] = useState<readonly string[] | null>(null);
  // The opened project file's handle (Chrome, Edge): the folder picker then opens in its folder.
  const projectFileHandleRef = useRef<FileSystemFileHandle | null>(null);
  // Open Project: why the last try failed, shown in the dialog.
  const [openProjectError, setOpenProjectError] = useState<string | null>(null);
  // The folder Save project wrote to last (browser folder picker), so saving again asks no more.
  const saveFolderRef = useRef<PickedFolder | null>(null);
  // Save project would overwrite files that are not the project's own: the question, and its answer.
  const [overwriteAsk, setOverwriteAsk] = useState<{ paths: readonly string[]; answer: (overwrite: boolean) => void } | null>(null);
  // Folders the last save emptied, offered for removal on the project settings (D13), and the disk they are on.
  const [emptiedFolders, setEmptiedFolders] = useState<readonly string[]>([]);
  const savedDiskRef = useRef<SaveDisk | null>(null);
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

  // The Board pane: inputs the student sets, outputs the simulation drives (useBoardIo).
  // Outputs stay off whenever no simulation is running (Design_Description.md § 5 convention 11).
  const boardIo = useBoardIo(activeBoard);
  const activeBoardName = useRef(activeBoard.name);
  activeBoardName.current = activeBoard.name;

  const uploadInputRef = useRef<HTMLInputElement>(null);

  // The pane geometry: side pane widths, which panes are shut, the console's
  // height, and the dividers and shortcuts that change them.
  const layout = usePaneLayout();
  const { collapsed, togglePane, showPane } = layout;

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
  // The run still compiling is to stop as soon as it is ready: the server takes Stop only then.
  const stopWhenReady = useRef(false);

  const pushLine = useCallback((line: Omit<ConsoleLine, 'id' | 'time'>) => {
    // Taken now, not in the updater: lines logged in one batch would otherwise share the last id.
    logSeq.current += 1;
    const id = logSeq.current;
    setLogLines((prev) => appendCapped(prev, { id, time: timestamp(), ...line }));
  }, []);
  const appendLog = useCallback(
    (text: string, tone?: ConsoleLine['tone'], action?: ConsoleLine['action']) => pushLine({ text, tone, ...(action ? { action } : {}) }),
    [pushLine],
  );
  /** A line that ends in a link: Undo after a board change, Fix… after a hint. */
  const logWithLink = useCallback(
    (text: string, link?: ConsoleLink, tone?: ConsoleLine['tone']) => pushLine({ text, tone, ...(link ? { link } : {}) }),
    [pushLine],
  );

  // GitHub (docs/GITHUB.md): the sign-in, through this page's backend; the token kept per tab, or by the Windows app.
  const [tokenStore] = useState(gitHubTokenStore);
  const gitHub = useGitHub(hdlBackendHttpUrl(HDL_WS_PORT, GITHUB_AUTH_PATH), tokenStore);

  const stopElapsedTimer = () => {
    if (elapsedTimer.current !== null) {
      window.clearInterval(elapsedTimer.current);
      elapsedTimer.current = null;
    }
  };

  // Nothing is simulating: the honest board state, per Design_Description.md
  // § 5 convention 11. Used whenever a session isn't actively running —
  // before Start, and after Stop/error/disconnect — never only on mount.
  const blankBoard = boardIo.blank;

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
  const revealLocation = useCallback((target: Pick<LocatedDiagnostic, 'fileId' | 'line'>, highlight?: string) => {
    setOverlay(null);
    setActiveFileId(target.fileId);
    setReveal({ fileId: target.fileId, line: target.line, id: nextRevealId(), highlight });
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

  // The last error a run's output located (GHDL's "bound check failure at counter.vhd:48"):
  // where a run that dies at runtime takes the student, since its ERROR frame often only
  // says "Simulation exited unexpectedly." Cleared when a run starts.
  const lastRunError = useRef<AdvisedDiagnostic | null>(null);

  const clientRef = useRef<HdlClient | null>(null);
  // The waveform viewer (docs/waveform_viewer_spec.md): recorded for testbench runs, fetched when opened.
  const waveView = useWaveformView({
    waveGet: (run) => clientRef.current?.waveGet(run),
    overlay: {
      shown: overlay === 'waveform',
      show: useCallback(() => setOverlay('waveform'), []),
      hide: useCallback(() => setOverlay((shown) => (shown === 'waveform' ? null : shown)), []),
    },
    explorer: { collapsed: collapsed.sidebar, show: useCallback((open: boolean) => showPane('sidebar', open), [showPane]) },
    files: useCallback(() => filesRef.current, []),
    reveal: (target) => revealLocation(target, target.symbolId),
    log: useCallback((text: string, link?: boolean) => appendLog(text, link ? 'success' : undefined, link ? 'open-waveform' : undefined), [appendLog]),
    projectKey: String(projectGeneration),
    savedViews: useProjectWaveViews(project, setProject),
  });
  const { clientHandlers: waveHandlers, boardStateSeen, runEnded: endRunWaveform } = waveView;
  const getClient = useCallback((): HdlClient => {
    if (!clientRef.current) {
      clientRef.current = new HdlClient(hdlBackendUrl(HDL_WS_PORT), {
        onReady: () => {
          // A stop asked for while it compiled: the server takes Stop only now.
          if (stopWhenReady.current) {
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
          clientRef.current?.stim(boardIo.stimBits());
        },
        onState: (bits) => {
          boardIo.showState(bits);
          // A board run records no waveform (W1): the view closes.
          boardStateSeen();
        },
        onLog: (text) => {
          appendLog(withBoardName(text, activeBoardName.current));
          const located = recordDiagnostics(text, filesRef.current).filter((d) => d.severity === 'error');
          if (located.length > 0) lastRunError.current = located[located.length - 1];
        },
        onError: (stage, text) => {
          if (!takeFlag(quietEnd)) {
            appendLog(`${stage} error:\n${withBoardName(text, activeBoardName.current)}`, 'error');
            const advised = recordErrorDiagnostics(text, filesRef.current);
            if (REVEALING_STAGES.includes(stage)) revealFirstError(advised);
            else if (stage === 'runtime') revealFirstError(advised.length > 0 ? advised : lastRunError.current ? [lastRunError.current] : []);
          }
          stopElapsedTimer();
          setStatus('stopped');
          blankBoard();
          endRunWaveform();
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
          endRunWaveform();
        },
        onClosed: () => {
          stopElapsedTimer();
          setStatus('stopped');
          blankBoard();
        },
        onOldBackend: () => appendLog(BOARD_TEXT.oldBackend, 'error'),
        wave: waveHandlers,
      });
    }
    return clientRef.current;
  }, [appendLog, blankBoard, boardIo.stimBits, boardIo.showState, recordDiagnostics, recordErrorDiagnostics, revealFirstError, waveHandlers, endRunWaveform, boardStateSeen]);

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
    setProject((p) => withEntryRenamed(p, current.name, name));
  };

  const handleDeleteFile = (id: string) => {
    const deleted = files.find((f) => f.id === id);
    setFiles((prev) => prev.filter((f) => f.id !== id));
    // A deleted file leaves the project too.
    if (deleted) setProject((p) => withEntryRemoved(p, deleted.name));
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

  /**
   * Stops the ongoing run: now if it runs, as soon as it is ready if it still compiles.
   * Its closing messages are shown as for any stop. A board change stops the run this
   * way, as it was built with the old names.
   */
  const stopRunSoon = () => {
    if (status === 'compiling') stopWhenReady.current = true;
    if (status === 'running') getClient().stop();
  };

  /** Ends an ongoing run without its closing messages. */
  const endRunQuietly = () => {
    if (!isSimulating) return;
    quietEnd.current = true;
    stopRunSoon();
  };

  const handleDownloadFile = (id: string) => {
    const file = files.find((f) => f.id === id);
    if (file) downloadSourceFile(file);
  };

  const fileNames = files.map((f) => f.name);

  /**
   * The open project as its .zip, laid out as Save project writes it (docs/impl_project_structure.md
   * § 6.7): the project file at the top, its files in `<project>/<source folder>/`. Uploading
   * the .zip opens the project again.
   */
  const downloadOpenProject = (open: OpenProject, current: readonly VhdlFile[]) => {
    const projectFile = { name: open.fileName, text: projectFileText(open, current.map((f) => f.name)) };
    const projectFiles = filesInProject(open, current).map((f) => ({ path: targetPathOf(open, f.name), text: f.content }));
    downloadProjectArchive(projectFile, projectFiles);
    return projectFiles.length;
  };

  // The project's own .zip (the Default project's too). An empty description is written as "Not set yet".
  const handleDownloadAll = () => {
    downloadOpenProject(withDescriptionForDownload(project), files);
    setProject(withSaved(project, files));
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
    const { added, kept, openId, descriptions, untranslated } = copyExample(example, filesRef.current, nextFileId, activeBoard);
    for (const f of added) appendLog(`Copied ${f.name} from Examples into ${f.folder}/.`);
    for (const name of kept) appendLog(`${name} is already in your files - kept your copy, unchanged.`);
    for (const { name, reasons } of untranslated) appendLog(untranslatedLog(name, activeBoard, reasons), 'error');
    setFiles((prev) => [...prev, ...added]);
    // Each copied file joins the project with what its example says it is for.
    setProject((p) => added.reduce((next, f) => withEntryEdited(next, f.name, { description: descriptions[f.name] ?? '' }), p));
    if (added.some((f) => f.id === openId)) showNewFile(openId);
    else handleOpenFile(openId);
    makeTop(openId);
  };

  // A board of another shape has no examples: the Examples pane offers its generated
  // starter top instead (docs/board_io_v2_spec.md § 5.4), in the first language ticked.
  const handleNewStarterFile = () => {
    const language = preferredLanguages.has('vhdl') ? 'vhdl' : 'verilog';
    const name = starterTopFileName(activeBoard, language, files.map((f) => f.name));
    addFile(name, generateBoardTop(activeBoard, language, baseName(name)), folderForUpload(name) ?? 'vhdl');
    appendLog(`Added ${name}: a starter top file for the ${activeBoard.name} board.`, 'success');
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
    const content = design ? testbenchContent(name, language, dut ?? baseName(design.name)) : newDesignContent(name, language);
    // folderForUpload keeps the upload rules: .v to verilog/, VHDL to vhdl/.
    const id = addFile(name, content, folderForUpload(name) ?? 'vhdl');
    // Paired by override, so the new file opens in the TB pane beside its design (§ 4.6).
    if (design) tb.setPairOverride(design.id, id);
  };

  /** A new design with the board's ports; one whose name clashes with a port keeps the Default names, and says why. */
  const newDesignContent = (name: string, language: NewFileLanguage): string => {
    const template = newFileContent(name, language, activeBoard);
    if (template.untranslated) appendLog(untranslatedLog(name, activeBoard, template.untranslated), 'error');
    return template.text;
  };

  // "Create testbench" (§ 4.6): New File, named <stem>_tb (the tb_ prefix is reserved), in the design's language.
  const handleCreateTestbench = (designFileId: string) => {
    setNewTestbenchFor(designFileId);
    setDialog('newFile');
  };
  const testbenchDesign = newTestbenchFor === null ? undefined : files.find((f) => f.id === newTestbenchFor);

  // The browser's file and folder windows can take seconds to hand over what was chosen: a notice shows meanwhile.
  const pickerWait = usePickerWait();

  // Upload File: the Open project or files dialog, whose Select files is the picker below.
  const showOpenDialog = () => {
    setOpenProjectError(null);
    setDialog('openProject');
  };

  // Chrome and Edge's own picker keeps handles to the chosen files (fileSystemAccess.ts); elsewhere the file input.
  // The Windows app uses the file input too: a file from a handle has no path on disk
  // (pathForFile gives ''), and the path is what opens a project with its own folder.
  const handleUploadClick = () => {
    if (!canPickWithHandles() || desktopBridge()?.pathForFile) {
      uploadInputRef.current?.click();
      return;
    }
    pickerWait
      .wait(async () => {
        const picked = await pickFilesWithHandles(UPLOAD_ACCEPT.split(','));
        if (picked) await readAndAddFiles(picked.files, picked.handles);
      })
      .catch((err: unknown) => appendLog(`Upload File: ${errorText(err)}`, 'error'));
  };

  // Shared by the hidden <input type="file"> (a real picker, filtered to
  // the source extensions by its own `accept`) and drag-and-drop onto the
  // Files panel (below) — a browser drop is not filtered by `accept` at
  // all, so this is the one place other files actually get rejected, with
  // a console line explaining why rather than silently reading garbage in.
  // A file whose name is taken or reserved, or that is no source file, is not added;
  // the dialog says which and why (fileNameRules.ts), and the console keeps a line each.
  // A .zip among them is opened first and stands for the files inside it (zipUpload.ts).
  const readAndAddFiles = async (incoming: Iterable<File>, handles: FileHandles = new Map()) => {
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
    // A project file among them opens the project, with the others as its folder; from a
    // .zip, its shallowest .hdlboard.json (docs/impl_project_structure.md § 6.7).
    const zipMembers = chosen.filter((file): file is ZipMember => zipPathOf(file) !== undefined);
    const projectUpload = projectFileInZip(zipMembers) ?? pickProjectUpload(chosen.filter((file) => zipPathOf(file) === undefined));
    if (projectUpload) {
      projectFileHandleRef.current = handles.get(projectUpload.name) ?? null;
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
   * In the Windows app the project file's own folder is read too, so no folder is asked for,
   * and Save project writes back there. Opened cleanly, it goes straight to the editor.
   */
  const openProjectUpload = async (projectFile: File, others: readonly File[]) => {
    const bridge = desktopBridge();
    const path = localProjectPath(bridge?.pathForFile?.(projectFile));
    const read = bridge?.readLocalFile;
    const text = await projectFile.text();
    // Each file with where it is beside the project file, when that can be told; files in
    // other projects' folders are left out, so they never stand in (docs/impl_project_structure.md § 6.8).
    const layout = storedLayout(text, projectFile.name);
    const diskPathOf = bridge?.pathForFile ? (file: Placed) => bridge.pathForFile!(file as File) || undefined : undefined;
    const beside = filesBesideProject(
      projectFile,
      others.filter((file) => !isProjectUpload(file.name)),
      layout,
      diskPathOf,
    );
    const localFiles: LocalSourceFile[] = await Promise.all(
      beside.map(async ({ file, path: at }) => ({ name: file.name, content: await file.text(), ...(at !== undefined ? { path: at } : {}) })),
    );
    for (const extra of others.filter((file) => isProjectUpload(file.name))) {
      // Project files in subfolders belong to other projects, not beside this one.
      if (pathBeside(extra, projectFile, diskPathOf)?.includes('/')) continue;
      appendLog(`Ignored ${extra.name}: only one project file is opened at a time (${projectFile.name}).`, 'error');
    }
    const error = await openProjectText(
      path && read
        ? { text, location: path, localFiles, readLocal: (name) => read(pathInFolder(folderOfPath(path), name)) }
        : { text, location: projectFile.name, localFiles },
      undefined,
      'whenEmpty',
    );
    if (error !== null) setRefusal({ title: 'Project not opened', refused: [{ name: projectFile.name, reason: error }] });
  };

  /**
   * Opens a project file's text: its files replace what Files holds, the first of them is
   * shown, and the project settings shows as `page` says (ProjectPageWhen).
   * `gist`: the GitHub gist it is stored in (projectGitHub.ts). Returns why it could not be
   * opened, or null.
   */
  const openProjectText = async (
    source: Omit<ProjectSource, 'fetch'>,
    gist?: GistLink,
    page: ProjectPageWhen = 'always',
  ): Promise<string | null> => {
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
    applyOpenedProject(opened, source.localFiles ?? [], page);
    return null;
  };

  /**
   * A project read from its gist through the GitHub API (the Projects page, Get the GitHub
   * version). Opened cleanly, it goes straight to the editor; the project settings shows only
   * when something needs a look.
   */
  const openGistProject = async ({ projectFileText: text, rawProjectUrl, files: gistFiles, link }: OpenedGistProject) => {
    const localFiles = gistFiles.filter((file) => file.name !== link.projectFileName);
    return openProjectText({ text, location: rawProjectUrl, localFiles }, link, 'onProblems');
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
      return openProjectText({ text, location: location.path, readLocal: (name) => read(pathInFolder(folder, name)) }, undefined, 'whenEmpty');
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
    showSignIn: () => setDialog('githubSignIn'),
    log: appendLog,
  });

  /**
   * Open project or files › Open project folder, once the folder is read: it is the
   * projects folder now, and the Projects page lists every project in it (and the folders
   * directly inside it). A folder with exactly one project file of its own opens that project
   * too; with several, the student picks one from the list.
   */
  const showOpenedFolder = async (outcome: ScanOutcome, folder: string) => {
    if (outcome.items.length === 0) {
      setOpenProjectError(NO_PROJECT_FILE_MESSAGE);
      return;
    }
    setOpenProjectError(null);
    setDialog(null);
    // A project file in the folder itself, not one folder down.
    const own = outcome.items.filter((item) => parentFolder(item.location) === withSlashes(folder));
    if (own.length === 1) {
      const item = own[0];
      const source = outcome.sources.get(item.key);
      // The Windows app lists full paths and opens them as such; browsers read their source.
      const error = await (source ? openRequestFor(item, source) : Promise.resolve<LocalOpenRequest>({ kind: 'path', path: item.location }))
        .then(openLocalProject)
        .catch((err: unknown) => errorText(err));
      if (error) appendLog(`Project not opened: ${item.name}: ${error}`, 'error');
    }
    setOverlay('projects');
  };

  /** Open project folder in the Windows app: its own folder dialog, which also sets the projects folder. */
  const handleChooseDesktopFolder = async () => {
    try {
      const opened = await localProjects.openDesktopFolder();
      if (opened) await showOpenedFolder(opened.outcome, opened.folder);
    } catch (err) {
      setOpenProjectError(errorText(err));
    }
  };

  /** Open project folder with a browser folder input (Firefox, Safari): every file of the folder. */
  const handleProjectFolderOpened = async (chosen: File[]) => {
    await showOpenedFolder(await localProjects.openFolderFiles(chosen), chosen[0]?.webkitRelativePath.split('/')[0] ?? '');
  };

  /** Open project folder in Chrome and Edge: the folder itself, kept as the projects folder with access to save into it. */
  const handleChooseProjectFolder = async () => {
    try {
      await pickerWait.wait(async () => {
        const folder = await pickProjectFolder();
        if (!folder) return;
        await showOpenedFolder(await localProjects.openFolder(folder as unknown as FolderHandle), folder.name);
      });
    } catch (err) {
      setOpenProjectError(errorText(err));
    }
  };

  const localProjects = useLocalProjects(overlay === 'projects');

  // Signing in from the dialog ends in the Projects page, where the projects are.
  const signedIn = gitHub.session !== null;
  useEffect(() => {
    if (!signedIn || dialog !== 'githubSignIn') return;
    setDialog(null);
    setOverlay('projects');
  }, [signedIn, dialog]);

  /** Opening a project replaces Files: ask first when the open project has changes that would be lost. */
  const confirmLeavingUnsaved = (opening: string) =>
    !projectUnsaved ||
    confirmDialog(unsavedChangesQuestion(`Open ${opening}?`, project.name));

  const openLocalProject = async (request: LocalOpenRequest): Promise<string | null> => {
    if (request.kind === 'path') return openProjectFrom(request.path);
    if (request.kind === 'files') {
      await openProjectUpload(request.projectFile, request.others);
      return null;
    }
    const { text, location, localFiles, folder } = request;
    const error = await openProjectText({ text, location, localFiles }, undefined, 'whenEmpty');
    // Opening forgets the folder Save project writes to; this project's own folder is it again.
    if (error === null) saveFolderRef.current = folder;
    return error;
  };

  /** Projects page: open a project from the list, GitHub or local (docs/project_browse_page.md § 8). */
  const handleOpenListedProject = async (item: ProjectListItem) => {
    if (isSameProject(item, { name: project.name, gistId: project.gist?.gistId, location: project.location })) {
      setOverlay(null);
      return;
    }
    if (item.source === 'github' && item.entry) {
      // Open asks about changes not on GitHub itself; other unsaved changes it does not know of.
      if (gitHubSync === 'changed' || confirmLeavingUnsaved(item.name)) gitHubProjects.open(item.entry);
      return;
    }
    if (!confirmLeavingUnsaved(item.name)) return;
    try {
      const error = await openLocalProject(await localProjects.readForOpen(item));
      if (error !== null) throw new Error(error);
    } catch (err) {
      appendLog(`Project not opened: ${item.name}: ${errorText(err)}`, 'error');
      setRefusal({ title: 'Project not opened', refused: [{ name: item.name, reason: errorText(err) }] });
    }
  };

  const handleOpenProjectFrom = async (input: string) => {
    setOpenProjectError(null);
    const error = await openProjectFrom(input);
    if (error === null) setDialog(null);
    else setOpenProjectError(error);
  };

  const applyOpenedProject = (
    { project: opened, files: projectFiles }: OpenedProject,
    localFiles: readonly ProjectSourceFile[],
    page: ProjectPageWhen = 'always',
  ) => {
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
    setEmptiedFolders([]);
    const top = projectTopFile(added);
    setTopFileId(top?.id ?? null);
    setTopUnit(null);
    // The first file of the project's list (`added` keeps its order).
    setActiveFileId(added[0]?.id ?? null);
    replaceProject(opened);
    const clean = Object.keys(opened.unloaded).length === 0 && opened.warnings.length === 0;
    const showPage = page === 'always' || (page === 'onProblems' ? !clean : opened.entries.length === 0);
    setOverlay(showPage ? 'project' : null);
    // A browser read only the files chosen with the project file: ask for its folder at once.
    const notChosen = opened.entries.filter((entry) => opened.unloaded[entry.name.toLowerCase()] === MISSING_LOCAL_FILE);
    setFolderNeeded(notChosen.length > 0 ? notChosen.map((entry) => entry.name) : null);

    appendLog(`Opened project ${opened.name} (${opened.fileName}): ${added.length} of ${opened.entries.length} files.`, 'success');
    if (closed.length > 0) appendLog(`Closed the ${closed.length} file(s) Files held before; the project's files replace them.`);
    for (const entry of opened.entries) {
      const why = opened.unloaded[entry.name.toLowerCase()];
      if (why === MISSING_LOCAL_FILE) appendLog(`${entry.name} is stored next to the project file: choose the project folder to load it.`);
      else if (why) appendLog(`${entry.name} not loaded: ${why}`, 'error');
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

  /** Project settings: the files of the folder the student chose, for the entries that were not found. */
  const handleProjectFolderChosen = async (chosen: TaggedFile[]) => {
    const missing = projectEntries(project, filesRef.current.map((f) => f.name)).filter(
      (row) => row.status === 'unloaded' && row.problem === MISSING_LOCAL_FILE,
    );
    // Where each file is in the chosen folder: a folder handle tags it; a folder input starts with the folder's own name.
    const relativeOf = (file: TaggedFile) =>
      file.relativePath ?? (file.webkitRelativePath ? file.webkitRelativePath.split('/').slice(1).join('/') : file.name);
    // The project's source folder first, then next to the project file, then the shallowest elsewhere.
    const rank = (file: TaggedFile, name: string) => {
      const at = relativeOf(file);
      if (samePath(at, targetPathOf(project, name))) return 0;
      return at.split('/').length;
    };
    const found: VhdlFile[] = [];
    for (const row of missing) {
      const file = chosen
        .filter((f) => sameFileName(f.name, row.name))
        .sort((a, b) => rank(a, row.name) - rank(b, row.name))[0];
      if (!file) continue;
      found.push({ id: nextFileId(), name: row.name, folder: folderForUpload(row.name) ?? 'vhdl', content: await file.text() });
    }
    if (found.length === 0) {
      appendLog(`None of the missing files (${missing.map((row) => row.name).join(', ')}) are in that folder.`, 'error');
      return;
    }
    setFiles((prev) => [...prev, ...found]);
    setProject((p) => withEntriesLoaded(p, found));
    // Nothing shown yet (only the project file was chosen): the first of the project's files.
    if (!filesRef.current.some((f) => f.id === activeFileRef.current)) setActiveFileId(found[0].id);
    if (topFileId === null) {
      const top = projectTopFile(found);
      if (top) makeTop(top.id);
    }
    for (const f of found) appendLog(`Opened ${f.name} from the project folder.`, 'success');
  };

  /** Project settings: download a file again from its URL, into Files. */
  const handleReloadFromUrl = async (name: string) => {
    const row = projectEntries(project, fileNames).find((r) => sameFileName(r.name, name));
    if (!row || row.url === '') return;
    setProjectBusy(`Downloading ${name}…`);
    let content: string;
    try {
      content = await fetchText(row.url);
    } catch (err) {
      const reason = (err as Error).message;
      appendLog(`${name}: ${reason}`, 'error');
      if (row.status === 'unloaded') setProject((p) => withEntryUnloaded(p, name, reason));
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
      if (!confirmDialog(`Replace ${name} in Files with the version at its URL? Your changes to it are lost.`)) return;
      handleContentChange(existing.id, content);
      appendLog(`Downloaded ${name} again from its URL.`, 'success');
      return;
    }
    const folder = folderForUpload(name);
    if (!folder) return;
    setFiles((prev) => [...prev, { id: nextFileId(), name, folder, content }]);
    setProject((p) => withEntriesLoaded(p, [{ name, content }]));
    appendLog(`Downloaded ${name} from its URL.`, 'success');
  };

  /** The Windows app's file access for Save project, when this build has all of it. */
  const desktopFiles = (): DesktopFiles | undefined => {
    const bridge = desktopBridge();
    if (!bridge?.writeLocalFile || !bridge.listFolderFiles || !bridge.deleteLocalFile || !bridge.folderIsEmpty || !bridge.removeEmptyFolder) return undefined;
    return bridge as DesktopFiles;
  };

  /** Asks whether Save project may overwrite `paths`; resolves to the answer. */
  const askOverwrite = (paths: readonly string[]) =>
    new Promise<boolean>((resolve) => setOverwriteAsk({ paths, answer: resolve }));

  /**
   * Save project (docs/impl_project_structure.md § 6.5, § 6.6): the project file next to its
   * folder, the project's files in `<project>/<source folder>/` — back into the folder the
   * Windows app opened it from, else into a folder the student picks (asked once), else,
   * in Firefox and Safari, as the project's .zip. Files found flat are copied; files in
   * another folder are moved; a file that is not the project's own is overwritten only
   * after asking.
   */
  const handleSaveProject = async () => {
    const folderError = sourceDirectoryError(project.sourceDirectory);
    if (folderError) {
      appendLog(`Project not saved: ${folderError}`, 'error');
      return;
    }
    const current = filesRef.current;
    const projectFile = { name: project.fileName, text: projectFileText(project, current.map((f) => f.name)) };
    const toSave = filesInProject(project, current).map((f) => ({ name: f.name, text: f.content }));
    const desktop = desktopFiles();
    setEmptiedFolders([]);
    setProjectBusy('Saving the project…');
    try {
      // What is known on disk is only good for the folder it was learned in.
      let known = project;
      let disk: SaveDisk;
      let location: string;
      let where: string;
      let picked: PickedFolder | null = null;
      if (desktop && isFilePath(project.location)) {
        const folder = folderOfPath(project.location);
        disk = desktopDisk(desktop, folder, pathInFolder);
        location = pathInFolder(folder, project.fileName);
        where = folder;
      } else if (canPickFolder()) {
        picked = saveFolderRef.current;
        if (!picked) {
          picked = (await pickSaveFolder()) ?? null;
          if (!picked) return;
          known = withoutDiskPlaces(project);
        }
        disk = folderHandleDisk(picked);
        location = `${picked.name}/${project.fileName}`;
        where = `the folder ${picked.name}`;
      } else {
        // Firefox and Safari cannot write a folder: the project's .zip, laid out the same way (D16).
        const count = downloadOpenProject(project, current);
        setProject((p) => withSaved(p, current));
        appendLog(`Downloaded ${projectFile.name.replace(/\.hdlboard\.json$/i, '')}.zip: ${projectFile.name} and ${count} file(s) in ${sourceFolderOf(project)}. Unpack it to keep the project.`, 'success');
        return;
      }

      const plan = planDiskSave(known, toSave, projectFile, await readExisting(disk, known));
      if (plan.clashes.length > 0) {
        const overwrite = await askOverwrite(plan.clashes);
        if (!overwrite) {
          appendLog(`Project not saved: ${plan.clashes.length} file(s) would have been overwritten.`, 'error');
          return;
        }
      }
      let outcome;
      try {
        outcome = await runSavePlan(plan, disk);
      } catch (err) {
        if (!(err instanceof SaveWriteError)) throw err;
        // What was written is the project's own now: the next save writes over it without asking.
        setProject((p) => ({ ...p, ownWrites: [...(p.ownWrites ?? []), ...err.written] }));
        const oldProjectFile = known.onDiskFileName ?? project.fileName;
        appendLog(
          `Project not saved: could not write ${err.path}: ${err.reason}. Nothing was deleted; ${oldProjectFile} still points to the old folder.` +
            (err.written.length > 0 ? ' Copies written before the failure stay, and the next save tidies them.' : ''),
          'error',
        );
        return;
      }
      if (picked) {
        saveFolderRef.current = picked;
        // The picker granted access to this folder: Open Project lists it without asking again.
        void localProjects.adoptSavedFolder(picked as unknown as FolderHandle).catch(() => undefined);
      }
      savedDiskRef.current = disk;
      setProject((p) => withSaved(withOnDisk({ ...p, location }, plan.onDisk, projectFile.name), current));
      setEmptiedFolders(outcome.emptiedFolders);
      appendLog(`Saved ${projectFile.name} and ${toSave.length} file(s) in ${sourceFolderOf(project)}, in ${where}.`, 'success');
      if (outcome.leftBehind.length > 0) {
        const list = outcome.leftBehind.map(({ path, reason }) => `${path} (${reason})`).join(', ');
        appendLog(`Could not remove the old copies, which you can delete yourself: ${list}.`, 'error');
      }
    } catch (err) {
      appendLog(`Project not saved: ${errorText(err)}`, 'error');
    } finally {
      setProjectBusy(null);
    }
  };

  /** Project settings: remove a folder the last save emptied, if it is still empty (D13). */
  const handleRemoveEmptyFolder = async (folder: string) => {
    const disk = savedDiskRef.current;
    setEmptiedFolders((left) => left.filter((other) => other !== folder));
    if (!disk) return;
    try {
      await disk.removeEmptyFolder(folder);
      appendLog(`Removed the empty folder ${folder}.`, 'success');
      // The old project folder can be empty now too (after a rename): offered the same way.
      const parent = folderOfRelative(folder);
      if (parent !== '' && (await disk.isEmptyFolder(parent).catch(() => false))) {
        setEmptiedFolders((left) => (left.includes(parent) ? left : [...left, parent]));
      }
    } catch (err) {
      appendLog(`Did not remove ${folder}: ${errorText(err)}`, 'error');
    }
  };

  // What Save project will do, for its tooltip.
  const saveHint =
    desktopFiles() && isFilePath(project.location)
      ? `Save the project file in ${folderOfPath(project.location)}, and its files in ${sourceFolderOf(project)}`
      : canPickFolder()
        ? saveFolderRef.current
          ? `Save the project file in the folder ${saveFolderRef.current.name}, and its files in ${sourceFolderOf(project)}`
          : `Choose a folder, and save the project file in it and its files in ${sourceFolderOf(project)}`
        : 'Download the project as a .zip';

  // Files keeps its files, in the Default project again.
  const handleCloseProject = () => {
    appendLog(`Closed project ${project.name}; Files keeps its files, in the ${DEFAULT_PROJECT_NAME} project.`);
    // The files keep what they were described as.
    const descriptions = Object.fromEntries(projectEntries(project, filesRef.current.map((f) => f.name)).map((row) => [nameKey(row.name), row.description]));
    // The files are in the closed project's names, so the Default project keeps its board.
    replaceProject(defaultProject(filesRef.current, project.board, descriptions));
    setOverlay(null);
    setEmptiedFolders([]);
    saveFolderRef.current = null;
  };

  const handleOpenProjectFile = (name: string) => {
    const file = files.find((f) => sameFileName(f.name, name));
    if (file) handleOpenFile(file.id);
  };

  // New File > Project: a project listing every file now in Files, shown on the project settings.
  const handleCreateProject = (name: string) => {
    setDialog(null);
    // It lists the files now in Files, which are in the open project's names: its board too.
    const created = newProject(name, fileNames, project.board);
    saveFolderRef.current = null;
    replaceProject(created);
    setOverlay('project');
    appendLog(`New project ${created.name} (${created.fileName}), listing ${fileNames.length} file(s). Save it from the project settings.`, 'success');
  };

  // Create Project (Files panel): a new, empty project; the project settings offers the files now in Files.
  const handleStartProject = () => {
    // The files it offers are in the open project's names: its board too.
    const started = startProject(fileNames, project.board);
    saveFolderRef.current = null;
    replaceProject(started);
    setOverlay('project');
    appendLog('New project: give it a name, and add the files that belong to it.', 'success');
  };

  const handleFilesChosen = (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) void readAndAddFiles([...e.target.files]);
    e.target.value = '';
  };

  const handleFilesDropped = (list: FileList, handles: Promise<FileHandles>) => {
    const files = [...list];
    void handles.then((known) => readAndAddFiles(files, known));
  };

  /** The folder dialog's button: in Chrome and Edge the picker opens in the project file's folder. */
  const chooseProjectFolderNextTo = (handle: FileSystemFileHandle) => {
    setFolderNeeded(null);
    pickerWait
      .wait(async () => {
        const picked = await pickFolderOf(handle, sourceFolderOf(project));
        if (!picked) return;
        localProjects.adoptFolder(picked.folder as unknown as FolderHandle);
        await handleProjectFolderChosen(picked.files);
      })
      .catch((err: unknown) => appendLog(`Choose project folder: ${errorText(err)}`, 'error'));
  };

  const handleContentChange = (id: string, content: string) => {
    setFiles((prev) => prev.map((f) => (f.id === id ? { ...f, content } : f)));
    dismissDiagnostics(id);
  };

  // The next value is sent, never the inputs state variable: React state isn't updated
  // synchronously, so the stale value would leave the board one flip behind (§ 8.3).
  const handleBoardInputsChange = (next: BoardInputs) => {
    boardIo.setInputs(next);
    getClient().stim(encodeStim(activeBoard.ports, next));
  };

  // A new run starts with an empty console, so what it shows is this run's output only.
  // `runTarget`: the unit to elaborate when the backend must be told (`RUN <file> @<unit>`, D20).
  const startRun = (fileId: string | null, runTarget: string | null = null, unitName: string | null = null) => {
    quietEnd.current = false;
    stopWhenReady.current = false;
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
    lastRunError.current = null;
    waveView.runStarted({
      sources: filesForRun(files, topFile?.name).map((f) => f.content),
      topFileName: topFile?.name,
      title: runTarget ?? topFile?.name.replace(/\.[^.]+$/, '') ?? 'testbench',
      source: runSource(fileId, unitName),
    });
    logRunBoard();
    if (topFile) hintForeignNames(topFile, runTarget ?? unitName);
    getClient().run(files, topFile?.name, runTarget, waveView.waveform.recording, activeBoard.ports);
  };

  /** A run's first line names the board, so a screenshot shows which names were expected (§ 3.1). */
  const logRunBoard = () => {
    if (boardInstalled) appendLog(runBoardLog(activeBoard));
    else logWithLink(notInstalledRunLog(project.board, DEFAULT_BOARD), { label: BOARD_TEXT.chooseBoard, onClick: () => setDialog('settings') });
  };

  /**
   * The name-mismatch hint (§ 3.5): the top unit declares ports another installed board
   * has and the active one does not. It only informs; Fix… offers both ways out.
   */
  const hintForeignNames = (topFile: VhdlFile, unitName: string | null) => {
    const analysis = tb.fileAnalysis(topFile.id);
    const unit = analysis && (findUnit(analysis, unitName) ?? analysis.units.find((u) => u.hasPorts));
    const foreign = unit && foreignBoardNames(unit.portNames, catalog, activeBoard);
    if (!foreign) return;
    const fix = { label: BOARD_TEXT.fix, onClick: () => boardChange.offerMismatchFix(topFile.name, foreign.board) };
    logWithLink(mismatchHint(topFile.name, foreign, activeBoard), fix);
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

  const consoleTexts = useMemo(() => logLines.map((line) => line.text), [logLines]);

  // The names that make a unit a board design rather than a testbench follow the active board (§ 6.9).
  const boardPorts = useMemo(() => boardDesignPortNames(activeBoard), [activeBoard]);

  // The testbench split (docs/impl_split_screen.md): pairing, view, panes, overrides.
  const tb = useTestbenchSplit({
    files,
    boardPorts,
    activeFileId,
    setActiveFileId,
    reveal,
    paneRun,
    onCreateTestbench: handleCreateTestbench,
    // A testbench beside its design needs the room, and does not drive the board; a design on its own does.
    onViewChosen: (view) => {
      if (view === 'both') showPane('board', false);
      else if (view === 'rtl') showPane('board', true);
    },
  });

  // The Waveform button with a testbench on screen whose waveform the view does not have –
  // none run yet, or another testbench's (the student switched): run it, then open its
  // waveform as soon as the run offers one. Otherwise the button does what it always did.
  const shownTb = waveView.waveform.recording && !isSimulating ? tb.shownTestbench : null;
  const waveRunTarget =
    shownTb && (waveView.button.state === 'empty' || waveView.source !== runSource(shownTb.fileId, shownTb.unitName)) ? shownTb : null;
  const waveButton = {
    ...waveView.button,
    runsTestbench: waveRunTarget !== null,
    onToggle: () => {
      if (waveView.button.state === 'pressed' || waveRunTarget === null) return waveView.button.onToggle();
      handleRunPane('tb', waveRunTarget);
      waveView.openWhenReady();
    },
  };

  restoreOverridesRef.current = tb.restoreOverrides;

  /** The files a board change (or its Undo) made: a renamed file's markers are about text that has changed, as after an edit. */
  const replaceFilesForBoard = (next: VhdlFile[]) => {
    const before = new Map(filesRef.current.map((file) => [file.id, file.content]));
    for (const file of next) if (before.get(file.id) !== file.content) dismissDiagnostics(file.id);
    setFiles(next);
  };

  // Changing the board (docs/board_io_config_spec.md § 3.3): from Settings, the project settings, or a mismatch hint.
  // Not while the project loads or saves, or a run compiles: there is no overlapping state to define.
  const boardLocked = projectBusy !== null || status === 'compiling';
  const boardChange = useBoardChange({
    files,
    setFiles: replaceFilesForBoard,
    project,
    setProject,
    catalog,
    stopSimulation: stopRunSoon,
    reopenSettings: () => setDialog('settings'),
    log: logWithLink,
    busy: boardLocked,
    projectKey: String(projectGeneration),
  });
  // Settings closes only for a change that happens: the question takes its place, or the board just changes.
  const handleBoardChosenInSettings = (id: string) => {
    if (boardChange.requestBoardChange(id, { fromSettings: true })) setDialog(null);
  };

  // A fresh start on a board from boards/boards.json: that file arrives after the first
  // render, and the untouched starter files are then put in the board's names. A run
  // started before it arrived, even one still compiling, was built with the old names, so it stops.
  useEffect(() => {
    const ready = freshWorkspace(catalog, preferredBoard);
    const untouched = filesRef.current === freshStart.files && project === freshStart.project;
    if (!untouched || ready.board.id === freshStart.board.id) return;
    stopRunSoon();
    setFiles(ready.files);
    setProject(ready.project);
  }, [catalog]);

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

  const projectUnsaved = project !== null && hasUnsavedChanges(project, files);
  const gitHubSync = gitHubSyncState(project, files);
  const gitHubSomeoneElses = isSomeoneElses(project.gist, gitHub.session?.user.login ?? null);
  const gitHubShare = gitHubShareView({
    hasProject: true,
    signedIn,
    link: project.gist,
    someoneElses: gitHubSomeoneElses,
    syncState: gitHubSync,
    busy: gitHubProjects.busy,
    failed: gitHubProjects.message?.tone === 'error' ? gitHubProjects.message.text : null,
  });

  // Ctrl+Shift+S saves to GitHub (Ctrl+S, above, saves the shown file to disk).
  // The untouched Default project is named on the project settings before it is saved to GitHub.
  const untouchedDefault = isUntouchedDefault(project, projectUnsaved);
  // Whether the project settings was opened for that first save: decided as it opens, and kept while it
  // stays open, so editing the project's details does not change the page under the user.
  const [firstSaveAsked, setFirstSaveAsked] = useState(false);
  useEffect(() => {
    if (overlay !== 'project') setFirstSaveAsked(false);
  }, [overlay]);
  const gitHubFirstSave = firstSaveAsked && overlay === 'project' && signedIn && project.gist === undefined;
  const saveToGitHub = untouchedDefault || projectNeedsName(project)
    ? () => {
        setFirstSaveAsked(true);
        setOverlay('project');
      }
    : gitHubProjects.save;
  const shareRef = useRef({ view: gitHubShare, save: saveToGitHub });
  shareRef.current = { view: gitHubShare, save: saveToGitHub };
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || !e.shiftKey || e.altKey || e.key.toLowerCase() !== 's') return;
      e.preventDefault();
      const { view, save } = shareRef.current;
      if (view.visible && view.action === 'save' && !view.primaryInert) save();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  // The Projects page's view of the open project, new only when it changes (its list is memoised on it).
  const openProjectSummary = useMemo(() => openProjectInfo(project, gitHubSync, projectUnsaved), [project, gitHubSync, projectUnsaved]);
  const showInFolder = desktopBridge()?.showInFolder;

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
        onGitHub={() => (signedIn ? setOverlay((shown) => (shown === 'projects' ? null : 'projects')) : setDialog('githubSignIn'))}
        gitHubUser={gitHub.session?.user ?? null}
        gitHubActions={
          gitHubShare.visible && (
            <GitHubSplitButton
              view={gitHubShare}
              link={project.gist}
              someoneElses={gitHubSomeoneElses}
              onSave={saveToGitHub}
              onGetGitHubVersion={gitHubProjects.getGitHubVersion}
              onOpenProjects={() => setOverlay('projects')}
            />
          )
        }
      />
      <SettingsDialog
        open={dialog === 'settings'}
        onClose={() => setDialog(null)}
        boards={catalog}
        boardId={project.board}
        onBoardChange={handleBoardChosenInSettings}
        boardLocked={boardLocked}
        preferredLanguages={preferredLanguages}
        onPreferredLanguagesChange={handlePreferredLanguagesChange}
        splitPreference={tb.split.prefs.preference}
        onSplitPreferenceChange={tb.split.setPreference}
        recordWaves={waveView.waveform.recording}
        onRecordWavesChange={waveView.waveform.setRecording}
      />
      <HelpDialog open={dialog === 'help'} onClose={() => setDialog(null)} board={activeBoard} />
      {boardChange.pending && (
        <BoardChangeDialog
          pending={boardChange.pending}
          simulating={status === 'running'}
          onUpdateFiles={boardChange.confirmUpdate}
          onBoardOnly={boardChange.confirmBoardOnly}
          onSwitchBoard={(board) => boardChange.requestBoardChange(board.id)}
          onRenameFiles={boardChange.requestRenameToBoard}
          onCancel={boardChange.cancel}
        />
      )}
      <NoWaveformDialog {...waveView.dialog} />
      <PickerWaitNotice phase={pickerWait.phase} />
      <AboutDialog open={dialog === 'about'} onClose={() => setDialog(null)} />
      {overwriteAsk && (
        <OverwriteDialog
          paths={overwriteAsk.paths}
          onOverwrite={() => {
            overwriteAsk.answer(true);
            setOverwriteAsk(null);
          }}
          onCancel={() => {
            overwriteAsk.answer(false);
            setOverwriteAsk(null);
          }}
        />
      )}
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
          openProjectName={project.name}
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
          onChooseFolder={
            desktopBridge()?.listLocalProjects && desktopBridge()?.chooseProjectsFolder
              ? () => void handleChooseDesktopFolder()
              : canPickFolder()
                ? () => void handleChooseProjectFolder()
                : undefined
          }
          onSelectFiles={() => {
            setDialog(null);
            handleUploadClick();
          }}
          onClose={() => setDialog(null)}
        />
      )}
      {folderNeeded && (
        <ProjectFolderDialog
          projectName={project.name}
          missing={folderNeeded}
          onChooseInFolder={projectFileHandleRef.current ? () => chooseProjectFolderNextTo(projectFileHandleRef.current!) : undefined}
          onFolderChosen={(chosen) => {
            setFolderNeeded(null);
            localProjects.adoptFolderFiles(chosen);
            void handleProjectFolderChosen(chosen);
          }}
          onClose={() => setFolderNeeded(null)}
        />
      )}
      {dialog === 'githubSignIn' && <GitHubSignInDialog connection={gitHub} onClose={() => setDialog(null)} />}
      {gitHubProjects.conflict && (
        <GitHubConflictDialog
          conflict={gitHubProjects.conflict}
          projectName={project.name}
          onReplaceGitHubVersion={gitHubProjects.replaceGitHubVersion}
          onGetGitHubVersion={gitHubProjects.getGitHubVersion}
          onCancel={gitHubProjects.dismissConflict}
        />
      )}
      {tb.roleConflictDialog}
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
              onUpload={showOpenDialog}
              onNewFile={handleNewFile}
              onOpenProject={() => setOverlay((shown) => (shown === 'projects' ? null : 'projects'))}
              projectsOpen={overlay === 'projects'}
              onRename={handleRenameFile}
              onDelete={handleDeleteFile}
              onDownload={handleDownloadFile}
              onDownloadAll={handleDownloadAll}
              onToggleExamples={() => setOverlay((shown) => (shown === 'examples' ? null : 'examples'))}
              examplesOpen={overlay === 'examples'}
              onFilesDropped={handleFilesDropped}
              onSetTopFile={handleSetTopFile}
              topLocked={isSimulating}
              project={{ name: project.name, fileName: project.fileName, description: project.description, unsaved: projectUnsaved }}
              projectOpen={overlay === 'project'}
              onToggleProject={() => setOverlay((shown) => (shown === 'project' ? null : 'project'))}
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
            {/* Under the Examples pane or the project settings the editor is inert: no caret, no typing into a hidden file. */}
            <div className="wb-center__editor" {...(overlay !== null ? { inert: '' } : {})}>
            <CodeEditor
              onChange={handleContentChange}
              onFilesDropped={handleFilesDropped}
              diagnostics={diagnostics.byFile}
              onDismissDiagnostics={dismissDiagnostics}
              split={tb.editorSplit(fileMenu)}
              emptyProject={
                files.length === 0 && (
                  <EmptyProject onExamples={() => setOverlay('examples')} onNewFile={handleNewFile} onUpload={showOpenDialog} />
                )
              }
            />
            </div>
            {overlay === 'project' && (
              <ProjectPage
                project={project}
                rows={projectEntries(project, fileNames)}
                unsaved={projectUnsaved}
                busy={projectBusy}
                onDetailsChange={(details) => setProject((p) => withDetails(p, details))}
                boards={catalog}
                onBoardChange={(id) => boardChange.requestBoardChange(id)}
                boardLocked={boardLocked}
                onChooseBoard={() => setDialog('settings')}
                onEntryChange={(name, patch) => setProject((p) => withEntryEdited(p, name, patch))}
                onOpenFile={handleOpenProjectFile}
                onRemoveEntry={(name) => setProject((p) => withEntryRemoved(p, name))}
                onReloadFromUrl={(name) => void handleReloadFromUrl(name)}
                onFolderChosen={(chosen) => void handleProjectFolderChosen(chosen)}
                onSave={() => void handleSaveProject()}
                saveHint={saveHint}
                emptiedFolders={emptiedFolders}
                onRemoveFolder={(folder) => void handleRemoveEmptyFolder(folder)}
                available={availableFiles(project, fileNames)}
                onAddFiles={(names) => setProject((p) => withFilesAdded(p, names))}
                onLeaveProject={(name) => setProject((p) => withFileLeft(p, name))}
                onCloseProject={handleCloseProject}
                onClose={() => setOverlay(null)}
                gitHubSave={gitHubFirstSave ? gitHubProjects.save : undefined}
                askName={gitHubFirstSave && projectNeedsName(project)}
                github={
                  gitHubFirstSave ? undefined : (
                  <ProjectGitHubCard
                    link={project.gist}
                    syncState={gitHubSync}
                    userLogin={gitHub.session?.user.login ?? null}
                    projects={gitHubProjects}
                    named={!projectNeedsName(project)}
                  />
                  )
                }
              />
            )}
            {overlay === 'projects' && (
              <ProjectsPage
                connection={gitHub}
                gitHubProjects={gitHubProjects}
                localProjects={localProjects}
                openProject={openProjectSummary}
                opening={projectBusy !== null || gitHubProjects.busy !== null}
                onOpenItem={(item) => void handleOpenListedProject(item)}
                onNewProject={handleStartProject}
                onShowProjectPage={() => setOverlay('project')}
                // A project without a name is named on its settings first.
                onSaveLocal={() => (projectNeedsName(project) ? setOverlay('project') : void handleSaveProject())}
                onSignIn={() => setDialog('githubSignIn')}
                onShowInFolder={showInFolder && ((path) => void showInFolder(path))}
                onOpenFromUrl={showOpenDialog}
                onClose={() => setOverlay(null)}
              />
            )}
            {overlay === 'waveform' && (
              <WaveformPane waveform={waveView.waveform} consoleLines={consoleTexts} {...waveView.pane} />
            )}
            {overlay === 'examples' && (
            <ExamplesPane
              initialLanguages={preferredLanguages}
              onOpen={handleOpenExample}
              onClose={() => setOverlay(null)}
              board={activeBoard}
              onNewStarterFile={handleNewStarterFile}
            />
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
            title={boardPaneTitle(BOARD_PANE_TITLE, activeBoard)}
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
                <BoardIoPanel
                  board={activeBoard}
                  outputs={boardIo.outputs}
                  inputs={boardIo.inputs}
                  onInputsChange={handleBoardInputsChange}
                />
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
        waveButton={<WaveformButton {...waveButton} />}
        onOpenTime={waveView.links.onOpenTime}
        onOpenWaveform={waveView.links.onOpenWaveform}
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
