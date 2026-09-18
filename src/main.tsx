// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { LOGO_DATA_URI } from './components/workbench/logo';
import './index.css';

// Set here, not in index.html: the logo is a data URI computed from the
// actual SVG file (`logo.ts`), so this is the one place that needs to
// know it exists, rather than a second copy hand-encoded into the HTML.
const favicon = document.createElement('link');
favicon.rel = 'icon';
favicon.type = 'image/svg+xml';
favicon.href = LOGO_DATA_URI;
document.head.appendChild(favicon);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
