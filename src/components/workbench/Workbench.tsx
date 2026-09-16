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

// Sidebar drag bounds and the space the editor and board panel each need to
// stay usable — see the "Resizing" note in this folder's README before
// changing these.
const SIDEBAR_MIN_W = 180;
const SIDEBAR_MAX_W = 480;
const SIDEBAR_DEFAULT_W = 250;
const EDITOR_MIN_W = 200;
const BOARD_MIN_W = 260;
const BOARD_MAX_W = 760;
// Below this the board's 2-column grid can't fit — see Board.css's own
// 900px viewport fallback, which this mirrors at the panel's own width.
const BOARD_NARROW_W = 700;

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
  const desiredBoardWidth = useRef(BOARD_MAX_W);
  const [sidebarWidth, setSidebarWidth] = useState(SIDEBAR_DEFAULT_W);
  const [boardWidth, setBoardWidth] = useState(BOARD_MAX_W);

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
      let sidebar = clamp(desiredSidebar, SIDEBAR_MIN_W, SIDEBAR_MAX_W);
      let board = clamp(desiredBoard, BOARD_MIN_W, BOARD_MAX_W);

      const overflow = sidebar + board + EDITOR_MIN_W - containerWidth;
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

  const handleSidebarResizerPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = sidebarWidth;

    const onMove = (ev: PointerEvent) => {
      const containerWidth = bodyRef.current?.getBoundingClientRect().width ?? 0;
      const next = startWidth + (ev.clientX - startX);
      desiredSidebarWidth.current = next;
      applyLayout(containerWidth, next, desiredBoardWidth.current, 'board');
    };
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  // This handle sits on the board panel's left edge, so dragging it left
  // (negative clientX delta) should grow the board — the opposite sign
  // from the sidebar handle, which grows its panel by dragging right.
  const handleBoardResizerPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = boardWidth;

    const onMove = (ev: PointerEvent) => {
      const containerWidth = bodyRef.current?.getBoundingClientRect().width ?? 0;
      const next = startWidth - (ev.clientX - startX);
      desiredBoardWidth.current = next;
      applyLayout(containerWidth, desiredSidebarWidth.current, next, 'sidebar');
    };
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
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

        <div
          className={`wb-right${boardWidth < BOARD_NARROW_W ? ' wb-right--narrow' : ''}`}
          style={{ width: boardWidth }}
        >
          <Board size={24}>
            <Leds value={sw} />
            <SevenSegmentDisplays value={numberToDisplays(dec, 6)} />
            <Switches value={sw} onChange={setSw} />
            <Pushbuttons value={key} onChange={setKey} />
          </Board>
        </div>
      </div>

      <ConsoleOutput lines={logLines} onClear={handleClearConsole} />
    </div>
  );
}

export default Workbench;
