// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import { LOGO_DATA_URI } from './logo';
import './Header.css';

export interface HeaderProps {
  /** Opens the Settings dialog. */
  onSettings?: () => void;
  /** Opens the Help dialog. */
  onHelp?: () => void;
  /** Opens the About dialog. */
  onAbout?: () => void;
}

/**
 * The workbench's top bar — product name, the tool badges it composes
 * (GHDL, the web IDE shell, the DE1-SoC board style), and the
 * always-present chrome actions (Settings, Help, About), each of which
 * opens a dialog owned by `<Workbench>`.
 */
export function Header({ onSettings, onHelp, onAbout }: HeaderProps) {
  return (
    <header className="wb-header">
      <div className="wb-header__brand">
        <img src={LOGO_DATA_URI} alt="" className="wb-header__logo" />
        <span className="wb-header__title">VHDL Simulator</span>
        <span className="wb-header__tagline">
          GHDL <span className="wb-header__dot">•</span> Web IDE{' '}
          <span className="wb-header__dot">•</span> DE1-SoC Style
        </span>
      </div>
      <div className="wb-header__actions">
        <button type="button" className="wb-header__action" onClick={onSettings}>
          <span className="wb-icon wb-icon--gear" aria-hidden="true" />
          Settings
        </button>
        <button type="button" className="wb-header__action" onClick={onHelp}>
          <span className="wb-icon wb-icon--help" aria-hidden="true">
            ?
          </span>
          Help
        </button>
        <button type="button" className="wb-header__action" onClick={onAbout}>
          <span className="wb-icon wb-icon--help" aria-hidden="true">
            i
          </span>
          About
        </button>
      </div>
    </header>
  );
}

export default Header;
