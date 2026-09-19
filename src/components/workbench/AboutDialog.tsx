// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import { Dialog } from './Dialog';
import { LOGO_DATA_URI } from './logo';
import { GHDL_URL, REPO_URL } from './project';
import './AboutDialog.css';

export interface AboutDialogProps {
  open: boolean;
  onClose: () => void;
}

/**
 * The About box: what the program is, where its source lives, who wrote
 * it, under what terms, and — expected of a GPL program with an
 * interactive interface — that it comes with no warranty.
 */
export function AboutDialog({ open, onClose }: AboutDialogProps) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="DE1-SoC VHDL Workbench"
      subtitle={`Version ${__APP_VERSION__}`}
      icon={<img src={LOGO_DATA_URI} alt="" />}
      describedBy="wb-about-notice"
    >
      <p className="wb-dialog__lead">
        A VHDL IDE and DE1-SoC board simulator. Your designs run on real GHDL,
        with the board&rsquo;s switches, buttons, LEDs and 7-segment displays on
        screen.
      </p>

      <dl className="wb-about__facts">
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
          <dt>Simulation engine</dt>
          <dd>
            <a href={GHDL_URL} target="_blank" rel="noopener noreferrer">
              GHDL
            </a>{' '}
            (GPL-2.0)
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
