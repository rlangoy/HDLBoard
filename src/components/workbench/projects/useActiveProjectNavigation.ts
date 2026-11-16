// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import { useEffect, useRef, useState } from 'react';
import { isActiveProjectSection, type ProjectsSectionId } from './projectsSections';

/** Where in the active project's page each of its views starts; Overview is its top. */
const VIEW_ANCHORS: Partial<Record<ProjectsSectionId, string>> = { 'active-files': '[data-project-files]' };
/** Add existing files, under Project files: where the sidebar's Add file goes. */
const ADD_EXISTING_FILES_ANCHOR = '[data-add-existing-files]';

/** A click that scrolls: counted, so the same click again scrolls again. */
interface ScrollRequest {
  readonly count: number;
  readonly section: ProjectsSectionId;
  /** What to scroll to; the page's top when undefined. */
  readonly anchor: string | undefined;
}

/** Overview and Files are positions in the same page; repeated clicks scroll again. */
export function useActiveProjectNavigation(section: ProjectsSectionId, onSelect: (section: ProjectsSectionId) => void) {
  const bodyRef = useRef<HTMLDivElement>(null);
  const [request, setRequest] = useState<ScrollRequest>({ count: 0, section, anchor: VIEW_ANCHORS[section] });
  // Set from Add file until its scroll ran: a folded Add files card has no size to scroll to.
  const [unfoldingAddFiles, setUnfoldingAddFiles] = useState(false);
  useEffect(() => {
    if (!isActiveProjectSection(section)) return;
    // A section shown from elsewhere (Rename… opens Overview) starts where its view does.
    const anchor = request.section === section ? request.anchor : VIEW_ANCHORS[section];
    if (bodyRef.current) scrollPaneTo(bodyRef.current, anchor);
    setUnfoldingAddFiles(false);
  }, [section, request]);

  const scrollTo = (next: ProjectsSectionId, anchor: string | undefined) => {
    setRequest(({ count }) => ({ count: count + 1, section: next, anchor }));
    onSelect(next);
  };
  return {
    bodyRef,
    /** Add files is to unfold: the sidebar's Add file goes to it. */
    unfoldingAddFiles,
    select: (next: ProjectsSectionId) => scrollTo(next, VIEW_ANCHORS[next]),
    /** Files, scrolled on to Add existing files. */
    showAddExistingFiles: () => {
      setUnfoldingAddFiles(true);
      scrollTo('active-files', ADD_EXISTING_FILES_ANCHOR);
    },
  };
}

/**
 * Scrolls the content pane around `body` to `anchor` in it, or to its top. Only the pane
 * scrolls, leaving the sidebar and outer workspace in place.
 */
function scrollPaneTo(body: HTMLElement, anchor: string | undefined) {
  const viewport = body.closest('.wb-scroll__viewport');
  if (!viewport) return;
  if (anchor === undefined) {
    viewport.scrollTo({ top: 0, behavior: 'instant' });
    return;
  }
  const target = body.querySelector<HTMLElement>(anchor);
  if (!target) return;
  const top = viewport.scrollTop + target.getBoundingClientRect().top - viewport.getBoundingClientRect().top;
  viewport.scrollTo({ top, behavior: 'instant' });
}
