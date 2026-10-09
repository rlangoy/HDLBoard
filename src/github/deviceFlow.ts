// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import type { AuthPost } from './authProxy';
import { GIST_SCOPE } from './config';
import { cancelledError, SignInError, toSignInError } from './signInError';

/**
 * GitHub's OAuth device flow: the user types (pastes) a short code on
 * github.com/login/device and clicks Authorize. It needs no client secret, so it
 * works on every HDLBoard server and in the Windows app. GitHub offers no link
 * that fills the code in.
 */

const DEVICE_GRANT_TYPE = 'urn:ietf:params:oauth:grant-type:device_code';
const DEFAULT_VERIFICATION_URI = 'https://github.com/login/device';
const DEFAULT_EXPIRES_IN_SECONDS = 900;
const DEFAULT_INTERVAL_SECONDS = 5;
const SLOW_DOWN_EXTRA_SECONDS = 5;

export interface DeviceCode {
  deviceCode: string;
  userCode: string;
  verificationUri: string;
  expiresAt: Date;
  intervalSeconds: number;
}

export interface Clock {
  now(): Date;
  sleep(seconds: number): Promise<void>;
}

export const systemClock: Clock = {
  now: () => new Date(),
  sleep: (seconds) => new Promise((resolve) => setTimeout(resolve, seconds * 1000)),
};

export class DeviceFlowSignIn {
  constructor(
    private readonly clientId: string,
    private readonly post: AuthPost,
    private readonly clock: Clock = systemClock,
  ) {}

  async requestCode(): Promise<DeviceCode> {
    const answer = await this.post('device/code', { client_id: this.clientId, scope: GIST_SCOPE });
    if (typeof answer.device_code !== 'string' || typeof answer.user_code !== 'string') throw toSignInError(answer);
    const expiresInSeconds = Number(answer.expires_in ?? DEFAULT_EXPIRES_IN_SECONDS);
    return {
      deviceCode: answer.device_code,
      userCode: answer.user_code,
      verificationUri: String(answer.verification_uri ?? DEFAULT_VERIFICATION_URI),
      expiresAt: new Date(this.clock.now().getTime() + expiresInSeconds * 1000),
      intervalSeconds: Number(answer.interval ?? DEFAULT_INTERVAL_SECONDS),
    };
  }

  /** Polls until the user approves on GitHub, declines, or the code expires. */
  async waitForAccessToken(code: DeviceCode, signal?: AbortSignal): Promise<string> {
    let intervalSeconds = code.intervalSeconds;
    for (;;) {
      await this.clock.sleep(intervalSeconds);
      throwIfCancelled(signal);
      if (this.clock.now() >= code.expiresAt) throw new SignInError('expired', 'The code expired before it was approved. Sign in again.');

      const answer = await this.pollOnce(code);
      throwIfCancelled(signal);
      if (typeof answer.access_token === 'string') return answer.access_token;
      if (answer.error === 'slow_down') intervalSeconds = Number(answer.interval ?? intervalSeconds + SLOW_DOWN_EXTRA_SECONDS);
      else if (answer.error !== 'authorization_pending') throw toSignInError(answer);
    }
  }

  private pollOnce(code: DeviceCode): Promise<Record<string, unknown>> {
    return this.post('device/token', {
      client_id: this.clientId,
      device_code: code.deviceCode,
      grant_type: DEVICE_GRANT_TYPE,
    });
  }
}

function throwIfCancelled(signal: AbortSignal | undefined): void {
  if (signal?.aborted) throw cancelledError();
}
