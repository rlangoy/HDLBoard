// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import { useState } from 'react';
import { Board, type BitVector } from '../board';
import { PushbuttonCross, Pushbuttons, ResetButton, releasedLevel } from '../Pushbuttons';
import { SevenSegmentDisplays } from '../SevenSegment';
import { BouncyBadge, CollapsedPanelButton, CollapsePanelMenu, GroupedIoPanel, VisibilityDialog } from './GroupedIoPanel';
import { buttonCount, displayCount, groupNames, hasDecimalPoint, type BoardInputs, type BoardOutputs } from '../../boards/boardShape';
import type { BoardDefinition } from '../../boards/types';
import type { BoardLayout } from './boardLayoutPreference';
import { buttonsTitle, displaysTitle, ledsTitle, switchesTitle } from './boardText';
import type { ButtonBounce, DisplaySettings, IoDisplaySettings } from '../../project/types';
import { visibleIndices, withVisibleIndices } from '../../project/displaySettings';

export interface BoardIoPanelProps {
  /** The active board: its shape decides the parts, its names head the panels. */
  board: BoardDefinition;
  layout?: BoardLayout;
  outputs: BoardOutputs;
  inputs: BoardInputs;
  /** The inputs that changed; the others keep their latest values, even before the next render. */
  onInputsChange: (changed: Partial<BoardInputs>) => void;
  displaySettings?: DisplaySettings;
  onDisplaySettingsChange?: (kind: 'leds' | 'switches', settings: IoDisplaySettings) => void;
  onDisplayVisibilityChange?: (settings: NonNullable<DisplaySettings['sevenSegment']>) => void;
  /** Whether the pushbuttons bounce like real contacts; default `none`. */
  buttonBounce?: ButtonBounce;
  onButtonBounceChange?: (bounce: ButtonBounce) => void;
}

/**
 * The board's parts, built from the active board (docs/board_io_v2_spec.md § 5.1): as
 * many switches, LEDs and displays as it has, its buttons as a row or a cross, and its
 * reset button beside them. This maps the board to the parts' props; the parts
 * themselves know nothing about boards.
 */
export function BoardIoPanel({ board, layout = 'two-columns', outputs, inputs, onInputsChange, displaySettings, onDisplaySettingsChange, onDisplayVisibilityChange, buttonBounce, onButtonBounceChange }: BoardIoPanelProps) {
  const { ports, labels } = board;
  return (
    <Board size={24} className={layout === 'single-column' ? 'pb-board--single' : undefined}>
      <GroupedIoPanel key={`${board.id}-leds-${ports.leds.count}`} kind="leds" bits={outputs.leds} count={ports.leds.count} name={labels.leds} title={ledsTitle(ports.leds)} settings={displaySettings?.leds} onSettingsChange={settingsHandler('leds', onDisplaySettingsChange)} />
      <DisplaysPart board={board} outputs={outputs} settings={displaySettings?.sevenSegment} onChange={onDisplayVisibilityChange} />
      {ports.switches.count > 0 && <GroupedIoPanel
        key={`${board.id}-switches-${ports.switches.count}`}
        kind="switches"
        settings={displaySettings?.switches}
        onSettingsChange={settingsHandler('switches', onDisplaySettingsChange)}
        bits={inputs.switches}
        count={ports.switches.count}
        onChange={(switches) => onInputsChange({ switches })}
        name={labels.switches}
        title={switchesTitle(ports.switches)}
      />}
      <ButtonsPart board={board} inputs={inputs} onInputsChange={onInputsChange} buttonBounce={buttonBounce} onButtonBounceChange={onButtonBounceChange} />
    </Board>
  );
}

function DisplaysPart({ board, outputs, settings, onChange }: { board: BoardDefinition; outputs: BoardOutputs; settings?: DisplaySettings['sevenSegment']; onChange?: BoardIoPanelProps['onDisplayVisibilityChange'] }) {
  const { ports, labels } = board;
  const [collapsed, setCollapsed] = useState(false);
  const [choosing, setChoosing] = useState(false);
  const [local, setLocal] = useState<DisplaySettings['sevenSegment']>();
  const count = displayCount(ports);
  const visible = visibleIndices(settings ?? local, count);
  const hidden = Array.from({ length: count }, (_, i) => i).filter((i) => !visible.includes(i));
  if (!count) return null;
  if (collapsed) return <CollapsedPanelButton kind="sevenseg" label="7-Segment Displays" onExpand={() => setCollapsed(false)} />;
  return <><SevenSegmentDisplays
        value={outputs.displays}
        count={count}
        visibleIndices={visible}
        activeLow={ports.sevenSegment.activeLow}
        decimalPoint={hasDecimalPoint(ports)}
        name={labels.sevenSegment}
        title={displaysTitle(ports.sevenSegment)}
        headerAction={<div className="pb-io-panel__actions">{hidden.length > 0 && <button type="button" className="pb-io-hidden" onClick={() => setChoosing(true)}>{hidden.length} displays hidden</button>}<CollapsePanelMenu kind="sevenseg" label="7-Segment Displays" onChoose={() => setChoosing(true)} onCollapse={() => setCollapsed(true)} /></div>}
      />
      {choosing && <VisibilityDialog kind="sevenseg" name={labels.sevenSegment} count={count} hidden={hidden} onCancel={() => setChoosing(false)} onApply={(next) => { const value = withVisibleIndices(settings ?? local ?? { visible: visibleIndices(undefined, count) }, count, Array.from({ length: count }, (_, i) => i).filter((i) => !next.includes(i))); if (onChange) onChange(value); else setLocal(value); setChoosing(false); }} />}
  </>;
}

function settingsHandler(kind: 'leds' | 'switches', callback: BoardIoPanelProps['onDisplaySettingsChange']) {
  return callback && ((next: IoDisplaySettings) => callback(kind, next));
}

type PartProps = Omit<BoardIoPanelProps, 'outputs'>;

/** The pushbuttons as a row or a cross, with the reset button beside them. */
function ButtonsPart({ board, inputs, onInputsChange, buttonBounce, onButtonBounceChange }: PartProps) {
  const { ports, labels } = board;
  const { pushbuttons } = ports;
  const [collapsed, setCollapsed] = useState(false);
  const [localBounce, setLocalBounce] = useState<ButtonBounce>('none');
  const bounce = { mode: buttonBounce ?? localBounce, onChange: onButtonBounceChange ?? setLocalBounce };
  if (buttonCount(ports) === 0) return <ResetPart board={board} inputs={inputs} onInputsChange={onInputsChange} />;
  if (collapsed) return <CollapsedPanelButton kind="pushbuttons" label="Pushbuttons" onExpand={() => setCollapsed(false)} />;
  const shared = {
    value: inputs.buttons,
    onChange: (buttons: BitVector) => onInputsChange({ buttons }),
    activeLow: pushbuttons.activeLow,
    name: labels.pushbuttons,
    title: buttonsTitle(pushbuttons),
    aside: <ResetPart board={board} inputs={inputs} onInputsChange={onInputsChange} />,
    headerAction: <div className="pb-io-panel__actions">
      {bounce.mode === 'bouncy' && <BouncyBadge />}
      <CollapsePanelMenu kind="pushbuttons" label="Pushbuttons" onCollapse={() => setCollapsed(true)} bounce={bounce} />
    </div>,
  };
  if (pushbuttons.layout === 'cross') return <PushbuttonCross {...shared} labels={groupNames(pushbuttons.group)} />;
  const scalarNames = pushbuttons.group.kind === 'scalars' ? pushbuttons.group.ports : undefined;
  return <Pushbuttons {...shared} count={buttonCount(ports)} labels={scalarNames} showHint={false} />;
}

/** The reset button, on a board that has one. */
function ResetPart({ board, inputs, onInputsChange }: PartProps) {
  const reset = board.ports.resetButton;
  if (reset === undefined) return null;
  return (
    <ResetButton
      value={inputs.reset[0] ?? releasedLevel(reset.activeLow)}
      activeLow={reset.activeLow}
      label={reset.port}
      onChange={(level) => onInputsChange({ reset: [level] })}
    />
  );
}
