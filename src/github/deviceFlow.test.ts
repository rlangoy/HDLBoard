// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import { describe, expect, it } from 'vitest';
import type { AuthPost } from './authProxy';
import { DeviceFlowSignIn, type Clock, type DeviceCode } from './deviceFlow';
import { SignInError } from './signInError';

const START = new Date('2026-10-09T08:00:00Z');

/** A clock whose sleep only moves time forward. */
function fakeClock(): Clock {
  let now = START.getTime();
  return {
    now: () => new Date(now),
    sleep: async (seconds) => {
      now += seconds * 1000;
    },
  };
}

/** Answers the access-token polls in order. */
function pollAnswers(...answers: Record<string, unknown>[]): AuthPost {
  return async () => answers.shift() ?? { error: 'authorization_pending' };
}

const CODE: DeviceCode = {
  deviceCode: 'device',
  userCode: 'ABCD-1234',
  verificationUri: 'https://github.com/login/device',
  expiresAt: new Date(START.getTime() + 60_000),
  intervalSeconds: 5,
};

async function signInErrorKind(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (error) {
    return (error as SignInError).kind;
  }
  return 'no error';
}

describe('DeviceFlowSignIn', () => {
  it('reads the user code', async () => {
    const post: AuthPost = async () => ({ device_code: 'd', user_code: 'ABCD-1234', expires_in: 900, interval: 5 });
    const code = await new DeviceFlowSignIn('client', post, fakeClock()).requestCode();
    expect(code.userCode).toBe('ABCD-1234');
  });

  it('reports a disabled device flow as an app setting problem', async () => {
    const post: AuthPost = async () => ({ error: 'device_flow_disabled' });
    expect(await signInErrorKind(new DeviceFlowSignIn('client', post).requestCode())).toBe('app-settings');
  });

  it('keeps polling until the user approves', async () => {
    const post = pollAnswers({ error: 'authorization_pending' }, { error: 'slow_down', interval: 10 }, { access_token: 'tok' });
    expect(await new DeviceFlowSignIn('client', post, fakeClock()).waitForAccessToken(CODE)).toBe('tok');
  });

  it('stops when the user declines', async () => {
    const signIn = new DeviceFlowSignIn('client', pollAnswers({ error: 'access_denied' }), fakeClock());
    expect(await signInErrorKind(signIn.waitForAccessToken(CODE))).toBe('denied');
  });

  it('stops when the code expires', async () => {
    const signIn = new DeviceFlowSignIn('client', pollAnswers(), fakeClock());
    expect(await signInErrorKind(signIn.waitForAccessToken(CODE))).toBe('expired');
  });

  it('stops when cancelled', async () => {
    const controller = new AbortController();
    controller.abort();
    const signIn = new DeviceFlowSignIn('client', pollAnswers({ access_token: 'tok' }), fakeClock());
    expect(await signInErrorKind(signIn.waitForAccessToken(CODE, controller.signal))).toBe('cancelled');
  });
});
