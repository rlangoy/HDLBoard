// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import { createContext, useContext } from 'react';
import type { FindController } from './useFind';

/**
 * The search of the pane a component sits in (docs/impl_search.md D4). Pane headers
 * are built outside the pane (splitPaneModels.tsx), so the Search button reaches its
 * pane's search through this; null outside a pane showing a file.
 */
export const FindContext = createContext<FindController | null>(null);

export const usePaneFind = (): FindController | null => useContext(FindContext);
