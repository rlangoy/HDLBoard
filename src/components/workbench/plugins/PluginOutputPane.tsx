// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import { useEffect, useLayoutEffect, useMemo, useRef, useState, type UIEvent } from 'react';
import { copyText } from '../clipboard';
import { CheckIcon, CloseIcon, CopyIcon } from '../icons';
import { hdlbLine } from './pluginFrame';
import type { PluginEntry } from './pluginLog';
import { visibleRows } from './paneGeometry';
import { formatSimTime } from './simTime';
import type { PluginOutputView } from './usePlugins';
import './PluginOutputPane.css';

/** Must match `.wb-plugins-out__row`'s height in PluginOutputPane.css. */
const ROW_HEIGHT_PX = 20;
/** Within this distance of the bottom, the list follows new rows; scrolled further up, it stays put. */
const FOLLOW_SLACK_PX = 4;
const COPIED_MS = 1500;

export interface PluginOutputPaneProps {
  output: PluginOutputView;
  onClose: () => void;
}

const plural = (n: number, noun: string) => `${n} ${noun}${n === 1 ? '' : 's'}`;

function PluginRow({ entry, top }: { entry: PluginEntry; top: number }) {
  return (
    <div className="wb-plugins-out__row" role="row" style={{ top }}>
      <span className="wb-plugins-out__time" role="cell" title={`${entry.timeNs} ns`}>
        {formatSimTime(entry.timeNs)}
      </span>
      <span className="wb-plugins-out__kind" role="cell">
        {entry.kind}
      </span>
      <span className="wb-plugins-out__instance" role="cell">
        {entry.instance}
      </span>
      <span className="wb-plugins-out__payload" role="cell">
        {entry.payload}
      </span>
    </div>
  );
}

/** Copies every kept line in the form the simulator printed it. */
function CopyLinesButton({ rows }: { rows: readonly PluginEntry[] }) {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return undefined;
    const timer = window.setTimeout(() => setCopied(false), COPIED_MS);
    return () => window.clearTimeout(timer);
  }, [copied]);
  const copy = async () => setCopied(await copyText(rows.map(hdlbLine).join('\n')));
  return (
    <button
      type="button"
      className="wb-console__clear"
      onClick={() => void copy()}
      disabled={rows.length === 0}
      title="Copy the lines as @@HDLB lines, for a bug report or a test fixture"
    >
      {copied ? <CheckIcon className="wb-console__clear-icon" aria-hidden="true" /> : <CopyIcon className="wb-console__clear-icon" aria-hidden="true" />}
      {copied ? 'Copied' : 'Copy'}
    </button>
  );
}

/**
 * "Plugin output" beside the console (docs/plugin_batch_implementation_plan.md § 7.3):
 * one row per PLUGIN frame, raw, in arrival order. Only the rows on screen are drawn, so
 * a run that fills the log to its limit stays smooth; the list follows new rows while it
 * is scrolled to the bottom.
 */
export function PluginOutputPane({ output, onClose }: PluginOutputPaneProps) {
  const { log, version } = output;
  // The log is mutated in place; `version` says when to read it again.
  const rows = useMemo(() => log.rows(), [log, version]);
  const dropped = log.dropped;
  const bodyRef = useRef<HTMLDivElement>(null);
  const followRef = useRef(true);
  const [viewport, setViewport] = useState({ scrollTop: 0, height: 0 });

  useLayoutEffect(() => {
    const body = bodyRef.current;
    if (!body) return;
    if (followRef.current) body.scrollTop = body.scrollHeight;
    setViewport({ scrollTop: body.scrollTop, height: body.clientHeight });
  }, [rows.length]);

  useEffect(() => {
    const body = bodyRef.current;
    if (!body) return undefined;
    const observer = new ResizeObserver(() => setViewport({ scrollTop: body.scrollTop, height: body.clientHeight }));
    observer.observe(body);
    return () => observer.disconnect();
  }, []);

  const handleScroll = (e: UIEvent<HTMLDivElement>) => {
    const { scrollTop, scrollHeight, clientHeight } = e.currentTarget;
    followRef.current = scrollHeight - scrollTop - clientHeight <= FOLLOW_SLACK_PX;
    setViewport({ scrollTop, height: clientHeight });
  };

  const { start, end } = visibleRows(viewport.scrollTop, viewport.height, ROW_HEIGHT_PX, rows.length);

  return (
    <section className="wb-plugins-out" aria-label="Plugin output">
      <div className="wb-console__header">
        <h2 className="wb-console__title">
          Plugin output <span className="wb-plugins-out__count">{plural(rows.length, 'line')}</span>
        </h2>
        <div className="wb-plugins-out__actions">
          <CopyLinesButton rows={rows} />
          <button type="button" className="wb-plugins-out__close" onClick={onClose} aria-label="Close plugin output" title="Close until the next run">
            <CloseIcon aria-hidden="true" />
          </button>
        </div>
      </div>
      <div className="wb-plugins-out__columns" aria-hidden="true">
        <span>Time</span>
        <span>Kind</span>
        <span>Instance</span>
        <span>Payload</span>
      </div>
      <div className="wb-plugins-out__body" ref={bodyRef} onScroll={handleScroll} role="table" aria-label="Plugin lines">
        {dropped > 0 && <p className="wb-plugins-out__dropped">{plural(dropped, 'earlier line')} not shown</p>}
        <div className="wb-plugins-out__rows" style={{ height: rows.length * ROW_HEIGHT_PX }} role="rowgroup">
          {rows.slice(start, end).map((entry, i) => (
            <PluginRow key={entry.seq} entry={entry} top={(start + i) * ROW_HEIGHT_PX} />
          ))}
        </div>
      </div>
    </section>
  );
}
