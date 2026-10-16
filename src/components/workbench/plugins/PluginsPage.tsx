// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import { useEffect, useMemo, useState } from 'react';
import { cx } from '../../board';
import { downloadSourceFile } from '../download';
import { EditorSurface } from '../EditorSurface';
import { ChipIcon, CloseIcon, DownloadIcon, RefreshIcon } from '../icons';
import type { LineDiagnostic } from '../diagnosticStore';
import { useFileSymbols } from '../symbols/useFileSymbols';
import { PLUGIN_CATALOG, SHARED_FILES, type PluginInfo } from './pluginCatalog';
import type { PluginPrefs } from './pluginPrefs';
import { withPluginEnabled } from './PluginSettings';
import {
  currentText,
  fileStatus,
  withEdit,
  withShippedAccepted,
  withoutEdit,
  type PluginEdits,
  type PluginFileStatus,
} from './pluginSources';
import '../CodeEditor.css';
import './PluginsPage.css';

export interface PluginsPageProps {
  prefs: PluginPrefs;
  onPrefsChange: (prefs: PluginPrefs) => void;
  edits: PluginEdits;
  onEditsChange: (edits: PluginEdits) => void;
  /** The last error an edited plugin file caused in a run (`stage: 'plugin'`), or null. */
  lastPluginError: string | null;
  onClose: () => void;
}

const STATUS_LABEL: Record<PluginFileStatus, string | undefined> = {
  shipped: undefined,
  edited: 'edited',
  shippedChanged: 'shipped file has changed',
};

/** Analysis errors of plugin files are shown above the editor, not as markers. */
const NO_MARKERS: readonly LineDiagnostic[] = [];

const isEdited = (name: string, edits: PluginEdits) => fileStatus(name, edits) !== 'shipped';

function StatusBadge({ status }: { status: PluginFileStatus }) {
  const label = STATUS_LABEL[status];
  return label === undefined ? null : <span className={cx('wb-pluginspage__badge', `is-${status}`)}>{label}</span>;
}

interface FileListProps {
  files: readonly string[];
  selected: string;
  edits: PluginEdits;
  onSelect: (name: string) => void;
}

function FileList({ files, selected, edits, onSelect }: FileListProps) {
  return (
    <ul className="wb-pluginspage__files">
      {files.map((name) => (
        <li key={name}>
          <button
            type="button"
            className={cx('wb-pluginspage__file', name === selected && 'is-selected')}
            aria-current={name === selected || undefined}
            onClick={() => onSelect(name)}
          >
            <span className="wb-pluginspage__file-name">{name}</span>
            <StatusBadge status={fileStatus(name, edits)} />
          </button>
        </li>
      ))}
    </ul>
  );
}

interface PluginRowProps {
  plugin: PluginInfo;
  prefs: PluginPrefs;
  onPrefsChange: (prefs: PluginPrefs) => void;
  edited: boolean;
}

/** Title, kinds and the enabled checkbox: the same setting as in the Settings dialog. */
function PluginRow({ plugin, prefs, onPrefsChange, edited }: PluginRowProps) {
  return (
    <label className="wb-pluginspage__plugin">
      <input
        type="checkbox"
        checked={prefs.enabledIds.has(plugin.id)}
        onChange={(e) => onPrefsChange(withPluginEnabled(prefs, plugin.id, e.target.checked))}
      />
      <span>
        <strong>{plugin.title}</strong>
        {edited && <span className="wb-pluginspage__badge is-edited">edited</span>}
        <span className="wb-pluginspage__kinds">kind: {plugin.kinds.join(', ')}</span>
      </span>
    </label>
  );
}

interface FileActionsProps {
  name: string;
  status: PluginFileStatus;
  canRevert: boolean;
  onReset: () => void;
  onRevert: () => void;
  onKeepMine: () => void;
  onExport: () => void;
}

function FileActions({ name, status, canRevert, onReset, onRevert, onKeepMine, onExport }: FileActionsProps) {
  return (
    <div className="wb-pluginspage__toolbar">
      <h3 className="wb-pluginspage__file-title">
        {name} <StatusBadge status={status} />
      </h3>
      {status === 'shippedChanged' && (
        <button type="button" className="wb-pluginspage__action" onClick={onKeepMine} title="Keep your edit and accept the new shipped file as its base">
          Keep mine
        </button>
      )}
      <button type="button" className="wb-pluginspage__action" onClick={onRevert} disabled={!canRevert} title="Undo the changes made since this file was opened here">
        Revert changes
      </button>
      <button type="button" className="wb-pluginspage__action" onClick={onReset} disabled={status === 'shipped'} title="Replace your edit with the shipped file">
        <RefreshIcon aria-hidden="true" />
        Reset to shipped
      </button>
      <button type="button" className="wb-pluginspage__action" onClick={onExport} title="Download this file">
        <DownloadIcon aria-hidden="true" />
        Export
      </button>
    </div>
  );
}

/** The editor on one plugin file; saving to this browser is automatic. */
function PluginFileEditor({ name, text, onChange }: { name: string; text: string; onChange: (text: string) => void }) {
  const file = useMemo(() => ({ id: `plugin:${name}`, name, content: text }), [name, text]);
  const symbols = useFileSymbols(file);
  if (symbols === undefined) return null;
  return (
    <div className="wb-editor wb-pluginspage__editor">
      <EditorSurface file={file} diagnostics={NO_MARKERS} onChange={(_id, content) => onChange(content)} symbols={symbols} label={`${name} (plugin file)`} />
    </div>
  );
}

/**
 * The Plugins page (docs/plugin_batch_implementation_plan.md § 7.4): the shipped plugin
 * VHDL files, editable. Edits are kept in this browser and sent with every run while the
 * page is switched on in Settings; the installed files are never changed.
 */
export function PluginsPage({ prefs, onPrefsChange, edits, onEditsChange, lastPluginError, onClose }: PluginsPageProps) {
  const [selected, setSelected] = useState<string>(PLUGIN_CATALOG[0]?.files[0] ?? SHARED_FILES[0]);
  // The text when the file was opened here, which Revert changes goes back to.
  const [openedText, setOpenedText] = useState(() => currentText(selected, edits));
  const text = currentText(selected, edits);
  const status = fileStatus(selected, edits);

  const select = (name: string) => {
    setSelected(name);
    setOpenedText(currentText(name, edits));
  };

  useEffect(() => {
    const onKeyDown = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape' && !(e.target instanceof HTMLTextAreaElement)) onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  return (
    <section className="wb-pluginspage" aria-labelledby="wb-pluginspage-title">
      <header className="wb-pluginspage__header">
        <ChipIcon className="wb-pluginspage__title-icon" aria-hidden="true" />
        <h2 id="wb-pluginspage-title" className="wb-pluginspage__title">
          Plugins
        </h2>
        <span className="wb-pluginspage__subtitle">Edited files are used in your runs; the installed files stay unchanged.</span>
        <button type="button" className="wb-pluginspage__close" onClick={onClose} aria-label="Close plugins" title="Close (Esc)">
          <CloseIcon aria-hidden="true" />
        </button>
      </header>
      <div className="wb-pluginspage__body">
        <nav className="wb-pluginspage__side" aria-label="Plugin files">
          <h3 className="wb-pluginspage__side-heading">Shared</h3>
          <FileList files={SHARED_FILES} selected={selected} edits={edits} onSelect={select} />
          {PLUGIN_CATALOG.map((plugin) => (
            <div key={plugin.id} className="wb-pluginspage__group">
              <PluginRow plugin={plugin} prefs={prefs} onPrefsChange={onPrefsChange} edited={plugin.files.some((name) => isEdited(name, edits))} />
              <FileList files={plugin.files} selected={selected} edits={edits} onSelect={select} />
            </div>
          ))}
        </nav>
        <div className="wb-pluginspage__main">
          <FileActions
            name={selected}
            status={status}
            canRevert={text !== openedText}
            onReset={() => onEditsChange(withoutEdit(edits, selected))}
            onRevert={() => onEditsChange(withEdit(edits, selected, openedText))}
            onKeepMine={() => onEditsChange(withShippedAccepted(edits, selected))}
            onExport={() => downloadSourceFile({ name: selected, content: text })}
          />
          {lastPluginError !== null && (
            <pre className="wb-pluginspage__error" role="alert">
              {lastPluginError}
            </pre>
          )}
          <PluginFileEditor name={selected} text={text} onChange={(next) => onEditsChange(withEdit(edits, selected, next))} />
        </div>
      </div>
    </section>
  );
}
