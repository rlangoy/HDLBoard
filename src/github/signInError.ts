// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

export type SignInErrorKind = 'cancelled' | 'denied' | 'expired' | 'app-settings' | 'popup-blocked' | 'unavailable' | 'unexpected';

export class SignInError extends Error {
  constructor(
    readonly kind: SignInErrorKind,
    message: string,
  ) {
    super(message);
    this.name = 'SignInError';
  }
}

export function cancelledError(): SignInError {
  return new SignInError('cancelled', 'Sign-in was cancelled.');
}

/** Turns an OAuth error answer from GitHub (or from the backend's sign-in routes) into a message for the user. */
export function toSignInError(answer: Record<string, unknown>): SignInError {
  const description = typeof answer.error_description === 'string' ? `: ${answer.error_description}` : '';
  switch (answer.error) {
    case 'access_denied':
      return new SignInError('denied', 'Access was not approved on GitHub.');
    case 'expired_token':
    case 'bad_verification_code':
      return new SignInError('expired', 'The sign-in took too long or was already used. Sign in again.');
    case 'device_flow_disabled':
    case 'incorrect_client_credentials':
    case 'redirect_uri_mismatch':
    case 'unsupported_grant_type':
    case 'client_not_allowed':
    case 'web_flow_not_configured':
      return new SignInError('app-settings', `GitHub did not accept HDLBoard's sign-in settings (${String(answer.error)})${description}.`);
    case 'bad_gateway':
      return new SignInError('unavailable', 'The HDLBoard server could not reach github.com. Try again later.');
    default:
      return new SignInError('unexpected', `Sign-in failed (${String(answer.error ?? 'no token')})${description}.`);
  }
}
