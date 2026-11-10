// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import type { OpenProjectInfo } from './openProject';
import type { UnsavedAnswer } from './UnsavedChangesDialog';
import { useLeaveOpenProject, type LeaveOpenProjectInput, type OpenNow } from './useLeaveOpenProject';

const info = (unsaved: boolean): OpenProjectInfo => ({
  name: 'Counter',
  description: '',
  files: [],
  location: 'projects/Counter.hdlboard.json',
  gistId: undefined,
  onComputer: true,
  changedSinceLocalSave: unsaved,
  syncState: 'not-on-github',
  destination: 'local',
  unsaved,
});

/** The leave function as Workbench gets it, with spies for what it calls. */
function leaveWith(openNow: Partial<OpenNow>, answers: readonly UnsavedAnswer[]) {
  const queue = [...answers];
  const input: LeaveOpenProjectInput = {
    openNow: { info: info(true), name: 'Counter', needsName: false, save: vi.fn(async () => true), ...openNow },
    ask: vi.fn(async () => queue.shift() ?? 'cancel'),
    askForName: vi.fn(),
    logError: vi.fn(),
  };
  let leave: ((opening: string) => Promise<boolean>) | undefined;
  function Probe() {
    leave = useLeaveOpenProject(input);
    return null;
  }
  renderToStaticMarkup(<Probe />);
  if (leave === undefined) throw new Error('The probe did not render');
  return { leave, input };
}

beforeEach(() => vi.stubGlobal('requestAnimationFrame', (run: () => void) => setTimeout(run, 0)));
afterEach(() => vi.unstubAllGlobals());

describe('useLeaveOpenProject', () => {
  test('goes on without asking when nothing is unsaved', async () => {
    const { leave, input } = leaveWith({ info: info(false) }, []);
    expect(await leave('Adder')).toBe(true);
    expect(input.ask).not.toHaveBeenCalled();
  });

  test('Discard changes goes on; Cancel does not', async () => {
    expect(await leaveWith({}, ['discard']).leave('Adder')).toBe(true);
    expect(await leaveWith({}, ['cancel']).leave('Adder')).toBe(false);
  });

  test('Save on a project without a name asks for the name and does not go on', async () => {
    const { leave, input } = leaveWith({ needsName: true }, ['save']);
    expect(await leave('Adder')).toBe(false);
    expect(input.askForName).toHaveBeenCalled();
    expect(input.openNow.save).not.toHaveBeenCalled();
  });

  test('a save that fails does not go on', async () => {
    const { leave } = leaveWith({ save: async () => false }, ['save']);
    expect(await leave('Adder')).toBe(false);
  });

  test('still unsaved after the save (edited while it saved): asks again', async () => {
    const { leave, input } = leaveWith({}, ['save', 'cancel']);
    expect(await leave('Adder')).toBe(false);
    expect(input.ask).toHaveBeenCalledTimes(2);
  });
});
