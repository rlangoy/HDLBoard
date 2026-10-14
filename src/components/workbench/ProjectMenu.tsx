// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { cx } from '../board';

export interface MenuAction {
  label: string;
  icon: ReactNode;
  onSelect: () => void;
  /** Drawn in red and set apart from the others. */
  danger?: boolean;
  /** A second, muted line under the label. */
  detail?: string;
}

export interface ProjectMenuProps {
  /** The ⋮ button the menu opens from; it gets the focus back when the menu closes. */
  anchor: HTMLElement;
  actions: readonly MenuAction[];
  onClose: () => void;
  /** Shown above the items, not focusable. */
  header?: ReactNode;
}

const GAP = 4;
const EDGE = 8;

/**
 * A small menu below the button that opened it (docs/project_browse_page.md § 4.7): arrow keys
 * move between the items; Escape, Tab, a click outside or scrolling closes it.
 */
export function ProjectMenu({ anchor, actions, onClose, header }: ProjectMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ top: 0, left: 0 });

  useLayoutEffect(() => {
    const menu = menuRef.current;
    if (!menu) return;
    const button = anchor.getBoundingClientRect();
    setPosition({
      top: Math.max(EDGE, Math.min(button.bottom + GAP, window.innerHeight - menu.offsetHeight - EDGE)),
      left: Math.max(EDGE, Math.min(button.right - menu.offsetWidth, window.innerWidth - menu.offsetWidth - EDGE)),
    });
    menu.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
  }, [anchor]);

  useEffect(() => {
    const closeOutside = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node) && !anchor.contains(event.target as Node)) onClose();
    };
    document.addEventListener('pointerdown', closeOutside);
    document.addEventListener('scroll', onClose, true);
    return () => {
      document.removeEventListener('pointerdown', closeOutside);
      document.removeEventListener('scroll', onClose, true);
    };
  }, [anchor, onClose]);

  const close = () => {
    onClose();
    anchor.focus();
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const items = [...event.currentTarget.querySelectorAll<HTMLElement>('[role="menuitem"]')];
    const at = items.indexOf(document.activeElement as HTMLElement);
    const move = (to: number) => {
      event.preventDefault();
      items[(to + items.length) % items.length]?.focus();
    };
    if (event.key === 'ArrowDown') move(at + 1);
    else if (event.key === 'ArrowUp') move(at - 1);
    else if (event.key === 'Home') move(0);
    else if (event.key === 'End') move(items.length - 1);
    else if (event.key === 'Escape') {
      // The page would close too: the menu takes the Escape.
      event.preventDefault();
      event.stopPropagation();
      close();
    } else if (event.key === 'Tab') onClose();
  };

  const choose = (action: MenuAction) => {
    onClose();
    action.onSelect();
  };

  return (
    <div ref={menuRef} className="wb-projects__menu" role="menu" style={position} onKeyDown={handleKeyDown}>
      {header && <div className="wb-projects__menu-head">{header}</div>}
      {actions.map((action, at) => (
        <div key={action.label} role="none">
          {action.danger && at > 0 && <hr className="wb-projects__menu-rule" />}
          <button type="button" role="menuitem" className={cx('wb-projects__menu-item', action.danger && 'is-danger')} onClick={() => choose(action)}>
            {action.icon}
            {action.detail ? (
              <span>
                {action.label}
                <span className="wb-projects__menu-detail">{action.detail}</span>
              </span>
            ) : (
              action.label
            )}
          </button>
        </div>
      ))}
    </div>
  );
}
