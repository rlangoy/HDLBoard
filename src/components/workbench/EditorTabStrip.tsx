// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import { useEffect, useRef, type ReactNode } from 'react';
import { cx } from '../board';
import { countSeverities, type DiagnosticsByFile, type LineDiagnostic } from './diagnosticStore';
import type { EditorTab } from './EditorSurface';
import { SimToggle } from './SimToggle';

/** Which tab carries the play/stop icon, and what it shows and does (SimToggle). */
export interface TabRunControl {
  tabId: string;
  /** A simulation is running this tab's file: Stop rather than Play. */
  running: boolean;
  disabled: boolean;
  /** Start the run (Play) or stop it (Stop). */
  onClick: () => void;
}

const NO_LINES: readonly LineDiagnostic[] = [];

/** Hidden text after a tab's name, so the dot is not the only cue: ", 2 errors". */
function tabProblemsText(lines: readonly LineDiagnostic[]): string {
  const { errors, warnings } = countSeverities(lines);
  const parts = [
    errors > 0 && `${errors} error${errors === 1 ? '' : 's'}`,
    warnings > 0 && `${warnings} warning${warnings === 1 ? '' : 's'}`,
  ].filter(Boolean);
  return parts.length > 0 ? `, ${parts.join(', ')}` : '';
}

export interface EditorTabStripProps {
  tabs: EditorTab[];
  activeTabId: string | null;
  /** The split's other shown file: drawn lighter than the active tab (docs/impl_split_screen.md § 4.1). */
  visibleTabId?: string | null;
  onSelectTab: (id: string) => void;
  onCloseTab: (id: string) => void;
  onAddTab: () => void;
  tabRun?: TabRunControl | null;
  diagnostics: DiagnosticsByFile;
  /** The role icon before a tab's name (§ 4.5); none -> nothing extra. */
  tabIcon?: (tabId: string) => ReactNode;
  /** Shown at the strip's right end: the suggestion chip and the view switch. */
  children?: ReactNode;
}

export function EditorTabStrip({
  tabs,
  activeTabId,
  visibleTabId,
  onSelectTab,
  onCloseTab,
  onAddTab,
  tabRun,
  diagnostics,
  tabIcon,
  children,
}: EditorTabStripProps) {
  const tabsRef = useRef<HTMLDivElement>(null);

  // Keep the active tab in sight when many tabs overflow the strip, e.g. after
  // opening a file from the Files panel. Only the strip scrolls, never the page.
  useEffect(() => {
    const strip = tabsRef.current;
    const tab = strip?.querySelector<HTMLElement>('.wb-editor__tab.is-active');
    if (!strip || !tab) return;
    const stripBox = strip.getBoundingClientRect();
    const tabBox = tab.getBoundingClientRect();
    if (tabBox.left < stripBox.left) strip.scrollLeft -= stripBox.left - tabBox.left;
    else if (tabBox.right > stripBox.right) strip.scrollLeft += tabBox.right - stripBox.right;
  }, [activeTabId, tabs.length]);

  const strip = (
    <div className="wb-editor__tabs" role="tablist" ref={tabsRef}>
      {tabs.map((tab) => {
        const tabLines = diagnostics[tab.id] ?? NO_LINES;
        const { errors, warnings } = countSeverities(tabLines);
        return (
          <div
            key={tab.id}
            role="tab"
            tabIndex={0}
            aria-selected={tab.id === activeTabId}
            className={cx(
              'wb-editor__tab',
              tab.id === activeTabId && 'is-active',
              tab.id !== activeTabId && tab.id === visibleTabId && 'is-visible',
              errors > 0 && 'has-errors',
              errors === 0 && warnings > 0 && 'has-warnings',
            )}
            onClick={() => onSelectTab(tab.id)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') onSelectTab(tab.id);
            }}
          >
            {tabRun?.tabId === tab.id && (
              <SimToggle
                className="wb-editor__tab-run"
                fileName={tab.name}
                running={tabRun.running}
                disabled={tabRun.disabled}
                onClick={tabRun.onClick}
              />
            )}
            {tabIcon?.(tab.id)}
            <span className="wb-editor__tab-name">
              {tab.name}
              <span className="wb-sr-only">{tabProblemsText(tabLines)}</span>
            </span>
            <button
              type="button"
              className="wb-editor__tab-close"
              aria-label={`Close ${tab.name}`}
              onClick={(e) => {
                e.stopPropagation();
                onCloseTab(tab.id);
              }}
            >
              ×
            </button>
          </div>
        );
      })}
      <button type="button" className="wb-editor__tab-add" aria-label="New file" onClick={onAddTab}>
        +
      </button>
    </div>
  );

  if (!children) return strip;
  return (
    <div className="wb-editor__tabbar">
      {strip}
      <div className="wb-editor__tabbar-end">{children}</div>
    </div>
  );
}
