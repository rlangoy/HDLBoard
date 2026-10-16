// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * Everything the workbench knows about plugins (docs/plugin_batch_implementation_plan.md
 * § 3.6, § 7): the settings, the edited plugin files, the plugin output of the current
 * run, and the last error an edited file caused. Kept out of `Workbench.tsx`, which only
 * passes these on.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type { RunPlugins } from '../hdlClient';
import type { PluginLine } from './pluginFrame';
import { PluginLog } from './pluginLog';
import { loadPluginPrefs, savePluginPrefs, type PluginPrefs } from './pluginPrefs';
import { loadPluginEdits, pluginRunFiles, savePluginEdits, shippedChangedNotice, type PluginEdits } from './pluginSources';

/** What the plugin pane shows: a snapshot of the log, taken at most once per animation frame. */
export interface PluginOutputView {
  readonly log: PluginLog;
  /** Bumped whenever the log changed; the pane re-reads the log when it does. */
  readonly version: number;
  /** Hidden by its close button until the next run. */
  readonly closed: boolean;
}

export interface Plugins {
  readonly prefs: PluginPrefs;
  setPrefs(prefs: PluginPrefs): void;
  readonly edits: PluginEdits;
  setEdits(edits: PluginEdits): void;
  readonly output: PluginOutputView;
  /** A new run is READY: its output starts empty and the pane may show again. */
  clearOutput(): void;
  addOutput(line: PluginLine): void;
  closeOutput(): void;
  /** What the next `RUN` sends: the enabled plugins, and their files while the Plugins page is on. */
  runPlugins(): RunPlugins;
  /** A console line for the start of a run, or nothing (plan § 7.4a). */
  runNotice(): string | undefined;
  /** The text of the last `plugin` stage error, for the Plugins page. */
  readonly lastPluginError: string | null;
  recordError(stage: string, text: string): void;
}

/**
 * The log is appended to outside React (a flooding plugin sends tens of thousands of
 * frames a second); the view is told about it once per animation frame.
 */
function usePluginOutput() {
  const logRef = useRef(new PluginLog());
  const [version, setVersion] = useState(0);
  const [closed, setClosed] = useState(false);
  const frameRef = useRef<number | null>(null);

  const scheduleUpdate = useCallback(() => {
    if (frameRef.current !== null) return;
    frameRef.current = window.requestAnimationFrame(() => {
      frameRef.current = null;
      setVersion((v) => v + 1);
    });
  }, []);

  useEffect(
    () => () => {
      if (frameRef.current !== null) window.cancelAnimationFrame(frameRef.current);
    },
    [],
  );

  const clearOutput = useCallback(() => {
    logRef.current.clear();
    setClosed(false);
    scheduleUpdate();
  }, [scheduleUpdate]);

  const addOutput = useCallback(
    (line: PluginLine) => {
      logRef.current.add(line);
      scheduleUpdate();
    },
    [scheduleUpdate],
  );

  const closeOutput = useCallback(() => setClosed(true), []);

  return { output: { log: logRef.current, version, closed }, clearOutput, addOutput, closeOutput };
}

export function usePlugins(): Plugins {
  const [prefs, setPrefs] = useState(loadPluginPrefs);
  const [edits, setEdits] = useState(loadPluginEdits);
  const [lastPluginError, setLastPluginError] = useState<string | null>(null);
  const { output, clearOutput, addOutput, closeOutput } = usePluginOutput();

  useEffect(() => savePluginPrefs(prefs), [prefs]);
  // Saving is automatic, like project files: every edit is stored as it is typed.
  useEffect(() => savePluginEdits(edits), [edits]);

  const runPlugins = (): RunPlugins => ({
    enabledIds: prefs.enabledIds,
    files: prefs.showPage ? pluginRunFiles(prefs.enabledIds, edits) : [],
  });

  const runNotice = (): string | undefined => (prefs.showPage ? shippedChangedNotice(prefs.enabledIds, edits) : undefined);

  const recordError = useCallback((stage: string, text: string) => {
    if (stage === 'plugin') setLastPluginError(text);
  }, []);

  // READY means every file analysed, the edited plugin files included.
  const clearRunOutput = useCallback(() => {
    clearOutput();
    setLastPluginError(null);
  }, [clearOutput]);

  return {
    prefs,
    setPrefs,
    edits,
    setEdits,
    output,
    clearOutput: clearRunOutput,
    addOutput,
    closeOutput,
    runPlugins,
    runNotice,
    lastPluginError,
    recordError,
  };
}
