// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import { useEffect, useRef } from 'react';
import { cx } from '../../board';
import { EditIcon } from '../icons';

export interface AutoTextAreaProps {
  value: string;
  onChange: (value: string) => void;
  minRows: number;
  id?: string;
  placeholder?: string;
  ariaLabel?: string;
  /** A small pencil inside the field while it is empty. */
  pencilWhenEmpty?: boolean;
}

/** A textarea as tall as its text, so a description is read without scrolling inside it. */
export function AutoTextArea({ value, onChange, minRows, id, placeholder, ariaLabel, pencilWhenEmpty }: AutoTextAreaProps) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => fitHeight(ref.current), [value]);
  useRefitOnResize(ref);
  const pencil = pencilWhenEmpty === true && value === '';
  return (
    <span className="wb-active__pencil-wrap">
      <textarea
        ref={ref}
        id={id}
        className={cx('wb-active__field wb-active__textarea', pencil && 'has-pencil')}
        value={value}
        rows={minRows}
        placeholder={placeholder}
        aria-label={ariaLabel}
        onChange={(event) => onChange(event.target.value)}
      />
      {pencil && <EditIcon className="wb-active__pencil" aria-hidden="true" />}
    </span>
  );
}

/** A change of width rewraps the text: the column narrowing, or the page first laid out. */
function useRefitOnResize(ref: { current: HTMLTextAreaElement | null }) {
  useEffect(() => {
    const area = ref.current;
    if (!area) return undefined;
    let width = area.clientWidth;
    const observer = new ResizeObserver(() => {
      if (area.clientWidth === width) return;
      width = area.clientWidth;
      fitHeight(area);
    });
    observer.observe(area);
    return () => observer.disconnect();
  }, [ref]);
}

/** Makes a textarea exactly as tall as its text (its border included). */
function fitHeight(area: HTMLTextAreaElement | null) {
  if (!area) return;
  area.style.height = 'auto';
  const border = area.offsetHeight - area.clientHeight;
  area.style.height = `${area.scrollHeight + border}px`;
}
