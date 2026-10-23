// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * The open project's saved waveform views, as the waveform viewer reads and writes them
 * (docs/imp_wave_rearange.md § 11). Stable across renders: the viewer reads the project
 * as it is when a waveform arrives, and a save goes into the project's state, so Save
 * project writes it to `.hdlboard.json`.
 */

import { useMemo, useRef, type Dispatch, type SetStateAction } from 'react';
import type { SavedViews } from '../waveform/useSavedView';
import { waveViewOf } from '../../project/waveViews';
import { withWaveView, type OpenProject } from './projectFile';

export function useProjectWaveViews(project: OpenProject, setProject: Dispatch<SetStateAction<OpenProject>>): SavedViews {
  const latest = useRef(project);
  latest.current = project;
  return useMemo(
    () => ({
      of: (testbench) => waveViewOf(latest.current.waveViews, testbench),
      save: (testbench, next) => setProject((open) => withWaveView(open, testbench, next(waveViewOf(open.waveViews, testbench)))),
    }),
    [setProject],
  );
}
