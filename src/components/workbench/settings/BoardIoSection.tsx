// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import { useId } from 'react';
import { cx } from '../../board';
import type { BoardLayout } from '../boardLayoutPreference';
import { BoardSetting, type BoardSettingProps } from '../BoardSetting';
import { BOARD_TEXT } from '../boardText';
import { PageCard } from '../page/PageCard';
import { SettingSwitch } from './SettingSwitch';
import type { Setting } from './settingsSections';

export interface BoardIoSectionProps {
  /** The boards available here, and the open project's (docs/board_io_config_spec.md § 3.2). */
  board: BoardSettingProps;
  layout: Setting<BoardLayout>;
  /** The Pushbuttons panel offers "Bouncy" contacts (useBouncyOption.ts); on by default. */
  bouncyButtons: Setting<boolean>;
}

/** Settings › Board & I/O: which board, how its panels are laid out, and how its buttons behave. */
export function BoardIoSection({ board, layout, bouncyButtons }: BoardIoSectionProps) {
  return (
    <>
      <PageCard title={BOARD_TEXT.settingTitle}>
        <BoardSetting {...board} />
      </PageCard>
      <BoardLayoutCard layout={layout} />
      <PageCard title="Pushbuttons" wide>
        <SettingSwitch
          label="Offer bouncy pushbuttons"
          description="The Pushbuttons panel's menu lets you pick Bouncy contacts, which give several edges per press like real buttons. Off: the choice is hidden and every press is one clean edge."
          setting={bouncyButtons}
        />
      </PageCard>
    </>
  );
}

interface LayoutChoice {
  readonly value: BoardLayout;
  readonly label: string;
  readonly columns: number;
}

const LAYOUT_CHOICES: readonly LayoutChoice[] = [
  { value: 'single-column', label: BOARD_TEXT.layoutSingle, columns: 1 },
  { value: 'two-columns', label: BOARD_TEXT.layoutTwo, columns: 2 },
];

function BoardLayoutCard({ layout }: { layout: Setting<BoardLayout> }) {
  const groupName = useId();
  return (
    <PageCard title={BOARD_TEXT.layoutTitle}>
      <div className="wb-settings-layouts">
        {LAYOUT_CHOICES.map(({ value, label, columns }) => {
          const selected = layout.value === value;
          return (
            <label key={value} className={cx('wb-settings-choice wb-settings-layout', selected && 'is-selected')}>
              <input type="radio" className="wb-settings-layout__input" name={groupName} value={value} checked={selected} onChange={() => layout.onChange(value)} />
              <span className="wb-settings-layout__check" aria-hidden="true">✓</span>
              <span className="wb-settings-layout__icon" aria-hidden="true">
                {Array.from({ length: columns }, (_, column) => <span key={column} />)}
              </span>
              <span>{label}</span>
            </label>
          );
        })}
      </div>
    </PageCard>
  );
}
