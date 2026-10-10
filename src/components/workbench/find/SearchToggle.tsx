// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import { cx } from '../../board';
import { SearchIcon } from '../icons';
import { usePaneFind } from './FindContext';
import { FIND_TEXT, searchLabel } from './findText';

/**
 * A pane header's Search button, right after Copy (docs/impl_search.md D1, § 5.1):
 * opens and closes this pane's Find bar. Pressed while the bar is open.
 */
export function SearchToggle({ fileName }: { fileName: string }) {
  const find = usePaneFind();
  if (!find) return null;
  return (
    <button
      type="button"
      className={cx('wb-copycode', 'wb-searchtoggle', find.open && 'is-pressed')}
      aria-pressed={find.open}
      aria-label={searchLabel(fileName)}
      title={FIND_TEXT.searchTitle}
      onClick={() => find.toggle()}
    >
      <SearchIcon aria-hidden="true" />
    </button>
  );
}
