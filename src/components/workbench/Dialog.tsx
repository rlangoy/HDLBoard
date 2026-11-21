// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import {
  useEffect,
  useId,
  useRef,
  type MutableRefObject,
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
} from 'react';
import './Dialog.css';
import { CloseButton } from './CloseButton';

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
  variant?: 'board-json';
  /** Replaces the Close button, for a dialog that asks for something (New File). */
  footer?: ReactNode;
  children: ReactNode;
}

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled])';

/**
 * The shared modal shell for the About, Settings and Help dialogs: a blue header
 * band (badge, title, subtitle), a scrolling body and a Close button.
 *
 * Escape or a click on the backdrop closes it. Focus starts on the Close
 * button (or on an `autoFocus` field when `footer` replaces it), is kept
 * inside the dialog while it is open (Tab wraps), and goes
 * back to whatever had it before — so a keyboard user lands back on the
 * header button they opened it from.
 */
export function Dialog({ open, onClose, title, subtitle, icon, describedBy, size = 'default', variant, footer, children }: DialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const titleId = `${useId()}-title`;
  const { opener, inside } = useFocusAnchors(open);

  // Each setup puts focus in the dialog, each cleanup gives it back to the opener. Strict
  // Mode runs setup, cleanup, setup: the second setup must take the focus back again, or
  // it stays on the opener and Escape (handled on the dialog) never arrives.
  useEffect(() => {
    if (!open) return undefined;
    const previous = opener.current;
    inside.current ??= focusedWithin(dialogRef.current);
    (closeRef.current ?? inside.current)?.focus();
    return () => previous?.focus?.();
  }, [open, opener, inside]);

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
        className={`wb-dialog${size === 'wide' ? ' wb-dialog--wide' : ''}${variant ? ` wb-dialog--${variant}` : ''}`}
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
          {variant === 'board-json' && <CloseButton label="Close Board JSON" hint="Close" onClick={onClose} />}
        </header>

        <div className="wb-dialog__body">{children}</div>

        <footer className="wb-dialog__footer">
          {footer ?? (
            <button ref={closeRef} type="button" className="wb-dialog__close" onClick={onClose}>
              Close
            </button>
          )}
        </footer>
      </div>
    </div>
  );
}

interface FocusAnchors {
  /** What had focus when the dialog opened: focus goes back there when it closes. */
  readonly opener: MutableRefObject<HTMLElement | null>;
  /** What first had focus inside the dialog (an `autoFocus` button or field), once known. */
  readonly inside: MutableRefObject<HTMLElement | null>;
}

/**
 * The opener is read while the dialog renders: by the time an effect runs, an `autoFocus`
 * button in the footer already has the focus, and focus would go back to that button
 * instead of to the control that opened the dialog. Both are forgotten at each opening.
 */
function useFocusAnchors(open: boolean): FocusAnchors {
  const opener = useRef<HTMLElement | null>(null);
  const inside = useRef<HTMLElement | null>(null);
  const wasOpen = useRef(false);
  if (open && !wasOpen.current) {
    opener.current = focusedElement();
    inside.current = null;
  }
  wasOpen.current = open;
  return { opener, inside };
}

/** No document when the dialog is rendered to markup (the tests): nothing has focus. */
function focusedElement(): HTMLElement | null {
  return typeof document === 'undefined' ? null : (document.activeElement as HTMLElement | null);
}

function focusedWithin(dialog: HTMLElement | null): HTMLElement | null {
  const focused = focusedElement();
  return focused && dialog?.contains(focused) ? focused : null;
}

export default Dialog;
