// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import { useId, type ReactNode } from 'react';
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
  /** Play greyed out while another simulation runs, and why (paneRun.ts). */
  readonly blockedReason?: string;
  readonly onClick: () => void;
}

export interface RegionNav {
  /** 0-based. */
  readonly index: number;
  readonly count: number;
  readonly label: string;
  readonly onStep: (step: 1 | -1) => void;
}

/** What every pane header with a file has (docs/cleanup_file_tabs.md § 5.2, § 5.3). */
interface FilePaneHeaderProps {
  fileName: string;
  /** The file's name as the button that opens the file menu (FileMenu.tsx). */
  nameButton: ReactNode;
  run: PaneRun | null;
  /** At the right end, in the rightmost pane only: the suggestion chip and the view switch. */
  end?: ReactNode;
}

export interface RolePaneHeaderProps extends FilePaneHeaderProps {
  pane: PaneRole;
  /** The unit this pane shows and runs, from the current analysis. */
  unit: AnalyzedUnit | undefined;
  /** The file's role override, if the student set one. */
  roleOverride: UnitRole | undefined;
  regions: RegionNav | null;
  onSetRole: (role: UnitRole | undefined) => void;
  pairOptions: readonly PairOption[];
  onPairWith: (fileId: string) => void;
}

/**
 * A testbench or design pane's header (docs/impl_split_screen.md § 4.4): run control,
 * role badge (a menu), file name and region navigator (TB pane). Tinted in the role
 * colour with a top accent (D25); icon and text, never colour alone. The badge sits
 * between Play and the name.
 */
export function RolePaneHeader(props: RolePaneHeaderProps) {
  const { pane, fileName, nameButton, run, regions, end } = props;
  return (
    <div className={`wb-panehead is-${pane}`}>
      {run && <PaneRunButton fileName={fileName} run={run} />}
      <RoleBadge {...props} />
      {nameButton}
      <span className="wb-panehead__spacer" />
      {regions && regions.count > 1 && <RegionNavigator regions={regions} />}
      {end}
    </div>
  );
}

/**
 * The header of one design file with no testbench (docs/cleanup_file_tabs.md § 5.2):
 * no tint and no badge; a divider sets Play apart from the name, the main element.
 */
export function PlainPaneHeader({ fileName, nameButton, run, end }: FilePaneHeaderProps) {
  return (
    <div className="wb-panehead is-plain">
      {run && (
        <>
          <PaneRunButton fileName={fileName} run={run} />
          <span className="wb-panehead__divider" aria-hidden="true" />
        </>
      )}
      {nameButton}
      <span className="wb-panehead__spacer" />
      {end}
    </div>
  );
}

/** A pane with no file to show (impl_split_screen.md § 4.6): its role, and the view switch when rightmost, on the header line. */
export function EmptyPaneHeader({ pane, end }: { pane: PaneRole; end?: ReactNode }) {
  const Icon = pane === 'tb' ? FlaskIcon : ChipIcon;
  return (
    <div className={`wb-panehead is-${pane}`}>
      <span className={`wb-rolebadge is-${pane} is-static`}>
        <Icon aria-hidden="true" />
        <span className="wb-rolebadge__label">{pane === 'tb' ? TEXT.tbLabel : TEXT.rtlLabel}</span>
      </span>
      <span className="wb-panehead__spacer" />
      {end}
    </div>
  );
}

function PaneRunButton({ fileName, run }: { fileName: string; run: PaneRun }) {
  return (
    <SimToggle
      fileName={fileName}
      running={run.running}
      disabled={run.disabled}
      blockedReason={run.blockedReason}
      onClick={run.onClick}
    />
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
function RoleBadge({ pane, unit, roleOverride, onSetRole, pairOptions, onPairWith }: RolePaneHeaderProps) {
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
        <span className="wb-rolebadge__label">{pane === 'tb' ? TEXT.tbLabel : TEXT.rtlLabel}</span>
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
