// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * A flat dropdown list: a borderless button with the choice and a chevron, opening a
 * short list below it. It works from the keyboard as a listbox does: ↓, Enter or Space
 * opens it, ↑ / ↓ move, Enter picks, Esc closes; a click outside closes it too.
 */

import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';

export interface FlatSelectProps<T extends string> {
  readonly value: T;
  readonly options: readonly T[];
  readonly label: string;
  readonly onChange: (value: T) => void;
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
function useClickOutside(root: React.RefObject<HTMLElement>, open: boolean, close: () => void): void {
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
    close: () => setOpen(false),
  };
  const onKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    const action = listAction(event.key, open);
    if (action === undefined) return;
    // The waveform pane must not also act on these keys (Esc would close it).
    event.stopPropagation();
    if (event.key !== 'Tab') event.preventDefault();
    actions[action]();
  };
  return { open, active, setOpen, openList, pick, onKeyDown };
}

interface OptionListProps<T extends string> {
  readonly id: string;
  readonly label: string;
  readonly options: readonly T[];
  readonly value: T;
  readonly active: number;
  readonly onPick: (index: number) => void;
}

function OptionList<T extends string>({ id, label, options, value, active, onPick }: OptionListProps<T>) {
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
          {option}
        </li>
      ))}
    </ul>
  );
}

export function FlatSelect<T extends string>(props: FlatSelectProps<T>) {
  const { value, options, label } = props;
  const rootRef = useRef<HTMLDivElement>(null);
  const listId = useId();
  const { open, active, setOpen, openList, pick, onKeyDown } = useListbox(props);
  useClickOutside(rootRef, open, () => setOpen(false));
  return (
    <div className="wv-flat-select" ref={rootRef} onKeyDown={onKeyDown}>
      <button
        type="button"
        className="wv-flat-select__button"
        aria-label={label}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-activedescendant={open ? `${listId}-${active}` : undefined}
        onClick={() => (open ? setOpen(false) : openList())}
      >
        {value}
        <svg className="wv-flat-select__chevron" viewBox="0 0 10 6" aria-hidden="true">
          <path d="M1 1l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {open && <OptionList id={listId} label={label} options={options} value={value} active={active} onPick={pick} />}
    </div>
  );
}
