// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import { SettingsCard } from './SettingsCard';
import { SettingSwitch } from './SettingSwitch';
import type { Setting } from './settingsSections';

export interface SimulationSectionProps {
  /** Waveforms are recorded for testbench runs (docs/waveform_viewer_spec.md FR-1); on by default. */
  recordWaves: Setting<boolean>;
}

/** Settings › Simulation: what a run records. */
export function SimulationSection({ recordWaves }: SimulationSectionProps) {
  return (
    <SettingsCard title="Waveforms" wide>
      <SettingSwitch
        label="Record waveforms for testbench runs"
        description="After a testbench run, Waveform beside Clear shows what every signal did. Board simulations do not record waveforms."
        setting={recordWaves}
      />
    </SettingsCard>
  );
}
