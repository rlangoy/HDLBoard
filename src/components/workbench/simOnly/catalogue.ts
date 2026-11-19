// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/** Every simulation-only construct, per language (docs/impl_sim_only_warnings.md § 3.1). */

import type { Language } from '../tbDetect/types';
import type { SimOnlyConstruct } from './constructs';
import { VERILOG_CONSTRUCTS } from './verilogConstructs';
import { VHDL_CONSTRUCTS } from './vhdlConstructs';

export const CONSTRUCTS: Readonly<Record<Language, readonly SimOnlyConstruct[]>> = {
  vhdl: VHDL_CONSTRUCTS,
  verilog: VERILOG_CONSTRUCTS,
};
