// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy
import { expect, it, vi } from 'vitest';
import { createNavigator, type LeaveGuard } from './overlayNavigator';

const askFirst = (): { guard: LeaveGuard; answer: () => void } => {
  let waiting: (() => void) | undefined;
  return { guard: (proceed) => { waiting = proceed; }, answer: () => waiting?.() };
};

it('runs an action at once when no guard is registered', () => {
  const action = vi.fn();
  createNavigator(() => true).navigate(action);
  expect(action).toHaveBeenCalledOnce();
});

it('runs an action at once while the guarded view is not shown', () => {
  const navigator = createNavigator(() => false);
  const action = vi.fn();
  navigator.registerGuard(askFirst().guard);
  navigator.navigate(action);
  expect(action).toHaveBeenCalledOnce();
});

it('holds an action until the guard agrees', () => {
  const navigator = createNavigator(() => true);
  const question = askFirst();
  const action = vi.fn();
  navigator.registerGuard(question.guard);
  navigator.navigate(action);
  expect(action).not.toHaveBeenCalled();
  question.answer();
  expect(action).toHaveBeenCalledOnce();
});

it('does not ask again for navigation started by an agreed action', () => {
  const navigator = createNavigator(() => true);
  const question = askFirst();
  const nested = vi.fn();
  navigator.registerGuard(question.guard);
  navigator.navigate(() => navigator.navigate(nested));
  question.answer();
  expect(nested).toHaveBeenCalledOnce();
});

it('asks again for a later navigation', () => {
  const navigator = createNavigator(() => true);
  const question = askFirst();
  const later = vi.fn();
  navigator.registerGuard(question.guard);
  navigator.navigate(() => {});
  question.answer();
  navigator.navigate(later);
  expect(later).not.toHaveBeenCalled();
});

it('stops asking once the guard is unregistered', () => {
  const navigator = createNavigator(() => true);
  const action = vi.fn();
  navigator.registerGuard(askFirst().guard);
  navigator.registerGuard(null);
  navigator.navigate(action);
  expect(action).toHaveBeenCalledOnce();
});

it('keeps asking after an agreed action throws', () => {
  const navigator = createNavigator(() => true);
  const question = askFirst();
  navigator.registerGuard(question.guard);
  navigator.navigate(() => { throw new Error('boom'); });
  expect(() => question.answer()).toThrow('boom');
  const later = vi.fn();
  navigator.navigate(later);
  expect(later).not.toHaveBeenCalled();
});
