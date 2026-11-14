// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import type { Advice } from './diagnosticAdvice';
import type { LocatedDiagnostic } from './diagnosticLocation';
import { verilogAdviceText as text } from './diagnosticText';
import { uniqueNearest } from './nearestWord';

const SYSTEM_TASKS = [
  '$display', '$write', '$monitor', '$strobe', '$finish', '$stop', '$time', '$realtime',
  '$random', '$readmemh', '$readmemb', '$dumpfile', '$dumpvars', '$dumpon', '$dumpoff',
  '$clog2', '$signed', '$unsigned', '$bits', '$fatal', '$error', '$warning', '$info',
];

interface MessageRule {
  readonly pattern: RegExp;
  /** `details`: the notes Icarus printed under the message. */
  readonly headline: (groups: Record<string, string>, details: readonly string[]) => string;
}

const WIDTH_ADJUSTMENT = /^(?<action>Pruning|Padding) (?<bits>\d+) high bits of the (?<target>expression|port)\.$/;

const ADJUSTMENT_TEXT: Readonly<Record<string, (bits: string, target: string) => string>> = {
  Pruning: text.highBitsDiscarded,
  Padding: text.highBitsAdded,
};

/** Icarus's own note on how it fits the widths, as a sentence; empty without one. */
function widthAdjustment(details: readonly string[]): string {
  const adjustment = details.map((detail) => WIDTH_ADJUSTMENT.exec(detail)?.groups).find(Boolean);
  return adjustment ? ADJUSTMENT_TEXT[adjustment.action](adjustment.bits, adjustment.target) : '';
}

/** Only measured compiler messages; no inference from a simulation's values. */
const RULES: readonly MessageRule[] = [
  {
    pattern: /^System task\/function (?<name>\$[\w$]+)\(\) is not defined by any module\.$/,
    headline: ({ name }) => text.unknownSystemTask(name, uniqueNearest(name, SYSTEM_TASKS, { caseSensitive: true })),
  },
  {
    pattern: /^Port \d+ \((?<name>[^)]+)\) of (?:module )?(?<module>\S+) expects (?<expected>\d+) bit\(s\), given (?<actual>\d+)\.$/,
    headline: ({ name, module, expected, actual }, details) =>
      text.portWidth(name, module, expected, actual) + widthAdjustment(details),
  },
  {
    pattern: /^Constant bit select \[(?<index>-?\d+)\] is (?:before|after) vector (?<name>.+?)(?<range>\[-?\d+:-?\d+\])\.$/,
    headline: ({ name, range, index }) => text.bitSelect(name, range, index),
  },
  {
    pattern: /^Part select (?<select>\[[^\]]+\]) is selecting (?:before|after) the vector (?<name>.+?)(?<range>\[-?\d+:-?\d+\])\.$/,
    headline: ({ name, range, select }) => text.partSelect(name, range, select),
  },
  {
    pattern: /^part select (?<name>.+?)(?<select>\[[^\]]+\]) is out of order\.$/,
    headline: ({ name, select }) => text.reversedSelect(name, select),
  },
  {
    pattern: /^Wrong number of ports\. Expecting (?:at most )?(?<expected>\d+), got (?<actual>\d+)\.$/,
    headline: ({ expected, actual }) => text.portCount(expected, actual),
  },
  {
    pattern: /^macro (?<name>\S+) undefined \(and assumed null\) at this point\.$/,
    headline: ({ name }) => text.undefinedMacro(name),
  },
  {
    pattern: /^'(?<name>[^']+)' has already been declared in this scope\.$/,
    headline: ({ name }) => text.duplicate(name),
  },
  {
    pattern: /^Numeric constant truncated to (?<bits>\d+) bits\.$/,
    headline: ({ bits }) => text.truncatedLiteral(bits),
  },
];

/** `name` is optional: only underline a compiler-named object when it is on this line. */
export function icarusMessageAdvice(diagnostic: LocatedDiagnostic): (Advice & { readonly name?: string }) | undefined {
  for (const rule of RULES) {
    const groups = rule.pattern.exec(diagnostic.message)?.groups;
    if (groups) return { headline: rule.headline(groups, diagnostic.details), name: groups.name };
  }
  return undefined;
}
