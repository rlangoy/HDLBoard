// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import type { RefObject } from 'react';
import { cx } from '../../board';
import { ChevronDownIcon, RefreshIcon, SearchIcon } from '../icons';
import { SORT_ORDERS, type SortOrder } from '../projectCatalog';
import type { ProjectList } from './useProjectList';

const SORT_LABEL: Record<SortOrder, string> = { newest: 'Recently saved', oldest: 'Oldest first', name: 'Name A–Z' };

export interface ListToolbarProps {
  list: ProjectList;
  searchRef: RefObject<HTMLInputElement>;
}

/** Search and sort, where the filter used to be (issue #44): the sidebar says where. */
export function ListToolbar({ list, searchRef }: ListToolbarProps) {
  return (
    <>
      <div className="wb-projects__toolbar">
        <label className="wb-projects__search">
          <SearchIcon aria-hidden="true" />
          <input
            ref={searchRef}
            type="search"
            value={list.query}
            onChange={(event) => list.setQuery(event.target.value)}
            placeholder="Search projects and files…"
            aria-label="Search projects"
            autoComplete="off"
          />
        </label>
        <span className="wb-projects__select">
          <select aria-label="Sort by" value={list.sort} onChange={(event) => list.setSort(event.target.value as SortOrder)}>
            {SORT_ORDERS.map((order) => (
              <option key={order} value={order}>
                {SORT_LABEL[order]}
              </option>
            ))}
          </select>
          <ChevronDownIcon aria-hidden="true" />
        </span>
        <button type="button" className={cx('wb-projects__icon-btn', list.refreshing && 'is-spinning')} onClick={list.refresh} aria-label="Read the list again" title="Read the list again">
          <RefreshIcon aria-hidden="true" />
        </button>
      </div>
      <p className="wb-projects__sr" role="status">
        Showing {list.shown.length} of {list.inSection.length} projects
      </p>
    </>
  );
}
