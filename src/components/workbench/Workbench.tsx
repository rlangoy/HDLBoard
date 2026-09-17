import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { Board, zeroBits, type BitVector } from '../board';
import { Leds } from '../Leds';
import { Pushbuttons } from '../Pushbuttons';
import { Switches } from '../Switches';
import {
  SevenSegmentDisplays,
  blankSegments,
  type SegmentVector,
} from '../SevenSegment';
import { Header } from './Header';
import { FileExplorer } from './FileExplorer';
import { CodeEditor } from './CodeEditor';
import { SimulationCard, type SimStatus } from './SimulationCard';
import { ConsoleOutput, type ConsoleLine } from './ConsoleOutput';
import { STARTER_FILES, DEFAULT_OPEN_TABS, TOP_LEVEL_ENTITY, type VhdlFile } from './files';
import { GhdlClient, ghdlBackendUrl } from './ghdlClient';
import './Workbench.css';

// The backend's WebSocket port (ghdl_implementation_plan.md § 5.8) —
// overridable at build time so a deployment can point at a different
// backend without editing source. The host is never hardcoded (§ 6.4):
// ghdlBackendUrl() resolves it from whatever host the page was loaded
// from, so the LAN access this repo's own README documents for the Vite
// dev server works for the backend too, with no extra configuration.
const GHDL_WS_PORT = Number(import.meta.env.VITE_GHDL_WS_PORT ?? 9010);

function timestamp(): string {
  const d = new Date();
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

let nextFileSeq = 1;

// The space each pane needs to stay usable, and the width each starts at —
// see the "Resizing" note in this folder's README before changing these.
// These are *rendered* widths: both side panes are border-box, so the width
// set here is the width measured on screen, padding included.
//
// There is deliberately no maximum for either side pane. A fixed ceiling is
// what stops a divider being dragged back to where it sat before the window
// grew: widen the window and the pane stays pinned at its cap while the
// editor swallows the new space, so the divider can never travel back. Each
// pane's real ceiling is whatever the other two panes' minimums leave, which
// applyLayout works out per call.
const SIDEBAR_MIN_W = 208;
const SIDEBAR_DEFAULT_W = 278;
const EDITOR_MIN_W = 200;
const BOARD_MIN_W = 200;
const BOARD_DEFAULT_W = 792;
// The two .wb-resizer handles, which sit between the panes and take width
// of their own (Workbench.css keeps them at 10px each).
const CHROME_W = 20;

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

/**
 * The workbench's main page: a file tree and tabbed editor on the left
 * driving a live DE1-SoC board mock and GHDL console on the right, laid
 * out to match `DesignResources/WorkBench.png`.
 *
 * `LEDR`/`HEX` are driven by a real GHDL simulation over WebSocket
 * (`ghdlClient.ts`, ghdl_implementation_plan.md) — never by `SW`/`KEY`
 * directly (Design_Description.md § 5 convention 11). Every board panel
 * is the real, working component from `components/board`, `Switches`,
 * `Leds`, `Pushbuttons` and `SevenSegment`.
 */
export function Workbench() {
  const [files, setFiles] = useState<VhdlFile[]>(STARTER_FILES);
  const [openTabs, setOpenTabs] = useState<string[]>(DEFAULT_OPEN_TABS);
  const [activeTabId, setActiveTabId] = useState<string | null>(DEFAULT_OPEN_TABS[0] ?? null);

  const [status, setStatus] = useState<SimStatus>('stopped');
  const [logLines, setLogLines] = useState<ConsoleLine[]>([]);
  const logSeq = useRef(0);

  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const elapsedTimer = useRef<number | null>(null);

  const [sw, setSw] = useState<BitVector>(() => zeroBits(10));
  const [key, setKey] = useState<BitVector>(() => [1, 1, 1, 1]);
  // Mirrors of sw/key for the GhdlClient's handlers to read (below): those
  // handlers are captured once, when the client is lazily constructed, so
  // reading `sw`/`key` directly there would see whatever they were at that
  // moment forever after — a stale closure. Refs are updated synchronously
  // in handleSwChange/handleKeyChange and always read current.
  const swRef = useRef(sw);
  const keyRef = useRef(key);

  // Board outputs are driven by the simulation backend, never by the
  // inputs. Until GHDL is wired up they stay at their blank values — see
  // ghdl_implementation_plan.md § 0 for why that is the correct state
  // (Design_Description.md § 5 convention 11).
  const [ledState, setLedState] = useState<BitVector>(() => zeroBits(10));
  const [hexState, setHexState] = useState<SegmentVector[]>(() =>
    Array.from({ length: 6 }, () => blankSegments()),
  );

  const uploadInputRef = useRef<HTMLInputElement>(null);

  // Both side panels are user-driven (drag) but always reconciled against
  // the body's actual measured width, so neither can push the other panel
  // — or itself — past the browser edge. `desiredSidebarWidth` /
  // `desiredBoardWidth` hold the user's last requested width for each,
  // independent of whatever they were actually rendered at after the
  // reconciliation below; that's what lets a panel grow back to what the
  // user asked for once the other one is dragged back or the window
  // regains room, instead of staying stuck at a once-clamped size.
  const bodyRef = useRef<HTMLDivElement>(null);
  const desiredSidebarWidth = useRef(SIDEBAR_DEFAULT_W);
  const desiredBoardWidth = useRef(BOARD_DEFAULT_W);
  const [sidebarWidth, setSidebarWidth] = useState(SIDEBAR_DEFAULT_W);
  const [boardWidth, setBoardWidth] = useState(BOARD_DEFAULT_W);

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

  // `shrinkFirst` says which panel gives way when both requested widths
  // don't fit alongside the editor's minimum:
  // - 'sidebar' / 'board': the panel *not* currently being dragged gives
  //   way first, so the one the user is actively resizing tracks the
  //   pointer exactly.
  // - 'proportional' (a plain window resize, no active drag): both panels
  //   give way together, in proportion to how much each has left above
  //   its own minimum. Giving one panel strict priority here (as earlier
  //   drafts did, always shrinking the board first) left the sidebar
  //   looking frozen across a wide range of window widths — it wouldn't
  //   move until the board had already been squeezed to its floor.
  const applyLayout = useCallback(
    (
      containerWidth: number,
      desiredSidebar: number,
      desiredBoard: number,
      shrinkFirst: 'sidebar' | 'board' | 'proportional' = 'proportional',
    ) => {
      if (containerWidth <= 0) return;
      // What is left for the three panes once the drag handles take theirs.
      const room = containerWidth - CHROME_W;
      // Each pane may claim anything the other two don't need, so a pane can
      // always be dragged back out to where the window allows.
      const sidebarMax = Math.max(SIDEBAR_MIN_W, room - BOARD_MIN_W - EDITOR_MIN_W);
      const boardMax = Math.max(BOARD_MIN_W, room - SIDEBAR_MIN_W - EDITOR_MIN_W);
      let sidebar = clamp(desiredSidebar, SIDEBAR_MIN_W, sidebarMax);
      let board = clamp(desiredBoard, BOARD_MIN_W, boardMax);

      const overflow = sidebar + board + EDITOR_MIN_W - room;
      if (overflow > 0) {
        if (shrinkFirst === 'proportional') {
          const sidebarRoom = sidebar - SIDEBAR_MIN_W;
          const boardRoom = board - BOARD_MIN_W;
          const totalRoom = sidebarRoom + boardRoom;
          if (totalRoom > 0) {
            const sidebarShrink = Math.min(sidebarRoom, (overflow * sidebarRoom) / totalRoom);
            sidebar -= sidebarShrink;
            board -= Math.min(boardRoom, overflow - sidebarShrink);
          }
        } else {
          const shrinkSidebarFirst = shrinkFirst === 'sidebar';
          const first = shrinkSidebarFirst
            ? Math.min(overflow, sidebar - SIDEBAR_MIN_W)
            : Math.min(overflow, board - BOARD_MIN_W);
          if (shrinkSidebarFirst) sidebar -= first;
          else board -= first;

          const remaining = overflow - first;
          if (remaining > 0) {
            // Still too tight even at the other panel's minimum — take the
            // rest from whichever panel wasn't shrunk first.
            if (shrinkSidebarFirst) board = Math.max(BOARD_MIN_W, board - remaining);
            else sidebar = Math.max(SIDEBAR_MIN_W, sidebar - remaining);
          }
        }
      }

      setSidebarWidth(sidebar);
      setBoardWidth(board);
    },
    [],
  );

  useEffect(() => {
    const el = bodyRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width;
      if (width) {
        applyLayout(width, desiredSidebarWidth.current, desiredBoardWidth.current);
      }
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [applyLayout]);

  // Pointer capture keeps the whole drag bound to the handle: without it the
  // cursor reverts to whatever the pointer happens to be over mid-drag (the
  // editor's text I-beam, most obviously), which reads as the drag having
  // dropped. `.wb-is-resizing` holds the col-resize cursor and suppresses
  // text selection across the page for the same reason.
  const beginResize = (
    e: ReactPointerEvent<HTMLDivElement>,
    onDelta: (deltaX: number, containerWidth: number) => void,
  ) => {
    e.preventDefault();
    const startX = e.clientX;
    const handle = e.currentTarget;
    handle.setPointerCapture(e.pointerId);
    document.body.classList.add('wb-is-resizing');

    const onMove = (ev: PointerEvent) => {
      onDelta(ev.clientX - startX, bodyRef.current?.getBoundingClientRect().width ?? 0);
    };
    const onUp = () => {
      document.body.classList.remove('wb-is-resizing');
      handle.releasePointerCapture(e.pointerId);
      handle.removeEventListener('pointermove', onMove);
      handle.removeEventListener('pointerup', onUp);
      handle.removeEventListener('pointercancel', onUp);
    };
    handle.addEventListener('pointermove', onMove);
    handle.addEventListener('pointerup', onUp);
    handle.addEventListener('pointercancel', onUp);
  };

  const handleSidebarResizerPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    const startWidth = sidebarWidth;
    beginResize(e, (deltaX, containerWidth) => {
      const next = startWidth + deltaX;
      desiredSidebarWidth.current = next;
      applyLayout(containerWidth, next, desiredBoardWidth.current, 'board');
    });
  };

  // This handle sits on the board panel's left edge, so dragging it left
  // (negative clientX delta) should grow the board — the opposite sign
  // from the sidebar handle, which grows its panel by dragging right.
  const handleBoardResizerPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    const startWidth = boardWidth;
    beginResize(e, (deltaX, containerWidth) => {
      const next = startWidth - deltaX;
      desiredBoardWidth.current = next;
      applyLayout(containerWidth, desiredSidebarWidth.current, next, 'sidebar');
    });
  };

  const appendLog = useCallback((text: string, tone?: ConsoleLine['tone']) => {
    logSeq.current += 1;
    setLogLines((prev) => [...prev, { id: logSeq.current, time: timestamp(), text, tone }]);
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

  // One GhdlClient per Workbench instance, created lazily on first Start
  // rather than on mount, so opening the page never opens a socket the
  // student hasn't asked for yet. `onState` is the only path that ever
  // writes ledState/hexState to anything other than blank — see the
  // file-top comment and Design_Description.md § 5 convention 11.
  const clientRef = useRef<GhdlClient | null>(null);
  const getClient = useCallback((): GhdlClient => {
    if (!clientRef.current) {
      clientRef.current = new GhdlClient(ghdlBackendUrl(GHDL_WS_PORT), {
        onReady: () => {
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
        onLog: (text) => appendLog(text),
        onError: (stage, text) => {
          appendLog(`${stage} error:\n${text}`, 'error');
          stopElapsedTimer();
          setStatus('stopped');
          blankBoard();
        },
        onDone: () => {
          stopElapsedTimer();
          setStatus('stopped');
          appendLog('Simulation stopped.');
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
  }, [appendLog, blankBoard]);

  useEffect(
    () => () => {
      stopElapsedTimer();
      clientRef.current?.close();
    },
    [],
  );

  const handleOpenFile = (id: string) => {
    setOpenTabs((prev) => (prev.includes(id) ? prev : [...prev, id]));
    setActiveTabId(id);
  };

  const handleCloseTab = (id: string) => {
    const closedIndex = openTabs.indexOf(id);
    const remaining = openTabs.filter((t) => t !== id);
    setOpenTabs(remaining);
    if (activeTabId === id) {
      setActiveTabId(remaining[closedIndex] ?? remaining[closedIndex - 1] ?? null);
    }
  };

  const handleRenameFile = (id: string, name: string) => {
    setFiles((prev) => prev.map((f) => (f.id === id ? { ...f, name } : f)));
  };

  const handleDeleteFile = (id: string) => {
    setFiles((prev) => prev.filter((f) => f.id !== id));
    // Also closes the tab, if it had one open — same "next tab takes over"
    // logic as a plain close, since a deleted file can't stay open.
    handleCloseTab(id);
  };

  const addFile = (name: string, content: string, folder: VhdlFile['folder'] = 'vhdl') => {
    const id = `file-${nextFileSeq++}`;
    setFiles((prev) => [...prev, { id, name, folder, content }]);
    setOpenTabs((prev) => [...prev, id]);
    setActiveTabId(id);
  };

  const handleNewFile = () => {
    const n = files.filter((f) => f.name.startsWith('untitled')).length + 1;
    addFile(`untitled${n}.vhd`, '');
  };

  const handleUploadClick = () => uploadInputRef.current?.click();

  // Shared by the hidden <input type="file"> (a real picker, filtered to
  // .vhd/.vhdl by its own `accept`) and drag-and-drop onto the Files
  // panel (below) — a browser drop is not filtered by `accept` at all, so
  // this is the one place non-VHDL files actually get rejected, with a
  // console line explaining why rather than silently reading garbage in.
  const readAndAddFiles = (incoming: Iterable<File>) => {
    for (const file of incoming) {
      if (!/\.(vhdl?|vhd)$/i.test(file.name)) {
        appendLog(`Skipped ${file.name}: not a .vhd/.vhdl file.`, 'error');
        continue;
      }
      const reader = new FileReader();
      reader.onload = () => {
        const folder: VhdlFile['folder'] = /^tb_/i.test(file.name) ? 'work' : 'vhdl';
        addFile(file.name, String(reader.result ?? ''), folder);
      };
      reader.readAsText(file);
    }
  };

  const handleFilesChosen = (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) readAndAddFiles(e.target.files);
    e.target.value = '';
  };

  const handleFilesDropped = (list: FileList) => readAndAddFiles(list);

  const handleContentChange = (id: string, content: string) => {
    setFiles((prev) => prev.map((f) => (f.id === id ? { ...f, content } : f)));
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

  const handleStart = () => {
    stopElapsedTimer();
    setElapsedSeconds(0);
    setStatus('compiling');
    blankBoard();
    getClient().run(files);
  };

  const handleStop = () => {
    // Status/log transition happens on the backend's own DONE frame
    // (getClient()'s onDone), not optimistically here — the backend is
    // the single source of truth for whether a simulation is running.
    getClient().stop();
  };

  const handleClearConsole = () => setLogLines([]);

  const tabs = openTabs
    .map((id) => files.find((f) => f.id === id))
    .filter((f): f is VhdlFile => f !== undefined)
    .map((f) => ({ id: f.id, name: f.name, content: f.content }));

  return (
    <div className="wb">
      <Header />

      <div className="wb-body" ref={bodyRef}>
        <div className="wb-sidebar" style={{ width: sidebarWidth }}>
          <SimulationCard
            status={status}
            elapsedSeconds={elapsedSeconds}
            topFile={TOP_LEVEL_ENTITY}
            onStart={handleStart}
            onStop={handleStop}
          />
          <FileExplorer
            files={files}
            activeFileId={activeTabId}
            onSelect={handleOpenFile}
            onUpload={handleUploadClick}
            onNewFile={handleNewFile}
            onRename={handleRenameFile}
            onDelete={handleDeleteFile}
            onFilesDropped={handleFilesDropped}
          />
          <input
            ref={uploadInputRef}
            type="file"
            accept=".vhd,.vhdl"
            multiple
            className="wb-files__hidden-input"
            onChange={handleFilesChosen}
          />
        </div>

        <div
          className="wb-resizer"
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize file panel"
          onPointerDown={handleSidebarResizerPointerDown}
        />

        <CodeEditor
          tabs={tabs}
          activeTabId={activeTabId}
          onSelectTab={setActiveTabId}
          onCloseTab={handleCloseTab}
          onAddTab={handleNewFile}
          onChange={handleContentChange}
          onFilesDropped={handleFilesDropped}
        />

        <div
          className="wb-resizer"
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize board panel"
          onPointerDown={handleBoardResizerPointerDown}
        />

        <div className="wb-right" style={{ width: boardWidth }}>
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
        </div>
      </div>

      <ConsoleOutput lines={logLines} onClear={handleClearConsole} />
    </div>
  );
}

export default Workbench;
