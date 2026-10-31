// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import { useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import { Panel, Readout, bitsToString, type BitVector } from '../board';
import { Led } from '../Leds/Led';
import { ToggleSwitch } from '../Switches/ToggleSwitch';
import './GroupedIoPanel.css';
import type { ButtonBounce, IoDisplaySettings } from '../../project/types';
import { defaultIoDisplaySettings, visibleIndices, withVisibleIndices } from '../../project/displaySettings';

const NIBBLE = 4;
const BYTE = 8;
const MULTI_ROW_THRESHOLD = 12;
const HEX_RADIX = 16;
const DECIMAL_RADIX = 10;
type GroupSize = typeof NIBBLE | typeof BYTE;
type View = GroupSize | 'default';
type Kind = 'switches' | 'leds';
type PanelKind = Kind | 'sevenseg' | 'pushbuttons';
type ValueFormat = 'binary' | 'hex' | 'decimal';
const useClientLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;

export function bitGroups(count: number, size: GroupSize): number[][] {
  const groups: number[][] = [];
  for (let start = 0; start < count; start += size) {
    groups.unshift(Array.from({ length: Math.min(size, count - start) }, (_, i) => start + i).reverse());
  }
  return groups;
}

export function groupHex(bits: BitVector, group: number[]): string {
  const value = group.reduce((sum, index) => sum * 2 + (bits[index] ?? 0), 0);
  return `0x${value.toString(HEX_RADIX).toUpperCase().padStart(Math.ceil(group.length / NIBBLE), '0')}`;
}

export function formatIoValue(bits: BitVector, format: ValueFormat): string {
  const binary = bitsToString(bits);
  if (format === 'binary') return binary;
  const value = BigInt(`0b${binary || '0'}`);
  if (format === 'decimal') return value.toString(DECIMAL_RADIX);
  const digits = value.toString(HEX_RADIX).toUpperCase().padStart(Math.ceil(bits.length / NIBBLE), '0');
  return digits.replace(/(?=(?:[0-9A-F]{2})+$)/g, ' ').trim();
}

interface Props {
  kind: Kind;
  count: number;
  bits: BitVector;
  name: string;
  title: string;
  onChange?: (bits: BitVector) => void;
  settings?: IoDisplaySettings;
  onSettingsChange?: (settings: IoDisplaySettings) => void;
}

export function GroupedIoPanel({ kind, count, bits, name, title, onChange, settings, onSettingsChange }: Props) {
  const [localSettings, setLocalSettings] = useState<IoDisplaySettings | undefined>();
  const current = settings ?? localSettings ?? defaultIoDisplaySettings(count);
  const visible = visibleIndices(current, count);
  const update = (next: IoDisplaySettings) => { if (onSettingsChange) onSettingsChange(next); else setLocalSettings(next); };
  const view: View = current.groupSize ?? 'default';
  const hidden = Array.from({ length: count }, (_, i) => i).filter((i) => !visible.includes(i));
  const [collapsed, setCollapsed] = useState(false);
  const [choosing, setChoosing] = useState(false);
  const format = selectedFormat(current);
  const label = panelLabel(kind);
  const groups = groupsForView(count, view);

  if (collapsed) return <CollapsedPanelButton kind={kind} label={collapsedLabel(label, hidden.length)} onExpand={() => setCollapsed(false)} />;

  return <Panel heading={title} accent={kind} className={panelClass(kind, format)} headerAction={
    <div className="pb-io-panel__actions">
      {hidden.length > 0 && <button type="button" className="pb-io-hidden" onClick={() => setChoosing(true)}>{hidden.length} {kind === 'leds' ? 'LEDs' : 'switches'} hidden</button>}
      <DisplayMenu kind={kind} name={name} view={view} format={format} onFormat={(option) => update({ ...current, readouts: { binary: option === 'binary', hexadecimal: option === 'hex', decimal: option === 'decimal' } })} onView={(option) => update({ ...withVisibleIndices(current, count, option === 'default' ? Array.from({ length: count }, (_, i) => i) : visible), groupSize: option === 'default' ? null : option })} onChoose={() => setChoosing(true)} onCollapse={() => setCollapsed(true)} />
    </div>
  }>
    <div className="pb-io-groups" role="group" aria-label={title}>
      {groups.map((group) => <IoGroup key={group[0]} group={group} hidden={hidden} kind={kind} bits={bits} name={name} view={view} onChange={onChange} />)}
    </div>
    <Readout name={name} format={formatLabel(format)} text={formatIoValue(bits, format)} />
    {choosing && <VisibilityDialog kind={kind} name={name} count={count} hidden={hidden} onCancel={() => setChoosing(false)} onApply={(next) => { update(withVisibleIndices(current, count, Array.from({ length: count }, (_, i) => i).filter((i) => !next.includes(i)))); setChoosing(false); }} />}
  </Panel>;
}

function selectedFormat(settings: IoDisplaySettings): ValueFormat {
  return settings.readouts.binary ? 'binary' : settings.readouts.hexadecimal ? 'hex' : settings.readouts.decimal ? 'decimal' : 'binary';
}

function panelLabel(kind: Kind): string { return kind === 'switches' ? 'Switches' : 'LEDs'; }
function collapsedLabel(label: string, count: number): string {
  return count > 0 ? `${label} (${count} hidden)` : label;
}
function groupsForView(count: number, view: View): number[][] {
  return view === 'default' ? [Array.from({ length: count }, (_, i) => count - 1 - i)] : bitGroups(count, view);
}
function panelClass(kind: Kind, format: ValueFormat): string {
  return `pb-${kind} pb-io-panel${format !== 'binary' ? ' pb-io-panel--numeric-value' : ''}`;
}

interface IoGroupProps extends Pick<Props, 'kind' | 'bits' | 'name' | 'onChange'> {
  group: number[];
  hidden: number[];
  view: View;
}

function IoGroup({ group, hidden, kind, bits, name, view, onChange }: IoGroupProps) {
  const visible = group.filter((index) => !hidden.includes(index));
  if (!visible.length) return null;
  return <div className="pb-io-group">
    <div className="pb-bank">{visible.map((index) => <div className="pb-bank__cell" key={index}>
      <span className="pb-bank__index">{index}</span>
      {kind === 'switches' ? <ToggleSwitch label={`${name}${index}`} checked={bits[index] === 1} onChange={(checked) => { const next = [...bits]; next[index] = checked ? 1 : 0; onChange?.(next); }} /> : <Led label={`${name}${index}`} on={bits[index] === 1} />}
    </div>)}</div>
    {view !== 'default' && <output className="pb-io-hex" aria-label={`${name} bits ${group[0]} to ${group[group.length - 1]}`}>{groupHex(bits, group)}</output>}
  </div>;
}

export function CollapsedPanelButton({ kind, label, onExpand }: { kind: PanelKind; label: string; onExpand: () => void }) {
  const accent = panelAccent(kind);
  return <button type="button" className={`pb-ui pb-accent-${accent} pb-io-collapsed pb-${kind}`} aria-label={`Expand ${label}`} onClick={onExpand}>
    <CollapsedIcon kind={kind} /><span>{label}</span><svg className="pb-io-collapsed__chevron" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m9 5 7 7-7 7" /></svg>
  </button>;
}

function panelAccent(kind: PanelKind): string {
  if (kind === 'sevenseg') return 'hex';
  if (kind === 'pushbuttons') return 'keys';
  return kind;
}

function CollapsedIcon({ kind }: { kind: PanelKind }) {
  return <svg className="pb-io-collapsed__icon" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    {kind === 'leds' ? <path d="M7 17V10a5 5 0 0 1 10 0v7H7Zm-1 2h12M9 19v3m6-3v3M12 2v2M4 5l1.5 1.5M20 5l-1.5 1.5" /> : kind === 'switches' ? <><rect x="2" y="6" width="20" height="12" rx="6" fill="currentColor" stroke="none" /><circle cx="8" cy="12" r="4" fill="var(--pb-card-bg)" stroke="none" /></> : kind === 'sevenseg' ? <><rect x="4" y="2" width="16" height="20" rx="2" /><path d="M9 6h6l1 2-1 3H9L8 8Zm0 6h6l1 3-1 3H9l-1-3Z" /></> : <><rect x="3" y="3" width="18" height="18" rx="4" /><circle cx="12" cy="12" r="4" /></>}
  </svg>;
}

interface DisplayMenuProps {
  kind: PanelKind;
  name: string;
  view: View;
  format: ValueFormat;
  onFormat: (format: ValueFormat) => void;
  onView: (view: View) => void;
  onChoose: () => void;
  onCollapse: () => void;
  collapseOnly?: boolean;
  allowVisibility?: boolean;
  /** The pushbuttons' contacts: ideal or bouncing (only the pushbutton panel has this). */
  bounce?: BounceChoice;
}

/** The pushbutton menu's choice of contacts, and what to call when the student picks one. */
export interface BounceChoice {
  readonly mode: ButtonBounce;
  readonly onChange: (mode: ButtonBounce) => void;
}

const BOUNCE_OPTIONS: ReadonlyArray<{ readonly mode: ButtonBounce; readonly label: string; readonly hint: string }> = [
  { mode: 'none', label: 'No Bounce', hint: 'Ideal contacts: each press and release is one clean edge.' },
  { mode: 'bouncy', label: 'Bouncy', hint: 'Real contacts: a press or release can bounce, giving several edges within a few milliseconds.' },
];

/** "No Bounce" and "Bouncy", each with a waveform of what the input does; nothing on a panel without the choice. */
function BounceItems({ bounce, labelId, onChosen }: { bounce: BounceChoice | undefined; labelId: string; onChosen: () => void }) {
  if (bounce === undefined) return null;
  return <>
    <div className="pb-display-menu__format-label" id={labelId}>Button contacts</div>
    <div role="group" aria-labelledby={labelId}>
      {BOUNCE_OPTIONS.map(({ mode, label, hint }) => <button key={mode} type="button" role="menuitemradio" aria-checked={bounce.mode === mode} title={hint} className="pb-display-menu__item" onClick={() => { bounce.onChange(mode); onChosen(); }}>
        <span className="pb-display-menu__check" aria-hidden="true">{bounce.mode === mode ? '✓' : ''}</span>
        <MenuIcon kind={mode === 'none' ? 'clean-edge' : 'bouncy-edge'} />
        <span>{label}</span>
      </button>)}
    </div>
    <div className="pb-display-menu__divider" role="separator" />
  </>;
}

function useDisplayMenu() {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const trigger = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const id = useId();

  useClientLayoutEffect(() => {
    if (!open || !trigger.current || !menu.current) return;
    setPosition(menuPosition(trigger.current, menu.current));
    (menu.current.querySelector<HTMLButtonElement>('[aria-checked="true"]') ?? menu.current.querySelector<HTMLButtonElement>('button'))?.focus();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const dismissOutside = (event: PointerEvent) => {
      if (!trigger.current?.contains(event.target as Node) && !menu.current?.contains(event.target as Node)) setOpen(false);
    };
    const dismiss = () => setOpen(false);
    const repositionOnScroll = (event: Event) => {
      if (event.target === menu.current || !trigger.current || !menu.current) return;
      setPosition(menuPosition(trigger.current, menu.current));
    };
    document.addEventListener('pointerdown', dismissOutside);
    window.addEventListener('resize', dismiss);
    document.addEventListener('scroll', repositionOnScroll, true);
    return () => { document.removeEventListener('pointerdown', dismissOutside); window.removeEventListener('resize', dismiss); document.removeEventListener('scroll', repositionOnScroll, true); };
  }, [open]);

  const onMenuKey = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); setOpen(false); trigger.current?.focus(); return; }
    if (event.key === 'Tab') { setOpen(false); return; }
    const items = [...event.currentTarget.querySelectorAll<HTMLButtonElement>('button')];
    const current = items.indexOf(document.activeElement as HTMLButtonElement);
    const targets: Record<string, number> = { ArrowDown: (current + 1) % items.length, ArrowUp: (current + items.length - 1) % items.length, Home: 0, End: items.length - 1 };
    if (moveFormatFocus(event)) return;
    if (targets[event.key] !== undefined) { event.preventDefault(); items[targets[event.key]]?.focus(); }
  };

  return { open, setOpen, position, trigger, menu, id, onMenuKey };
}

function menuPosition(trigger: HTMLElement, menu: HTMLElement) {
  const anchor = trigger.getBoundingClientRect();
  const box = menu.getBoundingClientRect();
  const edge = 8;
  const gap = 5;
  const below = anchor.bottom + gap;
  const top = below + box.height <= window.innerHeight - edge ? below : anchor.top - box.height - gap;
  return {
    top: Math.max(edge, Math.min(top, window.innerHeight - box.height - edge)),
    left: Math.max(edge, Math.min(anchor.right - box.width, window.innerWidth - box.width - edge)),
  };
}

function moveFormatFocus(event: KeyboardEvent<HTMLDivElement>): boolean {
  if (!document.activeElement?.closest('.pb-display-menu__formats')) return false;
  if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return false;
  const formats = [...event.currentTarget.querySelectorAll<HTMLButtonElement>('.pb-display-menu__formats button')];
  const index = formats.indexOf(document.activeElement as HTMLButtonElement);
  event.preventDefault();
  formats[(index + (event.key === 'ArrowRight' ? 1 : formats.length - 1)) % formats.length]?.focus();
  return true;
}

function DisplayMenu({ kind, name, view, format, onFormat, onView, onChoose, onCollapse, collapseOnly = false, allowVisibility = false, bounce }: DisplayMenuProps) {
  const { open, setOpen, position, trigger, menu, id, onMenuKey } = useDisplayMenu();
  const menuLabel = displayMenuLabel(kind, name);

  const chooseView = (option: View) => { onView(option); setOpen(false); trigger.current?.focus(); };
  return <>
    <button ref={trigger} type="button" className={`pb-display-menu__trigger pb-display-menu--${kind}`} aria-label={menuLabel} aria-haspopup="menu" aria-expanded={open} aria-controls={open ? id : undefined} onClick={() => setOpen(!open)} onKeyDown={(event) => { if (event.key === 'ArrowDown') { event.preventDefault(); setOpen(true); } }}><span aria-hidden="true">•••</span></button>
    {open && createPortal(<div ref={menu} id={id} role="menu" aria-label={menuLabel} className={`pb-ui pb-accent-${panelAccent(kind)} pb-display-menu pb-display-menu--${kind}`} style={position} onKeyDown={onMenuKey}>
      {!collapseOnly && <>{(['default', NIBBLE, BYTE] as const).map((option) => <button key={option} type="button" role="menuitemradio" aria-checked={view === option} className="pb-display-menu__item" onClick={() => chooseView(option)}>
        <span className="pb-display-menu__check" aria-hidden="true">{view === option ? '✓' : ''}</span>
        {option === 'default' ? <MenuIcon kind="grid" /> : <span className="pb-display-menu__badge" aria-hidden="true">{option === NIBBLE ? '0x0' : '0x00'}</span>}
        <span>{option === 'default' ? 'Default view' : `Group by ${option}`}</span>
      </button>)}
      <div className="pb-display-menu__divider" role="separator" />
      <div className="pb-display-menu__format-label" id={`${id}-format`}>{name} value format</div>
        <div className="pb-display-menu__formats" role="group" aria-labelledby={`${id}-format`}>
          {(['binary', 'hex', 'decimal'] as const).map((option) => <button key={option} type="button" role="menuitemradio" aria-checked={format === option} onClick={() => { onFormat(option); setOpen(false); trigger.current?.focus(); }}>{formatLabel(option)}</button>)}
        </div>
        <div className="pb-display-menu__divider" role="separator" />
      <button type="button" role="menuitem" className="pb-display-menu__item" onClick={() => { setOpen(false); onChoose(); }}><span className="pb-display-menu__check" /><MenuIcon kind="eye" /><span>Choose visible {kind === 'leds' ? 'LEDs' : 'switches'}…</span></button>
      </>}
      <BounceItems bounce={bounce} labelId={`${id}-bounce`} onChosen={() => { setOpen(false); trigger.current?.focus(); }} />
      {allowVisibility && <button type="button" role="menuitem" className="pb-display-menu__item" onClick={() => { setOpen(false); onChoose(); }}><span className="pb-display-menu__check" /><MenuIcon kind="eye" /><span>Choose visible displays…</span></button>}
      <button type="button" role="menuitem" className="pb-display-menu__item" onClick={() => { setOpen(false); onCollapse(); }}><span className="pb-display-menu__check" /><MenuIcon kind="collapse" /><span>Collapse to icon</span></button>
    </div>, document.body)}
  </>;
}

function displayMenuLabel(kind: PanelKind, name: string) {
  if (kind === 'leds') return 'LED display options';
  if (kind === 'switches') return 'Switch display options';
  return `${name} options`;
}
function formatLabel(option: ValueFormat) { return option === 'hex' ? 'Hex' : option === 'binary' ? 'Binary' : 'Decimal'; }

interface CollapsePanelMenuProps {
  kind: 'sevenseg' | 'pushbuttons';
  label: string;
  onCollapse: () => void;
  onChoose?: () => void;
  bounce?: BounceChoice;
}

export function CollapsePanelMenu({ kind, label, onCollapse, onChoose, bounce }: CollapsePanelMenuProps) {
  return <DisplayMenu kind={kind} name={label} view="default" format="binary" onFormat={() => {}} onView={() => {}} onChoose={() => onChoose?.()} onCollapse={onCollapse} collapseOnly allowVisibility={!!onChoose} bounce={bounce} />;
}

type MenuIconKind = 'grid' | 'eye' | 'collapse' | 'clean-edge' | 'bouncy-edge';

/** The drawing of each menu icon, on a 24 × 24 grid. */
const MENU_ICON_SHAPES: Record<MenuIconKind, JSX.Element> = {
  grid: <><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></>,
  eye: <><path d="M2 12s3.5-6.5 10-6.5S22 12 22 12s-3.5 6.5-10 6.5S2 12 2 12Z" /><circle cx="12" cy="12" r="2.5" /></>,
  collapse: <><rect x="3" y="3" width="18" height="18" rx="3" /><path d="M8 12h8" /></>,
  // A press as an input sees it: high, then one clean step down.
  'clean-edge': <path d="M2 6h9v12h11" />,
  // The same press with contact bounce: the input flicks back up a few times before it stays down.
  'bouncy-edge': <path d="M2 6h5v12h3V8h3v10h3v-5h3v5h3" />,
};

function MenuIcon({ kind }: { kind: MenuIconKind }) {
  return <span className="pb-display-menu__icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{MENU_ICON_SHAPES[kind]}</svg></span>;
}

/** Shown in the pushbutton panel's header while its contacts bounce, so the choice is never forgotten. */
export function BouncyBadge() {
  return <span className="pb-io-bouncy" title={BOUNCE_OPTIONS[1].hint}><MenuIcon kind="bouncy-edge" />Bouncy</span>;
}

interface DialogProps extends Pick<Props, 'name' | 'count'> {
  kind: Kind | 'sevenseg';
  hidden: number[];
  onCancel: () => void;
  onApply: (hidden: number[]) => void;
}

export function VisibilityDialog({ kind, name, count, hidden, onCancel, onApply }: DialogProps) {
  const dialog = useRef<HTMLDialogElement>(null);
  const applyButton = useRef<HTMLButtonElement>(null);
  const [draft, setDraft] = useState(hidden);
  useEffect(() => { dialog.current?.showModal(); applyButton.current?.focus(); }, []);
  const items = kind === 'leds' ? 'LEDs' : kind === 'switches' ? 'switches' : 'displays';
  return <dialog ref={dialog} className={`pb-ui pb-accent-${panelAccent(kind)} pb-io-dialog`} onCancel={(event) => { event.preventDefault(); onCancel(); }} aria-labelledby={`visibility-${kind}`}>
    <form onSubmit={(event) => { event.preventDefault(); onApply(draft); }}>
      <div className="pb-io-dialog__hero">
        <div className="pb-io-dialog__badge" aria-hidden="true">
          <svg viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
            {kind === 'leds' ? <><path d="M15 29V16a9 9 0 0 1 18 0v13M12 29h24M18 29v15M30 29v15" /></> : kind === 'sevenseg' ? <><rect x="9" y="3" width="30" height="42" rx="4" /><path d="M17 10h14l2 4-2 7H17l-2-7Zm0 14h14l2 7-2 5H17l-2-5Z" /></> : <><rect x="3" y="12" width="42" height="24" rx="12" /><circle cx="32" cy="24" r="7" fill="currentColor" stroke="none" /></>}
          </svg>
        </div>
        <div>
          <h2 id={`visibility-${kind}`}>Choose visible {items} ({name}[{count - 1}:0])</h2>
          <p>Select the {items} to show on the board</p>
        </div>
      </div>
      <VisibilityBits count={count} name={name} draft={draft} onChange={setDraft} />
      <div className="pb-io-dialog__actions">
        <button type="button" onClick={onCancel}>Cancel</button>
        <button ref={applyButton} type="submit">Apply</button>
      </div>
    </form>
  </dialog>;
}

function VisibilityBits({ count, name, draft, onChange }: { count: number; name: string; draft: number[]; onChange: (hidden: number[]) => void }) {
  return <div className={`pb-io-dialog__bits${count >= MULTI_ROW_THRESHOLD ? ' pb-io-dialog__bits--multiple-rows' : ''}`}>
    {bitGroups(count, NIBBLE).map((group) => <div className="pb-io-dialog__group" key={group[0]} style={{ flexGrow: group.length }}>
      {group.map((index) => <label key={index}>
        <input type="checkbox" aria-label={`${name}${index}`} checked={!draft.includes(index)} onChange={(event) => onChange(event.target.checked ? draft.filter((bit) => bit !== index) : [...draft, index])} />
        <span>{index}</span>
      </label>)}
    </div>)}
  </div>;
}
