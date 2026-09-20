// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import { Dialog } from './Dialog';
import { APP_NAME, ISSUES_URL } from './project';
import './SettingsDialog.css';

export interface SettingsDialogProps {
  open: boolean;
  onClose: () => void;
}

/** A gear, drawn to sit in the dialog's white badge. */
function GearIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="3.2" />
      <path d="M19.4 13.5a7.6 7.6 0 0 0 0-3l1.9-1.5-2-3.4-2.3.9a7.6 7.6 0 0 0-2.6-1.5L14 2.5h-4l-.4 2.5a7.6 7.6 0 0 0-2.6 1.5l-2.3-.9-2 3.4 1.9 1.5a7.6 7.6 0 0 0 0 3l-1.9 1.5 2 3.4 2.3-.9a7.6 7.6 0 0 0 2.6 1.5l.4 2.5h4l.4-2.5a7.6 7.6 0 0 0 2.6-1.5l2.3.9 2-3.4z" />
    </svg>
  );
}

const NEW_ISSUE = `${ISSUES_URL}/new`;

/**
 * There is nothing to configure yet, so instead of an empty form this says
 * so and points at the one thing a user can do to change the program:
 * open an issue. The two buttons open GitHub's new-issue page with a title
 * prefix, so a report arrives already sorted into bug or suggestion.
 */
export function SettingsDialog({ open, onClose }: SettingsDialogProps) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Settings"
      subtitle={APP_NAME}
      icon={<GearIcon />}
    >
      <p className="wb-dialog__lead wb-settings__empty">
        <strong>No settings are available for now.</strong> {APP_NAME} works out
        of the box &mdash; nothing needs configuring yet :)
      </p>

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
