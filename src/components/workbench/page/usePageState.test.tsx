// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, expectTypeOf, test, vi } from 'vitest';
import type { Overlay } from '../useOverlay';
import { usePageState, type PageState } from './usePageState';

type Section = 'general' | 'editor';

/** The page state as a component on a page showing `overlay` gets it, and every setOverlay call. */
function pageState(overlay: Overlay): { state: PageState<Section>; setOverlay: ReturnType<typeof vi.fn> } {
  const setOverlay = vi.fn();
  let state: PageState<Section> | undefined;
  function Probe() {
    state = usePageState<Section>('settings', 'general', { overlay, setOverlay });
    return null;
  }
  renderToStaticMarkup(<Probe />);
  if (state === undefined) throw new Error('The probe did not render');
  return { state, setOverlay };
}

describe('usePageState', () => {
  test('toggle takes no argument, so a click event passed to it can never be read as a section', () => {
    expectTypeOf<PageState<Section>['toggle']>().parameters.toEqualTypeOf<[]>();
  });

  test('toggle opens the page while it is not shown', () => {
    // Opening remembers what had the focus; there is no page here, so nothing had it.
    vi.stubGlobal('document', { activeElement: null });
    vi.stubGlobal('HTMLElement', class {});
    const { state, setOverlay } = pageState(null);
    (state.toggle as (event: unknown) => void)({ type: 'click' });
    expect(setOverlay).toHaveBeenCalledWith('settings');
    vi.unstubAllGlobals();
  });

  test('toggle closes the page while it is shown, whatever section it shows', () => {
    const { state, setOverlay } = pageState('settings');
    state.toggle();
    expect(setOverlay).toHaveBeenCalledWith(null);
  });

  test('toggleSection closes the page only when it shows that section', () => {
    const shown = pageState('settings');
    shown.state.toggleSection('general');
    expect(shown.setOverlay).toHaveBeenCalledWith(null);

    const other = pageState('settings');
    other.state.toggleSection('editor');
    expect(other.setOverlay).toHaveBeenCalledWith('settings');
  });
});
