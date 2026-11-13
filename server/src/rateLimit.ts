// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import { MS_PER_MINUTE, MS_PER_SECOND } from './sessionLimit.js';

/** A refillable budget of tokens. A clock that goes back mints none. */
export class TokenBucket {
  private tokens: number;
  private updatedAt: number;

  /** `capacity` tokens, refilled at `perMs` tokens a millisecond, on `now`'s clock (ms). */
  private constructor(
    private readonly perMs: number,
    private readonly capacity: number,
    private readonly now: () => number,
  ) {
    this.tokens = capacity;
    this.updatedAt = now();
  }

  static perSecond(rate: number, capacity: number, now: () => number): TokenBucket {
    return new TokenBucket(rate / MS_PER_SECOND, capacity, now);
  }

  static perMinute(rate: number, capacity: number, now: () => number): TokenBucket {
    return new TokenBucket(rate / MS_PER_MINUTE, capacity, now);
  }

  /** Takes `cost` tokens if there are that many. */
  take(cost = 1): boolean {
    this.refill();
    if (cost > this.tokens) return false;
    this.tokens -= cost;
    return true;
  }

  private refill(): void {
    const at = Math.max(this.updatedAt, this.now());
    this.tokens = Math.min(this.capacity, this.tokens + (at - this.updatedAt) * this.perMs);
    this.updatedAt = at;
  }
}

const MAX_ADDRESSES = 10_000;

export interface UpgradeLimits {
  /** Upgrades per address and minute, all of them at once at most. */
  readonly perMinute: number;
  readonly now: () => number;
  /** How many addresses are remembered. Defaults to 10,000. */
  readonly maxAddresses?: number;
}

/**
 * WebSocket upgrades per client address. Its memory is bounded: past `maxAddresses`, the
 * address seen longest ago is forgotten and starts again with a full budget when it comes
 * back. Forgetting one takes `maxAddresses` other addresses, so it buys an attacker less
 * than it costs, and no address is ever refused for want of room.
 */
export class UpgradeLimiter {
  /** In the order last seen: the first is the one seen longest ago. */
  private readonly budgets = new Map<string, TokenBucket>();

  constructor(private readonly limits: UpgradeLimits) {}

  /** Spends one upgrade of `address`'s budget, if it has one left. */
  take(address: string): boolean {
    return this.budgetOf(address).take();
  }

  private budgetOf(address: string): TokenBucket {
    const budget = this.budgets.get(address) ?? this.newBudget();
    this.budgets.delete(address);
    this.budgets.set(address, budget);
    if (this.budgets.size > (this.limits.maxAddresses ?? MAX_ADDRESSES)) this.forgetLongestUnseen();
    return budget;
  }

  private newBudget(): TokenBucket {
    const { perMinute, now } = this.limits;
    return TokenBucket.perMinute(perMinute, perMinute, now);
  }

  private forgetLongestUnseen(): void {
    const [longestUnseen] = this.budgets.keys();
    this.budgets.delete(longestUnseen);
  }
}
