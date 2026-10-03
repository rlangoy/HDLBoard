// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import { useId } from 'react';
import type { PaneRole } from './editorView';
import { ChipIcon, FlaskIcon } from './icons';
import { RoleIcon, usePopover } from './RoleIcon';
import { SimToggle } from './SimToggle';
import { TEXT, detectedAs, regionCount } from './testbenchText';
import type { AnalyzedUnit, FileRole, UnitRole } from './tbDetect/types';

export interface PairOption {
  readonly fileId: string;
  readonly name: string;
  readonly role: FileRole | undefined;
}

export interface PaneRun {
  readonly running: boolean;
  readonly disabled: boolean;
  readonly onClick: () => void;
}

export interface RegionNav {
  /** 0-based. */
  readonly index: number;
  readonly count: number;
  readonly label: string;
  readonly onStep: (step: 1 | -1) => void;
}

export interface EditorPaneHeaderProps {
  pane: PaneRole;
  fileName: string;
  /** The unit this pane shows and runs, from the current analysis. */
  unit: AnalyzedUnit | undefined;
  /** The file's role override, if the student set one. */
  roleOverride: UnitRole | undefined;
  run: PaneRun | null;
  regions: RegionNav | null;
  onSetRole: (role: UnitRole | undefined) => void;
  pairOptions: readonly PairOption[];
  onPairWith: (fileId: string) => void;
}

/**
 * A pane's header (docs/impl_split_screen.md § 4.4): run control, role badge (a
 * menu), file name and region navigator (TB pane). Tinted in the role
 * colour with a top accent (D25); icon and text, never colour alone.
 */
export function EditorPaneHeader(props: EditorPaneHeaderProps) {
  const { pane, fileName, run, regions } = props;
  return (
    <div className={`wb-panehead is-${pane}`}>
      {run && <SimToggle fileName={fileName} running={run.running} disabled={run.disabled} onClick={run.onClick} />}
      <RoleBadge {...props} />
      <span className="wb-panehead__name" title={fileName}>
        {fileName}
      </span>
      {regions && regions.count > 1 && <RegionNavigator regions={regions} />}
    </div>
  );
}

function RegionNavigator({ regions }: { regions: RegionNav }) {
  return (
    <span className="wb-panehead__regions">
      <button type="button" className="wb-panehead__btn" aria-label={TEXT.previousRegion} title={TEXT.previousRegion} onClick={() => regions.onStep(-1)}>
        ‹
      </button>
      <span className="wb-panehead__region" aria-live="polite">
        {regionCount(regions.index + 1, regions.count)} <span className="wb-panehead__region-label">{regions.label}</span>
      </span>
      <button type="button" className="wb-panehead__btn" aria-label={TEXT.nextRegion} title={TEXT.nextRegion} onClick={() => regions.onStep(1)}>
        ›
      </button>
    </span>
  );
}

/** The role badge, a menu button: detection, role override, pairing. */
function RoleBadge({ pane, unit, roleOverride, onSetRole, pairOptions, onPairWith }: EditorPaneHeaderProps) {
  const menu = usePopover<HTMLSpanElement>();
  const pairList = usePopover<HTMLDivElement>();
  const menuId = useId();
  const Icon = pane === 'tb' ? FlaskIcon : ChipIcon;
  const choose = (action: () => void) => {
    action();
    menu.setOpen(false);
  };
  return (
    <span className="wb-panehead__badge-wrap" ref={menu.rootRef}>
      <button
        type="button"
        className={`wb-rolebadge is-${pane}`}
        aria-haspopup="menu"
        aria-expanded={menu.open}
        aria-controls={menu.open ? menuId : undefined}
        title={pane === 'tb' ? TEXT.tbTooltip : TEXT.rtlTooltip}
        onClick={() => menu.setOpen(!menu.open)}
      >
        <Icon aria-hidden="true" />
        {pane === 'tb' ? TEXT.tbLabel : TEXT.rtlLabel}
      </button>
      {menu.open && (
        <div className="wb-menu" role="menu" id={menuId}>
          <p className="wb-menu__info" role="presentation">
            {roleOverride ? TEXT.roleFromOverride : unit ? detectedAs(unit.role, unit.confidence) : TEXT.noEvidence}
          </p>
          <MenuItem checked={roleOverride === 'tb'} onClick={() => choose(() => onSetRole('tb'))} label={TEXT.treatAsTestbench} />
          <MenuItem checked={roleOverride === 'rtl'} onClick={() => choose(() => onSetRole('rtl'))} label={TEXT.treatAsDesign} />
          <MenuItem checked={roleOverride === undefined} onClick={() => choose(() => onSetRole(undefined))} label={TEXT.useDetection} />
          <div ref={pairList.rootRef}>
            <button type="button" role="menuitem" className="wb-menu__item" aria-expanded={pairList.open} onClick={() => pairList.setOpen(!pairList.open)}>
              {TEXT.pairWith}
            </button>
            {pairList.open && <PairList options={pairOptions} onPick={(id) => choose(() => onPairWith(id))} />}
          </div>
        </div>
      )}
    </span>
  );
}

function MenuItem({ label, checked, onClick }: { label: string; checked: boolean; onClick: () => void }) {
  return (
    <button type="button" role="menuitemradio" aria-checked={checked} className="wb-menu__item" onClick={onClick}>
      <span className="wb-menu__check" aria-hidden="true">
        {checked ? '✓' : ''}
      </span>
      {label}
    </button>
  );
}

/** Same-language files to pair with, each with its role icon (D25). */
export function PairList({ options, onPick }: { options: readonly PairOption[]; onPick: (fileId: string) => void }) {
  if (options.length === 0) return <p className="wb-menu__info">{TEXT.noPairCandidates}</p>;
  return (
    <div className="wb-menu__list">
      {options.map((o) => (
        <button key={o.fileId} type="button" role="menuitem" className="wb-menu__item" onClick={() => onPick(o.fileId)}>
          <RoleIcon role={o.role} />
          {o.name}
        </button>
      ))}
    </div>
  );
}
