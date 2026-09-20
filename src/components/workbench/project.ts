// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/** The product name, as it appears in the title bar and every dialog. */
export const APP_NAME = 'HDLBoard';

/** The one-liner that follows the name — title bar, README, installer. */
export const APP_TAGLINE = 'Write VHDL and watch it run';

/** Where the project lives — shown in the dialogs, opened in the user's browser. */
export const REPO_URL = 'https://github.com/rlangoy/HDLBoard';

/** Where suggestions and bug reports go. */
export const ISSUES_URL = `${REPO_URL}/issues`;

/** GHDL, the simulation engine — credited in the About dialog. */
export const GHDL_URL = 'https://github.com/ghdl/ghdl';

/**
 * Dispatched on `window` to open the About dialog from outside React. The
 * desktop app's native Help → About menu item (winInstaller/electron/
 * main.js) fires it, so the menu and the header button show the very same
 * dialog. Keep the string in step with that file.
 */
export const ABOUT_EVENT = 'hdl-board:show-about';
