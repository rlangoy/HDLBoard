// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy
import type { ComponentKey } from '../../../boards/boardEditorFields';
import { ClockIcon, InfoIcon, LinkIcon, RefreshIcon } from '../icons';

export function ComponentIcon({ component }: { component: ComponentKey }) {
  const shared = { clock: ClockIcon, information: InfoIcon, resources: LinkIcon, resetButton: RefreshIcon };
  if (component in shared) {
    const Icon = shared[component as keyof typeof shared];
    return <Icon className={`bce-icon bce-icon--${component}`} aria-hidden="true" />;
  }
  return <svg className={`bce-icon bce-icon--${component}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {component === 'switches' && <><rect x="3" y="3" width="18" height="18" rx="4" /><path d="M8 7v10m8-10v10" /><path d="M6 9h4m4 6h4" strokeWidth="3.5" /></>}
    {component === 'leds' && <><rect x="3" y="3" width="18" height="18" rx="5" fill="currentColor" fillOpacity=".14" /><rect x="6" y="6" width="12" height="12" rx="3" fill="currentColor" /><path d="M9 9h4" stroke="white" strokeOpacity=".8" /></>}
    {component === 'pushbuttons' && <><path d="M8 6h8c3 0 4 3 5 9 .6 4-2 4-4 1H7c-2 3-4.6 3-4-1C4 9 5 6 8 6Z" /><path d="M6 11h4m-2-2v4" /><circle cx="16" cy="10" r=".7" fill="currentColor" /><circle cx="18" cy="13" r=".7" fill="currentColor" /></>}
    {component === 'sevenSegment' && <><rect x="4" y="1" width="16" height="22" rx="3" /><path d="M9 5h6m-6 7h6m-6 7h6M8 6v4m8-4v4m-8 4v4m8-4v4" strokeWidth="2" /><circle cx="18" cy="20" r=".5" fill="currentColor" /></>}
  </svg>;
}
