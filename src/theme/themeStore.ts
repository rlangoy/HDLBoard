// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy
import { applyTheme } from './applyTheme';
import { subscribeSystemTheme, systemPrefersDark } from './systemTheme';
import {
  DEFAULT_THEME_PREFERENCE, loadThemePreference, resolveTheme, saveThemePreference,
  type ResolvedTheme, type ThemePreference,
} from './themePreference';

export interface ThemeState {
  readonly preference: ThemePreference;
  readonly resolved: ResolvedTheme;
  /** The last choice could not be stored; it holds for this session only. */
  readonly saveFailed: boolean;
}

type Listener = () => void;

const listeners = new Set<Listener>();
let state: ThemeState = { preference: DEFAULT_THEME_PREFERENCE, resolved: 'light', saveFailed: false };

function stateFor(preference: ThemePreference, saveFailed: boolean): ThemeState {
  return { preference, resolved: resolveTheme(preference, systemPrefersDark()), saveFailed };
}

function publish(next: ThemeState): void {
  state = next;
  applyTheme(next.resolved);
  listeners.forEach((listener) => listener());
}

function onSystemThemeChange(): void {
  if (state.preference === 'system') publish(stateFor('system', state.saveFailed));
}

/** Call once, before the first render. Returns the function that stops observing the OS. */
export function startTheme(): () => void {
  publish(stateFor(loadThemePreference(), false));
  return subscribeSystemTheme(onSystemThemeChange);
}

export function chooseTheme(preference: ThemePreference): void {
  const saved = saveThemePreference(preference);
  publish(stateFor(preference, !saved));
}

export function getThemeState(): ThemeState {
  return state;
}

export function subscribeTheme(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
