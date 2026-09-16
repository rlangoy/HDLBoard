import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { Board, bitsToNumber, zeroBits, type BitVector } from '../board';
import { Leds } from '../Leds';
import { Pushbuttons } from '../Pushbuttons';
import { Switches } from '../Switches';
import { SevenSegmentDisplays, numberToDisplays } from '../SevenSegment';
import { Header } from './Header';
import { FileExplorer } from './FileExplorer';
import { CodeEditor } from './CodeEditor';
import { SimulationCard, type SimStatus } from './SimulationCard';
import { ConsoleOutput, type ConsoleLine } from './ConsoleOutput';
import { STARTER_FILES, DEFAULT_OPEN_TABS, TOP_LEVEL_ENTITY, type VhdlFile } from './files';
import './Workbench.css';

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
 * There is no real GHDL behind this — compiling and running are a
 * scripted console sequence — but every board panel is the real,
 * working component from `components/board`, `Switches`, `Leds`,
 * `Pushbuttons` and `SevenSegment`.
 */
export function Workbench() {
  const [files, setFiles] = useState<VhdlFile[]>(STARTER_FILES);
  const [openTabs, setOpenTabs] = useState<string[]>(DEFAULT_OPEN_TABS);
  const [activeTabId, setActiveTabId] = useState<string | null>(DEFAULT_OPEN_TABS[0] ?? null);

  const [status, setStatus] = useState<SimStatus>('stopped');
  const [logLines, setLogLines] = useState<ConsoleLine[]>([]);
  const logSeq = useRef(0);
  const timers = useRef<number[]>([]);

  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const elapsedTimer = useRef<number | null>(null);

  const [sw, setSw] = useState<BitVector>(() => zeroBits(10));
  const [key, setKey] = useState<BitVector>(() => [1, 1, 1, 1]);
  const dec = bitsToNumber(sw);

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

  const clearTimers = () => {
    timers.current.forEach((id) => window.clearTimeout(id));
    timers.current = [];
  };

  const stopElapsedTimer = () => {
    if (elapsedTimer.current !== null) {
      window.clearInterval(elapsedTimer.current);
      elapsedTimer.current = null;
    }
  };

  useEffect(
    () => () => {
      clearTimers();
      stopElapsedTimer();
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

  const handleFilesChosen = (e: ChangeEvent<HTMLInputElement>) => {
    const list = e.target.files;
    if (!list) return;
    Array.from(list).forEach((file) => {
      const reader = new FileReader();
      reader.onload = () => {
        const folder: VhdlFile['folder'] = /^tb_/i.test(file.name) ? 'work' : 'vhdl';
        addFile(file.name, String(reader.result ?? ''), folder);
      };
      reader.readAsText(file);
    });
    e.target.value = '';
  };

  const handleContentChange = (id: string, content: string) => {
    setFiles((prev) => prev.map((f) => (f.id === id ? { ...f, content } : f)));
  };

  const handleStart = () => {
    clearTimers();
    stopElapsedTimer();
    setElapsedSeconds(0);
    setStatus('compiling');
    appendLog('GHDL 0.37.0 (Debian 12.2.0-1)');

    const vhdlFiles = files.filter((f) => f.folder === 'vhdl');
    let delay = 220;
    vhdlFiles.forEach((f) => {
      timers.current.push(
        window.setTimeout(() => appendLog(`Compiling vhdl/${f.name} ...`), delay),
      );
      delay += 180;
    });

    timers.current.push(window.setTimeout(() => appendLog('Elaborating design ...'), delay));
    delay += 220;

    timers.current.push(
      window.setTimeout(() => appendLog('Simulation started (run -all) ...'), delay),
    );
    delay += 160;

    timers.current.push(
      window.setTimeout(() => {
        appendLog('Simulation running ...', 'success');
        setStatus('running');
        elapsedTimer.current = window.setInterval(() => setElapsedSeconds((s) => s + 1), 1000);
      }, delay),
    );
  };

  const handleStop = () => {
    clearTimers();
    stopElapsedTimer();
    appendLog('Simulation stopped.');
    setStatus('stopped');
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
                <Leds value={sw} />
                <SevenSegmentDisplays value={numberToDisplays(dec, 6)} />
                <Switches value={sw} onChange={setSw} />
                <Pushbuttons value={key} onChange={setKey} />
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
