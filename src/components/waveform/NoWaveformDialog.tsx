// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * What the Waveform button says when there is nothing to show yet: run the testbench
 * first – and why a board simulation has no waveform (W1). One sentence and one way
 * forward (§ 8.6, S2).
 */

import { Dialog } from '../workbench/Dialog';
import { WaveformIcon } from './WaveformButton';

export interface NoWaveformDialogProps {
  readonly open: boolean;
  /** The last run was a board simulation, which records no waveform. */
  readonly afterBoardRun: boolean;
  readonly onClose: () => void;
}

export function NoWaveformDialog({ open, afterBoardRun, onClose }: NoWaveformDialogProps) {
  return (
    <Dialog open={open} onClose={onClose} title="No waveform yet" subtitle="Run the testbench first" icon={<WaveformIcon />} describedBy="wv-no-waveform-text">
      <p id="wv-no-waveform-text">
        {afterBoardRun
          ? 'The last run was a board simulation, and board simulations do not record a waveform. '
          : 'A waveform is recorded when a testbench runs. '}
        Open your testbench and press ▶ in its header (or Start), then press Waveform again.
      </p>
    </Dialog>
  );
}
