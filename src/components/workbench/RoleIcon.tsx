// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import { useEffect, useRef, useState, type RefObject } from 'react';
import { cx } from '../board';
import { ChipIcon, FileIcon, FlaskIcon } from './icons';
import { TEXT } from './testbenchText';
import type { FileRole } from './tbDetect/types';

const ROLE_TITLE: Record<FileRole, string> = {
  tb: TEXT.fileRoleTb,
  rtl: TEXT.fileRoleRtl,
  mixed: TEXT.fileRoleMixed,
};

/**
 * A file's role before its name (docs/impl_split_screen.md § 4.5, D25): the flask
 * for a testbench or a file holding one, the chip for a design, the plain file icon
 * for a file with no units yet. The tooltip spells the role out.
 */
export function RoleIcon({ role, className }: { role: FileRole | undefined; className?: string }) {
  if (role === undefined) return <FileIcon className={cx('wb-roleicon', className)} width={14} height={14} aria-hidden="true" />;
  const Icon = role === 'rtl' ? ChipIcon : FlaskIcon;
  return (
    <span className={cx('wb-roleicon', `is-${role === 'rtl' ? 'rtl' : 'tb'}`, className)} title={ROLE_TITLE[role]}>
      <Icon aria-hidden="true" />
      <span className="wb-sr-only">{ROLE_TITLE[role]}</span>
    </span>
  );
}

/**
 * Open / closed state for a small popover anchored to a button: Escape or a click
 * outside closes it, and Escape hands focus back to the button.
 */
export function usePopover<T extends HTMLElement>(): {
  open: boolean;
  setOpen: (open: boolean) => void;
  rootRef: RefObject<T>;
} {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<T>(null);
  useEffect(() => {
    if (!open) return undefined;
    const onPointer = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      setOpen(false);
      rootRef.current?.querySelector<HTMLElement>('button')?.focus();
    };
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);
  return { open, setOpen, rootRef };
}
