// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import { Dialog } from './Dialog';
import { ExternalLink } from './ExternalLink';
import { LOGO_DATA_URI } from './logo';
import { APP_NAME, ELECTRON_URL, GHDL_URL, ICARUS_URL, REACT_URL, REPO_URL, TYPESCRIPT_URL, VITE_URL, WS_URL } from './project';
import type { UpdateStatus } from './useUpdateCheck';
import './AboutDialog.css';

export interface AboutDialogProps {
  open: boolean;
  onClose: () => void;
  /** About › Updates: what the last update check found, and a way to check again (useUpdateCheck.ts). Left out: no Updates row. */
  updates?: UpdateCheckView;
}

export interface UpdateCheckView {
  readonly status: UpdateStatus;
  /** Asks GitHub now, even with the start-up check off: the user asked. */
  readonly onCheck: () => void;
}

const CHECK_LABEL: Record<UpdateStatus['kind'], string> = {
  unchecked: 'Check now',
  checking: 'Checking…',
  upToDate: 'Check again',
  available: 'Check again',
  failed: 'Try again',
};

function UpdateStatusMessage({ status }: { status: UpdateStatus }) {
  switch (status.kind) {
    case 'unchecked':
      return <>Not checked yet.</>;
    case 'checking':
      return <>Asking GitHub for the latest release.</>;
    case 'upToDate':
      return <>Up to date &mdash; the latest release is v{status.latest.version}.</>;
    case 'available':
      return (
        <>
          <strong>v{status.latest.version} is available.</strong>{' '}
          <ExternalLink href={status.latest.url}>View release</ExternalLink>
        </>
      );
    case 'failed':
      return <>Could not check for updates ({status.reason}).</>;
  }
}

/**
 * Whether this is the latest version, and a button to find out (again). The button
 * stays while a check runs, inert, so a keyboard user's focus stays on it.
 */
export function UpdateStatusText({ status, onCheck }: UpdateCheckView) {
  const checking = status.kind === 'checking';
  return (
    <>
      <UpdateStatusMessage status={status} />{' '}
      <button type="button" className="wb-about__check" aria-disabled={checking || undefined} onClick={checking ? undefined : onCheck}>
        {CHECK_LABEL[status.kind]}
      </button>
    </>
  );
}

/**
 * The About box: what the program is, where its source lives, who wrote
 * it, under what terms, and — expected of a GPL program with an
 * interactive interface — that it comes with no warranty.
 */
export function AboutDialog({ open, onClose, updates }: AboutDialogProps) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={APP_NAME}
      subtitle={`Version ${__APP_VERSION__}`}
      icon={<img src={LOGO_DATA_URI} alt="" />}
      describedBy="wb-about-notice"
    >
      <p className="wb-dialog__lead">
        Write VHDL or Verilog and watch it run on a virtual board. Your designs run on
        real GHDL or Icarus Verilog, with the board&rsquo;s switches, buttons, LEDs and 7-segment
        displays on screen.
      </p>

      <dl className="wb-about__facts">
        {updates && (
          <div className="wb-about__fact">
            <dt>Updates</dt>
            <dd aria-live="polite">
              <UpdateStatusText {...updates} />
            </dd>
          </div>
        )}
        <div className="wb-about__fact">
          <dt>Source code</dt>
          <dd>
            <a href={REPO_URL} target="_blank" rel="noopener noreferrer">
              {REPO_URL}
            </a>
          </dd>
        </div>
        <div className="wb-about__fact">
          <dt>Copyright</dt>
          <dd>Copyright &copy; 2026 Rune Langøy</dd>
        </div>
        <div className="wb-about__fact">
          <dt>License</dt>
          <dd>
            GNU General Public License, version 2{' '}
            <span className="wb-about__nowrap">(GPL-2.0-only)</span>
          </dd>
        </div>
        <div className="wb-about__fact">
          <dt>Developed at</dt>
          <dd>
            USN &ndash; University of South-Eastern Norway, for use in its
            introductory course in VHDL programming.
          </dd>
        </div>
        <div className="wb-about__fact">
          <dt>Simulation engines</dt>
          <dd>
            <a href={GHDL_URL} target="_blank" rel="noopener noreferrer">
              GHDL
            </a>{' '}
            (GPL-2.0),{' '}
            <a href={ICARUS_URL} target="_blank" rel="noopener noreferrer">
              Icarus Verilog
            </a>{' '}
            (GPL-2.0 or later)
          </dd>
        </div>
        <div className="wb-about__fact">
          <dt>Built with</dt>
          <dd>
            <a href={REACT_URL} target="_blank" rel="noopener noreferrer">
              React
            </a>{' '}
            (MIT),{' '}
            <a href={WS_URL} target="_blank" rel="noopener noreferrer">
              ws
            </a>{' '}
            (MIT),{' '}
            <a href={ELECTRON_URL} target="_blank" rel="noopener noreferrer">
              Electron
            </a>{' '}
            (MIT; includes Chromium and Node.js), and the build tools{' '}
            <a href={VITE_URL} target="_blank" rel="noopener noreferrer">
              Vite
            </a>{' '}
            and{' '}
            <a href={TYPESCRIPT_URL} target="_blank" rel="noopener noreferrer">
              TypeScript
            </a>
            . Thanks to all of their authors and contributors.
          </dd>
        </div>
        <div className="wb-about__fact">
          <dt>Trademarks</dt>
          <dd>
            DE1-SoC and DE10-Lite are products of Terasic Technologies. Basys 3
            and Nexys A7 are products of Digilent. HDLBoard is an independent
            teaching tool, not affiliated with or endorsed by Terasic or Digilent.
          </dd>
        </div>
      </dl>

      <div id="wb-about-notice" className="wb-dialog__callout" role="note">
        <p className="wb-dialog__callout-title">Absolutely no warranty</p>
        <p>
          This program comes with <strong>ABSOLUTELY NO WARRANTY</strong>{' '}
          &mdash; use it at your own risk.
        </p>
        <p>
          The program is free: you may use it, share it and change it under the
          terms of the GNU General Public License, version 2.
        </p>
      </div>
    </Dialog>
  );
}

export default AboutDialog;
