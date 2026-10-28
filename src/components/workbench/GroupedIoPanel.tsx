// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import { useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import { Panel, Readout, bitsToString, type BitVector } from '../board';
import { Led } from '../Leds/Led';
import { ToggleSwitch } from '../Switches/ToggleSwitch';
import './GroupedIoPanel.css';

type GroupSize = 4 | 8;
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
  return `0x${value.toString(16).toUpperCase().padStart(Math.ceil(group.length / 4), '0')}`;
}

export function formatIoValue(bits: BitVector, format: ValueFormat): string {
  const binary = bitsToString(bits);
  if (format === 'binary') return binary;
  const value = BigInt(`0b${binary || '0'}`);
  if (format === 'decimal') return value.toString(10);
  return `0x${value.toString(16).toUpperCase().padStart(Math.ceil(bits.length / 4), '0')}`;
}

interface Props {
  kind: Kind;
  count: number;
  bits: BitVector;
  name: string;
  title: string;
  onChange?: (bits: BitVector) => void;
}

export function GroupedIoPanel({ kind, count, bits, name, title, onChange }: Props) {
  const [view, setView] = useState<View>(4);
  const [hidden, setHidden] = useState<number[]>([]);
  const [collapsed, setCollapsed] = useState(false);
  const [choosing, setChoosing] = useState(false);
  const [format, setFormat] = useState<ValueFormat>('binary');
  const label = kind === 'switches' ? 'Switches' : 'LEDs';

  if (collapsed) return <CollapsedPanelButton kind={kind} label={label} onExpand={() => setCollapsed(false)} />;

  return <Panel heading={title} accent={kind} className={`pb-${kind} pb-io-panel${format !== 'binary' ? ' pb-io-panel--numeric-value' : ''}`} headerAction={
    <DisplayMenu kind={kind} name={name} view={view} format={format} onFormat={setFormat} onView={(option) => { setView(option); if (option === 'default') setHidden([]); }} onChoose={() => setChoosing(true)} onCollapse={() => setCollapsed(true)} />
  }>
    <div className="pb-io-groups" role="group" aria-label={title}>
      {(view === 'default' ? [Array.from({ length: count }, (_, i) => count - 1 - i)] : bitGroups(count, view)).map((group) => {
        const visible = group.filter((index) => !hidden.includes(index));
        if (!visible.length) return null;
        return <div className="pb-io-group" key={group[0]}>
          <div className="pb-bank">{visible.map((index) => <div className="pb-bank__cell" key={index}>
            <span className="pb-bank__index">{index}</span>
            {kind === 'switches' ? <ToggleSwitch label={`${name}${index}`} checked={bits[index] === 1} onChange={(checked) => { const next = [...bits]; next[index] = checked ? 1 : 0; onChange?.(next); }} /> : <Led label={`${name}${index}`} on={bits[index] === 1} />}
          </div>)}</div>
          {view !== 'default' && <output className="pb-io-hex" aria-label={`${name} bits ${group[0]} to ${group[group.length - 1]}`}>{groupHex(bits, group)}</output>}
        </div>;
      })}
    </div>
    <Readout name={name} text={formatIoValue(bits, format)} />
    {choosing && <VisibilityDialog kind={kind} name={name} count={count} hidden={hidden} onCancel={() => setChoosing(false)} onApply={(next) => { setHidden(next); setChoosing(false); }} />}
  </Panel>;
}

export function CollapsedPanelButton({ kind, label, onExpand }: { kind: PanelKind; label: string; onExpand: () => void }) {
  const accent = kind === 'sevenseg' ? 'hex' : kind === 'pushbuttons' ? 'keys' : kind;
  return <button type="button" className={`pb-ui pb-accent-${accent} pb-io-collapsed pb-${kind}`} aria-label={`Expand ${label}`} onClick={onExpand}>
    <CollapsedIcon kind={kind} /><span>{label}</span><svg className="pb-io-collapsed__chevron" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m9 5 7 7-7 7" /></svg>
  </button>;
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
}

function DisplayMenu({ kind, name, view, format, onFormat, onView, onChoose, onCollapse, collapseOnly = false }: DisplayMenuProps) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const trigger = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const id = useId();
  const menuLabel = kind === 'leds' ? 'LED display options' : kind === 'switches' ? 'Switch display options' : `${name} options`;

  useClientLayoutEffect(() => {
    if (!open || !trigger.current || !menu.current) return;
    const anchor = trigger.current.getBoundingClientRect();
    const box = menu.current.getBoundingClientRect();
    const edge = 8;
    const below = anchor.bottom + 5;
    const top = below + box.height <= window.innerHeight - edge ? below : anchor.top - box.height - 5;
    setPosition({ top: Math.max(edge, Math.min(top, window.innerHeight - box.height - edge)), left: Math.max(edge, Math.min(anchor.right - box.width, window.innerWidth - box.width - edge)) });
    (menu.current.querySelector<HTMLButtonElement>('[aria-checked="true"]') ?? menu.current.querySelector<HTMLButtonElement>('button'))?.focus();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const dismissOutside = (event: PointerEvent) => {
      if (!trigger.current?.contains(event.target as Node) && !menu.current?.contains(event.target as Node)) setOpen(false);
    };
    const dismiss = () => setOpen(false);
    const dismissOnScroll = (event: Event) => { if (event.target !== menu.current) setOpen(false); };
    document.addEventListener('pointerdown', dismissOutside);
    window.addEventListener('resize', dismiss);
    document.addEventListener('scroll', dismissOnScroll, true);
    return () => { document.removeEventListener('pointerdown', dismissOutside); window.removeEventListener('resize', dismiss); document.removeEventListener('scroll', dismissOnScroll, true); };
  }, [open]);

  const onMenuKey = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); setOpen(false); trigger.current?.focus(); return; }
    if (event.key === 'Tab') { setOpen(false); return; }
    const items = [...event.currentTarget.querySelectorAll<HTMLButtonElement>('button')];
    const current = items.indexOf(document.activeElement as HTMLButtonElement);
    const targets: Record<string, number> = { ArrowDown: (current + 1) % items.length, ArrowUp: (current + items.length - 1) % items.length, Home: 0, End: items.length - 1 };
    if (document.activeElement?.closest('.pb-led-menu__formats') && (event.key === 'ArrowRight' || event.key === 'ArrowLeft')) {
      const formats = [...event.currentTarget.querySelectorAll<HTMLButtonElement>('.pb-led-menu__formats button')];
      const index = formats.indexOf(document.activeElement as HTMLButtonElement);
      event.preventDefault();
      formats[(index + (event.key === 'ArrowRight' ? 1 : formats.length - 1)) % formats.length]?.focus();
      return;
    }
    if (targets[event.key] !== undefined) { event.preventDefault(); items[targets[event.key]]?.focus(); }
  };

  const chooseView = (option: View) => { onView(option); setOpen(false); trigger.current?.focus(); };
  return <>
    <button ref={trigger} type="button" className={`pb-led-menu__trigger pb-display-menu--${kind}`} aria-label={menuLabel} aria-haspopup="menu" aria-expanded={open} aria-controls={open ? id : undefined} onClick={() => setOpen(!open)} onKeyDown={(event) => { if (event.key === 'ArrowDown') { event.preventDefault(); setOpen(true); } }}><span aria-hidden="true">•••</span></button>
    {open && createPortal(<div ref={menu} id={id} role="menu" aria-label={menuLabel} className={`pb-led-menu pb-display-menu--${kind}`} style={position} onKeyDown={onMenuKey}>
      {!collapseOnly && <>{(['default', 4, 8] as const).map((option) => <button key={option} type="button" role="menuitemradio" aria-checked={view === option} className="pb-led-menu__item" onClick={() => chooseView(option)}>
        <span className="pb-led-menu__check" aria-hidden="true">{view === option ? '✓' : ''}</span>
        {option === 'default' ? <MenuIcon kind="grid" /> : <span className="pb-led-menu__badge" aria-hidden="true">{option === 4 ? '0x0' : '0x00'}</span>}
        <span>{option === 'default' ? 'Default view' : `Group by ${option}`}</span>
      </button>)}
      <div className="pb-led-menu__divider" role="separator" />
      <div className="pb-led-menu__format-label" id={`${id}-format`}>{name} value format</div>
        <div className="pb-led-menu__formats" role="group" aria-labelledby={`${id}-format`}>
          {(['binary', 'hex', 'decimal'] as const).map((option) => <button key={option} type="button" role="menuitemradio" aria-checked={format === option} onClick={() => { onFormat(option); setOpen(false); trigger.current?.focus(); }}>{option === 'hex' ? 'Hex' : option === 'binary' ? 'Binary' : 'Decimal'}</button>)}
        </div>
        <div className="pb-led-menu__divider" role="separator" />
      <button type="button" role="menuitem" className="pb-led-menu__item" onClick={() => { setOpen(false); onChoose(); }}><span className="pb-led-menu__check" /><MenuIcon kind="eye" /><span>Choose visible {kind === 'leds' ? 'LEDs' : 'switches'}…</span></button>
      </>}
      <button type="button" role="menuitem" className="pb-led-menu__item" onClick={() => { setOpen(false); onCollapse(); }}><span className="pb-led-menu__check" /><MenuIcon kind="collapse" /><span>Collapse to icon</span></button>
    </div>, document.body)}
  </>;
}

export function CollapsePanelMenu({ kind, label, onCollapse }: { kind: 'sevenseg' | 'pushbuttons'; label: string; onCollapse: () => void }) {
  return <DisplayMenu kind={kind} name={label} view="default" format="binary" onFormat={() => {}} onView={() => {}} onChoose={() => {}} onCollapse={onCollapse} collapseOnly />;
}

function MenuIcon({ kind }: { kind: 'grid' | 'eye' | 'collapse' }) {
  return <span className="pb-led-menu__icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{kind === 'grid' ? <><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></> : kind === 'eye' ? <><path d="M2 12s3.5-6.5 10-6.5S22 12 22 12s-3.5 6.5-10 6.5S2 12 2 12Z" /><circle cx="12" cy="12" r="2.5" /></> : <><rect x="3" y="3" width="18" height="18" rx="3" /><path d="M8 12h8" /></>}</svg></span>;
}

interface DialogProps extends Pick<Props, 'kind' | 'name' | 'count'> {
  hidden: number[];
  onCancel: () => void;
  onApply: (hidden: number[]) => void;
}

function VisibilityDialog({ kind, name, count, hidden, onCancel, onApply }: DialogProps) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [draft, setDraft] = useState(hidden);
  useEffect(() => { dialog.current?.showModal(); }, []);
  return <dialog ref={dialog} className={`pb-ui pb-accent-${kind} pb-io-dialog`} onCancel={(event) => { event.preventDefault(); onCancel(); }} aria-labelledby={`visibility-${kind}`}>
    <form onSubmit={(event) => { event.preventDefault(); onApply(draft); }}>
      <h2 id={`visibility-${kind}`}>Choose visible {kind === 'leds' ? 'LEDs' : 'switches'} ({name}[{count - 1}:0])</h2>
      <div className="pb-io-dialog__bits">{Array.from({ length: count }, (_, i) => count - 1 - i).map((index) => <label key={index}>{name}{index}<input type="checkbox" checked={!draft.includes(index)} onChange={(event) => setDraft(event.target.checked ? draft.filter((bit) => bit !== index) : [...draft, index])} /></label>)}</div>
      <div className="pb-io-dialog__actions"><button type="button" onClick={onCancel}>Cancel</button><button type="submit">Apply</button></div>
    </form>
  </dialog>;
}
