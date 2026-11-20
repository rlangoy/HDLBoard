// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import { PageCard } from '../page/PageCard';
import { DESIGN_CHECK_TEXT } from '../simOnly/designCheckText';
import type { DesignCheckMode } from '../simOnly/types';
import { ChoiceCard, ChoiceList, type Choice } from './ChoiceCard';
import { SettingSwitch } from './SettingSwitch';
import type { Setting } from './settingsSections';

export interface SimulationSectionProps {
  /** Whether designs are checked for FPGA synthesis (docs/impl_sim_only_warnings.md § 6). */
  designCheck?: Setting<DesignCheckMode>;
  /** *Synthesis* also runs GHDL's own check at Start, for VHDL (docs/impl_sim_only_warnings.md § 7); off by default. */
  toolCheck?: Setting<boolean>;
  /** Waveforms are recorded for testbench runs (docs/waveform_viewer_spec.md FR-1); on by default. */
  recordWaves: Setting<boolean>;
}

type ToolCheckChoice = 'quick' | 'tool';

const TOOL_CHECK_CHOICES: readonly Choice<ToolCheckChoice>[] = [
  { value: 'quick', label: DESIGN_CHECK_TEXT.quickCheck, hint: DESIGN_CHECK_TEXT.quickCheckHint },
  { value: 'tool', label: DESIGN_CHECK_TEXT.toolCheck, hint: DESIGN_CHECK_TEXT.toolCheckHint },
];

/** The on/off tool check as the two choices the card shows. */
const asToolChoice = (toolCheck: Setting<boolean>): Setting<ToolCheckChoice> => ({
  value: toolCheck.value ? 'tool' : 'quick',
  onChange: (choice) => toolCheck.onChange(choice === 'tool'),
});

/** The mode's choices; under *Synthesis*, how it checks, choosable only while *Synthesis* is chosen. */
function designCheckChoices(mode: DesignCheckMode, toolCheck: Setting<boolean> | undefined): readonly Choice<DesignCheckMode>[] {
  const nested = toolCheck && (
    <ChoiceList choices={TOOL_CHECK_CHOICES} setting={asToolChoice(toolCheck)} disabled={mode !== 'synthesis'} label={DESIGN_CHECK_TEXT.toolCheckTitle} />
  );
  return [
    { value: 'synthesis', label: DESIGN_CHECK_TEXT.synthesis, hint: DESIGN_CHECK_TEXT.synthesisHint, ...(nested && { nested }) },
    { value: 'simulation', label: DESIGN_CHECK_TEXT.simulation, hint: DESIGN_CHECK_TEXT.simulationHint },
  ];
}

/** Settings › Simulation: what a run checks the design for, and what it records. */
export function SimulationSection({ designCheck, toolCheck, recordWaves }: SimulationSectionProps) {
  return (
    <>
      {designCheck && <ChoiceCard title={DESIGN_CHECK_TEXT.title} choices={designCheckChoices(designCheck.value, toolCheck)} setting={designCheck} />}
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
