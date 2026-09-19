// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import {
  useEffect,
  useId,
  useRef,
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
} from 'react';
import './Dialog.css';

export interface DialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: ReactNode;
  /** Shown in the white badge at the left of the header band. */
  icon: ReactNode;
  /** `id` of the element inside `children` that best describes the dialog. */
  describedBy?: string;
  /** `wide` (760 px) for content with a table; the default is 560 px. */
  size?: 'default' | 'wide';
  children: ReactNode;
}

const FOCUSABLE = 'a[href], button:not([disabled])';

/**
 * The shared modal shell for the About, Settings and Help dialogs: a blue header
 * band (badge, title, subtitle), a scrolling body and a Close button.
 *
 * Escape or a click on the backdrop closes it. Focus starts on the Close
 * button, is kept inside the dialog while it is open (Tab wraps), and goes
 * back to whatever had it before — so a keyboard user lands back on the
 * header button they opened it from.
 */
export function Dialog({ open, onClose, title, subtitle, icon, describedBy, size = 'default', children }: DialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const titleId = `${useId()}-title`;

  useEffect(() => {
    if (!open) return undefined;
    const previous = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    return () => previous?.focus?.();
  }, [open]);

  if (!open) return null;

  const handleKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      onClose();
      return;
    }
    if (e.key !== 'Tab') return;
    const items = dialogRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE);
    if (!items || items.length === 0) return;
    const first = items[0];
    const last = items[items.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  };

  const handleBackdropMouseDown = (e: MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) onClose();
  };

  return (
    <div className="wb-dialog__backdrop" onMouseDown={handleBackdropMouseDown}>
      <div
        ref={dialogRef}
        className={size === 'wide' ? 'wb-dialog wb-dialog--wide' : 'wb-dialog'}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={describedBy}
        onKeyDown={handleKeyDown}
      >
        <header className="wb-dialog__hero">
          <div className="wb-dialog__badge">{icon}</div>
          <div className="wb-dialog__heading">
            <h2 id={titleId} className="wb-dialog__title">
              {title}
            </h2>
            {subtitle && <p className="wb-dialog__subtitle">{subtitle}</p>}
          </div>
        </header>

        <div className="wb-dialog__body">{children}</div>

        <footer className="wb-dialog__footer">
          <button ref={closeRef} type="button" className="wb-dialog__close" onClick={onClose}>
            Close
          </button>
        </footer>
      </div>
    </div>
  );
}

export default Dialog;
