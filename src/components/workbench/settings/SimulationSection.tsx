// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import { PageCard } from '../page/PageCard';
import { DESIGN_CHECK_TEXT } from '../simOnly/designCheckText';
import type { DesignCheckMode } from '../simOnly/types';
import { ChoiceCard, type Choice } from './ChoiceCard';
import { SettingSwitch } from './SettingSwitch';
import type { Setting } from './settingsSections';

export interface SimulationSectionProps {
  /** Whether designs are checked for FPGA synthesis (docs/impl_sim_only_warnings.md § 6). */
  designCheck?: Setting<DesignCheckMode>;
  /** Waveforms are recorded for testbench runs (docs/waveform_viewer_spec.md FR-1); on by default. */
  recordWaves: Setting<boolean>;
}

const DESIGN_CHECK_CHOICES: readonly Choice<DesignCheckMode>[] = [
  { value: 'synthesis', label: DESIGN_CHECK_TEXT.synthesis, hint: DESIGN_CHECK_TEXT.synthesisHint },
  { value: 'simulation', label: DESIGN_CHECK_TEXT.simulation, hint: DESIGN_CHECK_TEXT.simulationHint },
];

/** Settings › Simulation: what a run checks the design for, and what it records. */
export function SimulationSection({ designCheck, recordWaves }: SimulationSectionProps) {
  return (
    <>
      {designCheck && <ChoiceCard title={DESIGN_CHECK_TEXT.title} choices={DESIGN_CHECK_CHOICES} setting={designCheck} />}
      <PageCard title="Waveforms" wide>
        <SettingSwitch
          label="Record waveforms for testbench runs"
          description="After a testbench run, Waveform beside Clear shows what every signal did. Board simulations do not record waveforms."
          setting={recordWaves}
        />
      </PageCard>
    </>
  );
}
