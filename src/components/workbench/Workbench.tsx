import { useCallback, useEffect, useRef, useState, type ChangeEvent } from 'react';
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

      <div className="wb-body">
        <div className="wb-sidebar">
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

        <CodeEditor
          tabs={tabs}
          activeTabId={activeTabId}
          onSelectTab={setActiveTabId}
          onCloseTab={handleCloseTab}
          onAddTab={handleNewFile}
          onChange={handleContentChange}
        />

        <div className="wb-right">
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
