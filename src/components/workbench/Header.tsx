import './Header.css';

/**
 * The workbench's top bar — product name, the tool badges it composes
 * (GHDL, the web IDE shell, the DE1-SoC board style), and the two
 * always-present chrome actions.
 */
export function Header() {
  return (
    <header className="wb-header">
      <div className="wb-header__brand">
        <span className="wb-header__logo" aria-hidden="true">
          <span className="wb-header__logo-cell" />
          <span className="wb-header__logo-cell" />
          <span className="wb-header__logo-cell" />
          <span className="wb-header__logo-cell" />
        </span>
        <span className="wb-header__title">VHDL Simulator</span>
        <span className="wb-header__tagline">
          GHDL <span className="wb-header__dot">•</span> Web IDE{' '}
          <span className="wb-header__dot">•</span> DE1-SoC Style
        </span>
      </div>
      <div className="wb-header__actions">
        <button type="button" className="wb-header__action">
          <span className="wb-icon wb-icon--gear" aria-hidden="true" />
          Settings
        </button>
        <button type="button" className="wb-header__action">
          <span className="wb-icon wb-icon--help" aria-hidden="true">
            ?
          </span>
          Help
        </button>
      </div>
    </header>
  );
}

export default Header;
