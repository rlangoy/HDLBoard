// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import { useEffect, useId, useRef } from 'react';
import { ExternalLink } from './ExternalLink';
import { BellIcon, CloseIcon, DownloadIcon } from './icons';
import type { Release } from './latestRelease';
import { APP_NAME } from './project';
import { usePopover } from './RoleIcon';
import './UpdateBell.css';

export interface UpdateBellProps {
  /** The newer release found; without one there is no bell. */
  readonly release: Release | null;
  /** Settings › Updates › Check for updates, which the notice can switch off too. */
  readonly checkEnabled: boolean;
  readonly onCheckEnabledChange: (on: boolean) => void;
}

/**
 * The header's bell: there only while a newer release is out, with a red badge
 * counting the one notice it can have. A click opens the notice: which version
 * is out, a link to its release page, and the start-up check's own switch.
 */
export function UpdateBell({ release, ...notice }: UpdateBellProps) {
  // Mounted only with a release, so a bell that goes and comes back starts closed.
  return release ? <BellWithNotice release={release} {...notice} /> : null;
}

interface BellWithNoticeProps extends UpdateBellProps {
  readonly release: Release;
}

function BellWithNotice({ release, checkEnabled, onCheckEnabledChange }: BellWithNoticeProps) {
  const { open, setOpen, rootRef } = usePopover<HTMLDivElement>();
  const bellRef = useRef<HTMLButtonElement>(null);
  // Later, ✕ and View release hand the focus back to the bell, as Escape does.
  const closeNotice = () => {
    setOpen(false);
    bellRef.current?.focus();
  };
  return (
    <div className="wb-update" ref={rootRef}>
      <button
        type="button"
        ref={bellRef}
        className="wb-header__action wb-update__bell"
        aria-label={`Update available: ${release.name}`}
        title="Update available"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        <BellIcon aria-hidden="true" />
        <span className="wb-update__badge" aria-hidden="true">1</span>
      </button>
      {open && (
        <UpdateNotice
          release={release}
          checkEnabled={checkEnabled}
          onCheckEnabledChange={onCheckEnabledChange}
          onClose={closeNotice}
        />
      )}
    </div>
  );
}

interface UpdateNoticeProps extends BellWithNoticeProps {
  readonly onClose: () => void;
}

function UpdateNotice({ release, checkEnabled, onCheckEnabledChange, onClose }: UpdateNoticeProps) {
  const titleId = useId();
  const viewRef = useRef<HTMLAnchorElement>(null);
  useEffect(() => viewRef.current?.focus(), []);
  return (
    <div className="wb-update__notice" role="dialog" aria-labelledby={titleId}>
      <span className="wb-update__icon" aria-hidden="true">
        <DownloadIcon />
      </span>
      <div className="wb-update__body">
        <p id={titleId} className="wb-update__title">Update available</p>
        <p className="wb-update__text">
          {APP_NAME} v{release.version} is now available.
        </p>
        <div className="wb-update__actions">
          <ExternalLink ref={viewRef} className="wb-update__view" href={release.url} onClick={onClose}>
            View release
          </ExternalLink>
          <button type="button" className="wb-update__later" onClick={onClose}>
            Later
          </button>
        </div>
        <label className="wb-update__check">
          <input type="checkbox" checked={checkEnabled} onChange={(e) => onCheckEnabledChange(e.target.checked)} />
          Check for updates when {APP_NAME} starts
        </label>
      </div>
      <button type="button" className="wb-update__close" aria-label="Close" onClick={onClose}>
        <CloseIcon aria-hidden="true" />
      </button>
    </div>
  );
}
