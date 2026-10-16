// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent, type ReactNode, type RefObject } from 'react';
import { PluginOutputPane } from './PluginOutputPane';
import { clampPaneFraction, loadPaneFraction, paneFractionAt, savePaneFraction } from './paneGeometry';
import type { PluginOutputView } from './usePlugins';
import './PluginOutputPane.css';

/** How far one arrow key press moves the splitter. */
const KEYBOARD_STEP = 0.05;

export interface ConsoleAreaProps {
  /** The ordinary console, always on the left. */
  console: ReactNode;
  output: PluginOutputView;
  onCloseOutput: () => void;
}

/** The splitter's drag and keys; the share is remembered in this browser. */
function usePaneFraction(areaRef: RefObject<HTMLDivElement>) {
  const [fraction, setFraction] = useState(loadPaneFraction);
  useEffect(() => savePaneFraction(fraction), [fraction]);

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    const area = areaRef.current;
    if (!area) return;
    e.preventDefault();
    const handle = e.currentTarget;
    handle.setPointerCapture(e.pointerId);
    const move = (event: globalThis.PointerEvent) => {
      const { left, width } = area.getBoundingClientRect();
      setFraction(paneFractionAt(event.clientX, left, width));
    };
    const up = () => {
      handle.removeEventListener('pointermove', move);
      handle.removeEventListener('pointerup', up);
    };
    handle.addEventListener('pointermove', move);
    handle.addEventListener('pointerup', up);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    e.preventDefault();
    setFraction((f) => clampPaneFraction(f + (e.key === 'ArrowLeft' ? KEYBOARD_STEP : -KEYBOARD_STEP)));
  };

  return { fraction, onPointerDown, onKeyDown };
}

/**
 * The console row (docs/plugin_batch_implementation_plan.md § 7.3). A run without plugin
 * lines shows the console alone, exactly as before; the first plugin line splits the
 * row, with "Plugin output" on the right until it is closed or the next run starts.
 */
export function ConsoleArea({ console, output, onCloseOutput }: ConsoleAreaProps) {
  const areaRef = useRef<HTMLDivElement>(null);
  const { fraction, onPointerDown, onKeyDown } = usePaneFraction(areaRef);
  const showPane = !output.log.isEmpty && !output.closed;

  return (
    <div className="wb-console-area" ref={areaRef}>
      {console}
      {showPane && (
        <>
          <div
            className="wb-console-area__splitter"
            role="separator"
            aria-orientation="vertical"
            aria-label="Resize plugin output"
            aria-valuenow={Math.round(fraction * 100)}
            tabIndex={0}
            onPointerDown={onPointerDown}
            onKeyDown={onKeyDown}
          />
          <div className="wb-console-area__pane" style={{ flexBasis: `${fraction * 100}%` }}>
            <PluginOutputPane output={output} onClose={onCloseOutput} />
          </div>
        </>
      )}
    </div>
  );
}
