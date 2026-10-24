// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * A flat dropdown list: a borderless button with the choice and a chevron, opening a
 * short list below it. It works from the keyboard as a listbox does: ↓, Enter or Space
 * opens it, ↑ / ↓ move, Enter picks, Esc closes; a click outside closes it too.
 */

import { useCallback, useEffect, useId, useRef, useState, type KeyboardEvent, type RefObject } from 'react';
import './FlatSelect.css';

export interface FlatSelectProps<T extends string> {
  readonly value: T;
  readonly options: readonly T[];
  readonly label: string;
  readonly onChange: (value: T) => void;
  /** What an option reads as; left out, the option itself (`ns`). */
  readonly labelOf?: (option: T) => string;
  /** Added to the root's class, for another look (Settings › Board). */
  readonly className?: string;
  readonly disabled?: boolean;
}

type ListAction = 'open' | 'up' | 'down' | 'pick' | 'close';

/** What each key does in the open list: a move by one, a pick, or closing it. */
const LIST_KEYS: Readonly<Record<string, ListAction>> = {
  ArrowUp: 'up',
  ArrowDown: 'down',
  Enter: 'pick',
  ' ': 'pick',
  Escape: 'close',
  Tab: 'close',
};

const OPEN_KEYS = new Set(['ArrowDown', 'ArrowUp', 'Enter', ' ']);

const listAction = (key: string, open: boolean): ListAction | undefined => (open ? LIST_KEYS[key] : OPEN_KEYS.has(key) ? 'open' : undefined);

/** Closes the list on a press anywhere outside `root`. */
function useClickOutside(root: RefObject<HTMLElement>, open: boolean, close: () => void): void {
  useEffect(() => {
    if (!open) return undefined;
    const onDown = (event: MouseEvent) => {
      if (!root.current?.contains(event.target as Node)) close();
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [root, open, close]);
}

function useListbox<T extends string>({ value, options, onChange }: FlatSelectProps<T>) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  // One function for the whole life of the list, so the outside-click listener stays put.
  const close = useCallback(() => setOpen(false), []);
  const openList = () => {
    setActive(Math.max(0, options.indexOf(value)));
    setOpen(true);
  };
  const pick = (index: number) => {
    onChange(options[index]);
    setOpen(false);
  };
  const move = (step: number) => setActive((index) => (index + step + options.length) % options.length);
  const actions: Readonly<Record<ListAction, () => void>> = {
    open: openList,
    up: () => move(-1),
    down: () => move(1),
    pick: () => pick(active),
    close,
  };
  const onKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    const action = listAction(event.key, open);
    if (action === undefined) return;
    // The waveform pane must not also act on these keys (Esc would close it).
    event.stopPropagation();
    if (event.key !== 'Tab') event.preventDefault();
    actions[action]();
  };
  return { open, active, close, openList, pick, onKeyDown };
}

interface OptionListProps<T extends string> {
  readonly id: string;
  readonly label: string;
  readonly options: readonly T[];
  readonly value: T;
  readonly active: number;
  readonly onPick: (index: number) => void;
  readonly labelOf: (option: T) => string;
}

const asItself = <T extends string>(option: T): string => option;

function OptionList<T extends string>({ id, label, options, value, active, onPick, labelOf }: OptionListProps<T>) {
  return (
    <ul className="wv-flat-select__list" id={id} role="listbox" aria-label={label}>
      {options.map((option, index) => (
        <li
          key={option}
          id={`${id}-${index}`}
          role="option"
          aria-selected={option === value}
          className={index === active ? 'is-active' : undefined}
          // Keeps the focus on the button, so the keys still reach the list.
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => onPick(index)}
        >
          {labelOf(option)}
        </li>
      ))}
    </ul>
  );
}

interface SelectButtonProps {
  readonly text: string;
  readonly label: string;
  /** The open list's id, and the id of the option the keys are on; none while it is shut. */
  readonly listId?: string;
  readonly activeId?: string;
  readonly disabled: boolean;
  readonly onClick: () => void;
}

/** The face of the dropdown: the choice and a chevron. */
function SelectButton({ text, label, listId, activeId, disabled, onClick }: SelectButtonProps) {
  return (
    <button
      type="button"
      className="wv-flat-select__button"
      aria-label={label}
      aria-haspopup="listbox"
      aria-expanded={listId !== undefined}
      aria-controls={listId}
      aria-activedescendant={activeId}
      disabled={disabled}
      onClick={onClick}
    >
      <span className="wv-flat-select__value">{text}</span>
      <svg className="wv-flat-select__chevron" viewBox="0 0 10 6" aria-hidden="true">
        <path d="M1 1l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </button>
  );
}

export function FlatSelect<T extends string>(props: FlatSelectProps<T>) {
  const { value, options, label, labelOf = asItself, className, disabled = false } = props;
  const rootRef = useRef<HTMLDivElement>(null);
  const listId = useId();
  const { open, active, close, openList, pick, onKeyDown } = useListbox(props);
  useClickOutside(rootRef, open, close);
  const shown = open && !disabled;
  return (
    <div className={['wv-flat-select', className].filter(Boolean).join(' ')} ref={rootRef} onKeyDown={disabled ? undefined : onKeyDown}>
      <SelectButton
        text={labelOf(value)}
        label={label}
        listId={shown ? listId : undefined}
        activeId={shown ? `${listId}-${active}` : undefined}
        disabled={disabled}
        onClick={() => (open ? close() : openList())}
      />
      {shown && <OptionList id={listId} label={label} options={options} value={value} active={active} onPick={pick} labelOf={labelOf} />}
    </div>
  );
}
