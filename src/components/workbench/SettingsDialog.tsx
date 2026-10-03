// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import { useState } from 'react';
import { Dialog } from './Dialog';
import { desktopBridge } from './desktop';
import { GearIcon } from './icons';
import type { SplitPreference } from './editorView';
import { APP_NAME, ISSUES_URL } from './project';
import { TEXT } from './testbenchText';
import './SettingsDialog.css';

export interface SettingsDialogProps {
  open: boolean;
  onClose: () => void;
  /** Editor → Testbench split view (docs/impl_split_screen.md § 4.2). */
  splitPreference: SplitPreference;
  onSplitPreferenceChange: (preference: SplitPreference) => void;
}

const SPLIT_CHOICES: readonly { value: SplitPreference; label: string; hint: string }[] = [
  { value: 'auto', label: TEXT.settingAuto, hint: TEXT.settingAutoHint },
  { value: 'always', label: TEXT.settingAlways, hint: TEXT.settingAlwaysHint },
  { value: 'never', label: TEXT.settingNever, hint: TEXT.settingNeverHint },
];

/** The split preference, a radio group; stored in this browser (localStorage). */
function SplitSetting({ value, onChange }: { value: SplitPreference; onChange: (p: SplitPreference) => void }) {
  return (
    <fieldset className="wb-settings__group">
      <legend className="wb-settings__heading">Editor &rsaquo; {TEXT.settingTitle}</legend>
      {SPLIT_CHOICES.map((c) => (
        <label key={c.value} className="wb-settings__option">
          <input type="radio" name="wb-split-preference" checked={value === c.value} onChange={() => onChange(c.value)} />
          <span>
            <strong>{c.label}</strong>
            <span className="wb-settings__note">{c.hint}</span>
          </span>
        </label>
      ))}
    </fieldset>
  );
}

const NEW_ISSUE = `${ISSUES_URL}/new`;

/**
 * Both builds have the testbench split preference. The desktop app also has — project storage — which
 * its preload exposes on `window.hdlboard` (desktop.ts); it applies on the
 * next launch. Either way the dialog points at the one thing a user can do
 * to change the program: open an issue. The two buttons open GitHub's new-issue page with a title
 * prefix, so a report arrives already sorted into bug or suggestion.
 */
export function SettingsDialog({ open, onClose, splitPreference, onSplitPreferenceChange }: SettingsDialogProps) {
  const bridge = desktopBridge();
  // What is stored for the next launch, not what this launch is running with.
  const [persist, setPersist] = useState(() => bridge?.enabled ?? false);
  const [saveError, setSaveError] = useState(false);

  const handlePersistChange = (next: boolean) => {
    if (!bridge) return;
    setPersist(next);
    setSaveError(false);
    bridge.setEnabled(next).catch(() => {
      setPersist(!next);
      setSaveError(true);
    });
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Settings"
      subtitle={APP_NAME}
      icon={<GearIcon />}
    >
      <SplitSetting value={splitPreference} onChange={onSplitPreferenceChange} />
      {bridge && (
        <div className="wb-settings__empty">
          <label className="wb-settings__option">
            <input
              type="checkbox"
              checked={persist}
              onChange={(e) => handlePersistChange(e.target.checked)}
            />
            <span>
              <strong>Keep my project between sessions</strong>
              <span className="wb-settings__note">
                Saves your files and open tabs on this computer and restores them
                when {APP_NAME} starts. Applies after restart.
              </span>
              {saveError && (
                <span className="wb-settings__note wb-settings__note--error" role="alert">
                  The setting could not be saved.
                </span>
              )}
            </span>
          </label>
        </div>
      )}

      <section className="wb-settings__help" aria-labelledby="wb-settings-help">
        <h3 id="wb-settings-help" className="wb-settings__heading">
          Help us improve it
        </h3>
        <p className="wb-dialog__lead">
          Found a bug, or missing something? Please create an issue in the
          GitHub repository. Suggestions and bug reports are very welcome
          &mdash; they are how this tool gets better for the next group of
          students.
        </p>

        <div className="wb-settings__actions">
          <a
            className="wb-settings__action wb-settings__action--primary"
            href={`${NEW_ISSUE}?title=${encodeURIComponent('Bug: ')}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            <span className="wb-settings__action-title">Report a bug</span>
            <span className="wb-settings__action-text">Something does not work as it should</span>
          </a>
          <a
            className="wb-settings__action"
            href={`${NEW_ISSUE}?title=${encodeURIComponent('Suggestion: ')}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            <span className="wb-settings__action-title">Suggest an improvement</span>
            <span className="wb-settings__action-text">An idea for a feature or a setting</span>
          </a>
        </div>

        <p className="wb-settings__browse">
          <a href={ISSUES_URL} target="_blank" rel="noopener noreferrer">
            Browse existing issues
          </a>{' '}
          &middot; a free GitHub account is needed to create one.
        </p>
      </section>

      <div className="wb-dialog__callout wb-dialog__callout--info" role="note">
        <p className="wb-dialog__callout-title">Reporting a bug?</p>
        <p>
          Tell us what you did, what you expected and what happened instead.
          Your VHDL code, the text in the console panel and the version shown
          in the About dialog make it much easier to reproduce.
        </p>
      </div>
    </Dialog>
  );
}

export default SettingsDialog;
