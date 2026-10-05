// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import { useEffect, useId, useLayoutEffect, useRef, type KeyboardEvent, type ReactNode, type RefObject } from 'react';
import { cx } from '../board';
import { rowsByFolder, type FileRow } from './fileRows';
import { FileRowLabel, ProblemMark } from './FileRowLabel';
import { ChevronDownIcon } from './icons';
import { usePopover } from './RoleIcon';
import './FileMenu.css';

const TEXT = {
  switchFile: 'Switch file',
  buttonLabel: (name: string) => `${name}, switch file`,
  folderGroup: (folder: string) => `${folder} folder`,
  newFile: 'New file…',
};

/** The menu never reaches past the editor column's edge by less than this. */
const EDITOR_EDGE_GAP_PX = 8;
const MENU_ITEM = '[role^="menuitem"]';

export interface FileMenuProps {
  /** Every file, in Files order, as fileRows.ts builds them. */
  readonly rows: readonly FileRow[];
  readonly onPick: (fileId: string) => void;
  readonly onNewFile: () => void;
}

export interface FileNameButtonProps {
  /** The file the pane shows. */
  readonly row: FileRow;
  /** Before the name: the role icon in the plain header, nothing beside a role badge. */
  readonly icon?: ReactNode;
  readonly menu: FileMenuProps;
}

/**
 * A pane header's file name: the header's main element, and a button that drops
 * down the project's files (docs/cleanup_file_tabs.md § 5.2, § 5.4) — the menu
 * button pattern the role badge uses too.
 */
export function FileNameButton({ row, icon, menu }: FileNameButtonProps) {
  const popover = usePopover<HTMLSpanElement>();
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuId = useId();
  const dismiss = () => {
    popover.setOpen(false);
    buttonRef.current?.focus();
  };
  const openOnArrowDown = (e: KeyboardEvent) => {
    if (e.key !== 'ArrowDown') return;
    e.preventDefault();
    popover.setOpen(true);
  };
  return (
    <span className="wb-filename" ref={popover.rootRef}>
      <button
        ref={buttonRef}
        type="button"
        className={cx('wb-filename__button', popover.open && 'is-open')}
        aria-haspopup="menu"
        aria-expanded={popover.open}
        aria-controls={popover.open ? menuId : undefined}
        aria-label={TEXT.buttonLabel(row.name)}
        title={TEXT.switchFile}
        onClick={() => popover.setOpen(!popover.open)}
        onKeyDown={openOnArrowDown}
      >
        {icon}
        <span className="wb-filename__text">{row.name}</span>
        <ProblemMark problems={row.problems} />
        <ChevronDownIcon className="wb-filename__chevron" aria-hidden="true" />
      </button>
      {popover.open && <FileMenu id={menuId} {...menu} onClose={() => popover.setOpen(false)} onDismiss={dismiss} />}
    </span>
  );
}

interface FileMenuListProps extends FileMenuProps {
  readonly id: string;
  /** A choice was made: close, focus goes wherever the choice puts it. */
  readonly onClose: () => void;
  /** Left without a choice (Tab): close and hand focus back to the name. */
  readonly onDismiss: () => void;
}

/** Every file grouped by folder as in the Files panel, the shown ones ticked, and New file at the bottom. */
function FileMenu({ id, rows, onPick, onNewFile, onClose, onDismiss }: FileMenuListProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  useFocusShownItem(menuRef);
  useKeepInsideEditor(menuRef);
  const choose = (action: () => void) => {
    onClose();
    action();
  };
  return (
    <div className="wb-menu wb-filemenu" role="menu" id={id} ref={menuRef} onKeyDown={(e) => handleMenuKey(e, onDismiss)}>
      <div className="wb-filemenu__list">
        {rowsByFolder(rows).map(({ folder, rows: inFolder }) => (
          <div key={folder} role="group" aria-label={TEXT.folderGroup(folder)}>
            <div className="wb-filemenu__folder" aria-hidden="true">
              <span className="wb-icon wb-icon--folder" />
              {folder}/
            </div>
            {inFolder.map((row) => (
              <FileMenuItem key={row.id} row={row} onPick={() => choose(() => onPick(row.id))} />
            ))}
          </div>
        ))}
      </div>
      <div className="wb-filemenu__footer">
        <button type="button" role="menuitem" className="wb-menu__item" onClick={() => choose(onNewFile)}>
          <span className="wb-menu__check" aria-hidden="true">
            +
          </span>
          {TEXT.newFile}
        </button>
      </div>
    </div>
  );
}

function FileMenuItem({ row, onPick }: { row: FileRow; onPick: () => void }) {
  return (
    <button type="button" role="menuitemradio" aria-checked={row.shown} className="wb-menu__item wb-filemenu__item" onClick={onPick}>
      <span className="wb-menu__check" aria-hidden="true">
        {row.shown ? '✓' : ''}
      </span>
      <FileRowLabel row={row} />
    </button>
  );
}

/** ↑ ↓ Home End move between the items; Tab leaves the menu (usePopover handles Escape). */
function handleMenuKey(e: KeyboardEvent<HTMLDivElement>, onDismiss: () => void) {
  if (e.key === 'Tab') {
    e.preventDefault();
    onDismiss();
    return;
  }
  const items = [...e.currentTarget.querySelectorAll<HTMLElement>(MENU_ITEM)];
  const next = nextItemIndex(e.key, items.indexOf(document.activeElement as HTMLElement), items.length);
  if (next === undefined) return;
  e.preventDefault();
  items[next].focus();
}

function nextItemIndex(key: string, current: number, count: number): number | undefined {
  const last = count - 1;
  const targets: Record<string, number> = { ArrowDown: Math.min(current + 1, last), ArrowUp: Math.max(current - 1, 0), Home: 0, End: last };
  return targets[key];
}

/** Opening puts focus on the shown file, the menu button pattern's checked item. */
function useFocusShownItem(menuRef: RefObject<HTMLDivElement>) {
  useEffect(() => {
    const menu = menuRef.current;
    const shown = menu?.querySelector<HTMLElement>('[aria-checked="true"]');
    (shown ?? menu?.querySelector<HTMLElement>(MENU_ITEM))?.focus();
  }, [menuRef]);
}

/** A menu opened near the editor's right edge moves left, so it never covers the Board I/O pane. */
function useKeepInsideEditor(menuRef: RefObject<HTMLDivElement>) {
  useLayoutEffect(() => {
    const menu = menuRef.current;
    const editor = menu?.closest('.wb-editor');
    if (!menu || !editor) return;
    menu.style.left = ''; // measure from where the stylesheet puts it, however often this runs
    const overflow = menu.getBoundingClientRect().right - (editor.getBoundingClientRect().right - EDITOR_EDGE_GAP_PX);
    if (overflow > 0) menu.style.left = `${-overflow}px`;
  }, [menuRef]);
}
